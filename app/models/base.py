from sqlalchemy.ext.asyncio import AsyncAttrs, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from app.core.config import settings

class Base(AsyncAttrs, DeclarativeBase):
    pass

engine = create_async_engine(str(settings.DATABASE_URL), echo=False)
async_session_maker = async_sessionmaker(engine, expire_on_commit=False)
