import asyncio
from celery import Celery
from celery.schedules import crontab
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from sqlalchemy import select
import httpx
from datetime import datetime, timezone, timedelta

from app.core.config import settings
from app.models.base import engine
from app.models.url import URL
from app.models.click import Click
from app.services.cache import CacheService
from redis.asyncio import Redis
import ipaddress

celery_app = Celery(
    "url_shortener_tasks",
    broker=str(settings.REDIS_URL),
    backend=str(settings.REDIS_URL)
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    timezone="UTC",
    enable_utc=True,
)

SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

def parse_user_agent(ua_string: str):
    ua_lower = ua_string.lower() if ua_string else ""
    os = "Unknown"
    if "windows" in ua_lower: os = "Windows"
    elif "mac" in ua_lower: os = "MacOS"
    elif "linux" in ua_lower: os = "Linux"
    elif "android" in ua_lower: os = "Android"
    elif "iphone" in ua_lower or "ipad" in ua_lower: os = "iOS"
    
    browser = "Unknown"
    if "chrome" in ua_lower: browser = "Chrome"
    elif "firefox" in ua_lower: browser = "Firefox"
    elif "safari" in ua_lower and "chrome" not in ua_lower: browser = "Safari"
    elif "edge" in ua_lower: browser = "Edge"
    
    device = "Mobile" if "mobile" in ua_lower else "Desktop"
    return device, browser, os

async def _enrich_and_store_click(short_code: str, ip_address: str, user_agent: str, referer: str, clicked_at: str):
    from app.models.base import engine
    await engine.dispose()
    
    device, browser, os = parse_user_agent(user_agent)
    country, city = None, None
    
    if ip_address:
        # Check if this is a private or loopback IP address
        is_private = False
        if ip_address in ("127.0.0.1", "localhost", "::1"):
            is_private = True
        else:
            try:
                ip_obj = ipaddress.ip_address(ip_address)
                if ip_obj.is_private or ip_obj.is_loopback:
                    is_private = True
            except ValueError:
                pass
        
        if is_private:
            country = "Local Developer"
            city = "Localhost"
        else:
            try:
                async with httpx.AsyncClient() as client:
                    resp = await client.get(f"http://ip-api.com/json/{ip_address}")
                    if resp.status_code == 200:
                        data = resp.json()
                        if data.get("status") == "success":
                            country = data.get("country")
                            city = data.get("city")
            except Exception:
                pass 

    async with SessionLocal() as db:
        url_obj = await db.scalar(select(URL).filter(URL.short_code == short_code))
        if url_obj:
            # Click Deduplication: Ignore identical clicks from same IP within last 2 seconds
            parsed_clicked_at = datetime.fromisoformat(clicked_at)
            two_seconds_ago = parsed_clicked_at - timedelta(seconds=1)
            recent_click = await db.scalar(
                select(Click)
                .filter(
                    Click.url_id == url_obj.id,
                    Click.ip_address == ip_address,
                    Click.clicked_at >= two_seconds_ago,
                    Click.clicked_at <= parsed_clicked_at
                )
                .limit(1)
            )
            if recent_click:
                # Duplicate click within 2s - skip storing
                return

            new_click = Click(
                url_id=url_obj.id,
                clicked_at=parsed_clicked_at,
                ip_address=ip_address,
                country=country,
                city=city,
                device_type=device,
                browser=browser,
                os=os,
                referrer=referer
            )
            db.add(new_click)
            await db.commit()

@celery_app.task(name="enrich_and_store_click")
def enrich_and_store_click(short_code: str, ip_address: str, user_agent: str, referer: str, clicked_at: str):
    asyncio.run(_enrich_and_store_click(short_code, ip_address, user_agent, referer, clicked_at))

async def _expire_urls():
    from app.models.base import engine
    await engine.dispose()
    now = datetime.now(timezone.utc)
    redis = Redis.from_url(str(settings.REDIS_URL), decode_responses=True)
    cache = CacheService(redis)
    
    async with SessionLocal() as db:
        result = await db.execute(
            select(URL).filter(URL.is_active == True, URL.expires_at < now)
        )
        expired_urls = result.scalars().all()
        
        for url in expired_urls:
            url.is_active = False
            await cache.delete_long_url(url.short_code)
            
        if expired_urls:
            await db.commit()
    await redis.aclose()

@celery_app.task(name="expire_urls")
def expire_urls():
    asyncio.run(_expire_urls())

celery_app.conf.beat_schedule = {
    "expire-urls-every-hour": {
        "task": "expire_urls",
        "schedule": crontab(minute=0, hour="*"),
    },
}
