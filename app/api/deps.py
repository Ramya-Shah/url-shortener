from typing import AsyncGenerator
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.base import async_session_maker
from app.core.config import settings

async def get_db() -> AsyncGenerator[AsyncSession, None]:
    async with async_session_maker() as session:
        yield session

async def get_redis() -> AsyncGenerator[Redis, None]:
    redis = Redis.from_url(str(settings.REDIS_URL), decode_responses=True)
    try:
        yield redis
    finally:
        await redis.aclose()
