from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_db, get_redis
from app.services.cache import CacheService
from app.services.shortener import ShortenerService
from app.workers.tasks import enrich_and_store_click
from redis.asyncio import Redis
from datetime import datetime, timezone

router = APIRouter(tags=["redirect"])

@router.get("/{code}")
async def redirect_to_long_url(
    code: str,
    request: Request,
    db: AsyncSession = Depends(get_db),
    redis: Redis = Depends(get_redis)
):
    cache = CacheService(redis)
    long_url = await cache.get_long_url(code)
    
    if not long_url:
        shortener = ShortenerService(db)
        url_obj = await shortener.get_url_by_code(code)
        
        if not url_obj or not url_obj.is_active:
            raise HTTPException(status_code=404, detail="URL not found or inactive")
            
        if url_obj.expires_at and url_obj.expires_at.replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
            raise HTTPException(status_code=404, detail="URL expired")
            
        long_url = url_obj.long_url
        await cache.set_long_url(code, long_url, ttl_seconds=3600)
    
    # Use X-Forwarded-For to get real IP behind Caddy reverse proxy
    forwarded_for = request.headers.get("x-forwarded-for")
    if forwarded_for:
        client_ip = forwarded_for.split(",")[0].strip()
    else:
        client_ip = request.client.host if request.client else None
        
    user_agent = request.headers.get("user-agent")
    referer = request.headers.get("referer")
    
    enrich_and_store_click.delay(
        short_code=code,
        ip_address=client_ip,
        user_agent=user_agent,
        referer=referer,
        clicked_at=datetime.now(timezone.utc).isoformat()
    )
    
    return RedirectResponse(url=long_url, status_code=302)
