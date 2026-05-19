from typing import Optional
from redis.asyncio import Redis

class CacheService:
    def __init__(self, redis: Redis):
        self.redis = redis
    
    async def get_long_url(self, short_code: str) -> Optional[str]:
        return await self.redis.get(f"url:{short_code}")
    
    async def set_long_url(self, short_code: str, long_url: str, ttl_seconds: int = 3600) -> None:
        await self.redis.setex(f"url:{short_code}", ttl_seconds, long_url)
    
    async def delete_long_url(self, short_code: str) -> None:
        await self.redis.delete(f"url:{short_code}")
