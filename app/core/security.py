import hashlib
import hmac
import secrets
import bcrypt
import jwt
from datetime import datetime, timedelta, timezone
from app.core.config import settings


# ── API Key helpers ───────────────────────────────────────────────────────────

def generate_api_key() -> str:
    """Generate a cryptographically secure, URL-safe API key."""
    return "sk_" + secrets.token_urlsafe(32)

def get_api_key_hash(api_key: str) -> str:
    """SHA-256 deterministic hash for fast DB lookup."""
    return hashlib.sha256((api_key + settings.API_KEY_SECRET).encode("utf-8")).hexdigest()

def verify_api_key(plain_api_key: str, hashed_api_key: str) -> bool:
    try:
        return hmac.compare_digest(get_api_key_hash(plain_api_key), hashed_api_key)
    except Exception:
        return False


# ── Password helpers ──────────────────────────────────────────────────────────

def hash_password(plain_password: str) -> str:
    """Bcrypt-hash a user password for safe storage."""
    return bcrypt.hashpw(plain_password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return bcrypt.checkpw(plain_password.encode("utf-8"), hashed_password.encode("utf-8"))
    except Exception:
        return False


# ── JWT helpers ───────────────────────────────────────────────────────────────

def create_access_token(user_id: int) -> str:
    """Create a short-lived JWT for dashboard access (not API access)."""
    expire = datetime.now(timezone.utc) + timedelta(hours=settings.JWT_EXPIRATION_HOURS)
    payload = {"sub": str(user_id), "exp": expire}
    return jwt.encode(payload, settings.JWT_SECRET_KEY, algorithm=settings.JWT_ALGORITHM)

def decode_access_token(token: str) -> int | None:
    """Decode a JWT and return the user_id (sub), or None if invalid/expired."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        return int(payload["sub"])
    except jwt.PyJWTError:
        return None


# ── OTP helpers ───────────────────────────────────────────────────────────────

def generate_otp() -> str:
    """Generate a cryptographically secure 6-digit OTP."""
    return str(secrets.randbelow(900000) + 100000)
