import random
from typing import Optional
from datetime import datetime, timezone, timedelta
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from sqlalchemy.exc import IntegrityError

from app.models.url import URL
from app.core.encoder import encode_base62
from app.core.config import settings

class ShortenerService:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_url_by_code(self, short_code: str) -> Optional[URL]:
        result = await self.db.execute(select(URL).filter(URL.short_code == short_code))
        return result.scalars().first()

    async def create_short_url(
        self,
        long_url: str,
        user_id: int,
        custom_alias: Optional[str] = None,
        expires_in_days: Optional[int] = None
    ) -> URL:
        expires_at = None
        if expires_in_days:
            # tz-naive or tz-aware depending on DB config. Let's use tz-aware UTC
            expires_at = datetime.now(timezone.utc) + timedelta(days=expires_in_days)

        if custom_alias:
            existing = await self.get_url_by_code(custom_alias)
            if existing:
                raise ValueError("Custom alias already in use.")
            
            new_url = URL(
                short_code=custom_alias,
                long_url=long_url,
                user_id=user_id,
                custom_alias=True,
                expires_at=expires_at
            )
            self.db.add(new_url)
            await self.db.commit()
            await self.db.refresh(new_url)
            return new_url

        temp_code = f"tmp_{random.randint(100, 999)}_{int(datetime.now().timestamp()) % 1000000}"
        
        new_url = URL(
            short_code=temp_code,
            long_url=long_url,
            user_id=user_id,
            custom_alias=False,
            expires_at=expires_at
        )
        self.db.add(new_url)
        await self.db.commit()
        await self.db.refresh(new_url)

        generated_code = encode_base62(new_url.id)
        if len(generated_code) < settings.SHORT_CODE_LENGTH:
            generated_code = generated_code.rjust(settings.SHORT_CODE_LENGTH, 'a')
        
        new_url.short_code = generated_code
        try:
            await self.db.commit()
            await self.db.refresh(new_url)
        except IntegrityError:
            await self.db.rollback()
            raise ValueError("Collision detected, please try again.")
            
        return new_url
