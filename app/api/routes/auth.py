from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from pydantic import BaseModel, EmailStr
from app.api.deps import get_db, get_redis
from app.models.user import User
from app.core.security import (
    hash_password, verify_password,
    get_api_key_hash, generate_api_key,
    generate_otp, create_access_token, decode_access_token,
)
from app.services.email import EmailService
import structlog

logger = structlog.get_logger(__name__)
router = APIRouter(prefix="/auth", tags=["auth"])

OTP_TTL = 600  # 10 minutes


# ── Pydantic Schemas ─────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    password: str

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class LoginRequest(BaseModel):
    email: EmailStr
    password: str

class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"

class DashboardResponse(BaseModel):
    email: str
    api_key: str  # The plain-text API key is returned ONCE at registration


# ── Endpoints ────────────────────────────────────────────────────────────────

@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(
    body: RegisterRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Step 1: Register with email + password. Sends an OTP to the email."""
    result = await db.execute(select(User).where(User.email == body.email))
    existing = result.scalars().first()
    if existing and existing.is_verified:
        raise HTTPException(status_code=400, detail="Email already registered.")

    # Hash password and upsert unverified user
    pw_hash = hash_password(body.password)
    if existing:
        existing.password_hash = pw_hash  # update password if they retry
        user = existing
    else:
        user = User(email=body.email, password_hash=pw_hash)
        db.add(user)
    await db.commit()
    await db.refresh(user)

    # Generate OTP, store in Redis with TTL
    otp = generate_otp()
    await redis.setex(f"otp:{body.email}", OTP_TTL, otp)

    # Send via Resend
    await EmailService.send_otp(body.email, otp)

    logger.info("registration_otp_sent", email=body.email)
    return {"message": "OTP sent to your email. Please verify to activate your account."}


@router.post("/verify-otp", response_model=DashboardResponse)
async def verify_otp(
    body: VerifyOTPRequest,
    db: AsyncSession = Depends(get_db),
    redis=Depends(get_redis),
):
    """Step 2: Verify OTP. Activates the account and returns the API key ONCE."""
    stored_otp = await redis.get(f"otp:{body.email}")
    if isinstance(stored_otp, bytes):
        stored_otp = stored_otp.decode()
    if not stored_otp or stored_otp != body.otp:
        raise HTTPException(status_code=400, detail="Invalid or expired OTP.")

    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")

    # Generate a new API key
    plain_api_key = generate_api_key()
    user.api_key_hash = get_api_key_hash(plain_api_key)
    user.is_verified = True
    await db.commit()

    # OTP consumed — delete from Redis
    await redis.delete(f"otp:{body.email}")

    logger.info("user_verified", email=body.email, user_id=user.id)
    return DashboardResponse(email=user.email, api_key=plain_api_key)


@router.post("/login", response_model=AuthResponse)
async def login(
    body: LoginRequest,
    db: AsyncSession = Depends(get_db),
):
    """Login with email + password. Returns a JWT for accessing the dashboard."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalars().first()

    if not user or not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Account not verified. Please check your email for the OTP.")

    token = create_access_token(user.id)
    logger.info("user_logged_in", email=body.email, user_id=user.id)
    return AuthResponse(access_token=token)


bearer_scheme = HTTPBearer()

async def get_jwt_user(
    credentials: HTTPAuthorizationCredentials = Depends(bearer_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    user_id = decode_access_token(credentials.credentials)
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid or expired token.")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalars().first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


@router.get("/me")
async def get_my_dashboard(user: User = Depends(get_jwt_user)):
    """Protected: returns the hashed API key reference for the dashboard."""
    # We store only the hash; we can't return the plain key after registration.
    # The frontend should cache the key returned at /verify-otp.
    return {
        "email": user.email,
        "api_key_set": user.api_key_hash is not None,
        "is_verified": user.is_verified,
    }


@router.post("/regenerate-key")
async def regenerate_api_key(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_jwt_user)
):
    """Protected: Regenerates the user's API key and returns the new plain-text key once."""
    plain_api_key = generate_api_key()
    user.api_key_hash = get_api_key_hash(plain_api_key)
    await db.commit()
    
    logger.info("api_key_regenerated", email=user.email, user_id=user.id)
    return {
        "email": user.email,
        "api_key": plain_api_key
    }

