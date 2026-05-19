from fastapi import Security, HTTPException, status, Depends
from fastapi.security import APIKeyHeader
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from app.models.user import User
from app.api.deps import get_db
from app.core.security import get_api_key_hash

api_key_header = APIKeyHeader(name="X-API-Key", auto_error=True)

async def get_current_user(
    api_key: str = Security(api_key_header),
    db: AsyncSession = Depends(get_db)
) -> User:
    hashed_key = get_api_key_hash(api_key)
    result = await db.execute(select(User).filter(User.api_key_hash == hashed_key))
    user = result.scalars().first()
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid API Key",
        )
    return user
