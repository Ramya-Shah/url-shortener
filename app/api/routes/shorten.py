from fastapi import APIRouter, Depends, Security, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from app.schemas.url import URLCreateRequest, URLCreateResponse, URLInfo
from app.api.deps import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.url import URL
from app.models.click import Click
from app.services.shortener import ShortenerService
from app.services.cache import CacheService
import ipaddress
from urllib.parse import urlparse
from typing import List

router = APIRouter(tags=["shorten"])

def validate_url(url_str: str):
    parsed = urlparse(url_str)
    try:
        ip = ipaddress.ip_address(parsed.hostname)
        if ip.is_private or ip.is_loopback:
            raise HTTPException(status_code=400, detail="SSRF attempt blocked: Private IP ranges are not allowed.")
    except (ValueError, TypeError):
        pass # Not an IP address or no hostname

@router.post("/shorten", response_model=URLCreateResponse, status_code=status.HTTP_201_CREATED)
async def shorten_url(
    request: Request,
    payload: URLCreateRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Security(get_current_user)
):
    validate_url(str(payload.long_url))
    
    shortener = ShortenerService(db)
    try:
        url_obj = await shortener.create_short_url(
            long_url=str(payload.long_url),
            user_id=current_user.id,
            custom_alias=payload.custom_alias,
            expires_in_days=payload.expires_in_days
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    base_url = str(request.base_url)
    return URLCreateResponse(
        short_url=f"{base_url}{url_obj.short_code}",
        short_code=url_obj.short_code,
        expires_at=url_obj.expires_at,
        created_at=url_obj.created_at
    )

@router.get("/urls", response_model=List[URLInfo])
async def list_user_urls(
    request: Request,
    db: AsyncSession = Depends(get_db),
    current_user: User = Security(get_current_user)
):
    query = (
        select(
            URL.id,
            URL.short_code,
            URL.long_url,
            URL.created_at,
            URL.expires_at,
            URL.is_active,
            func.count(Click.id).label("clicks_count")
        )
        .outerjoin(Click, URL.id == Click.url_id)
        .filter(URL.user_id == current_user.id)
        .group_by(URL.id)
        .order_by(URL.created_at.desc())
    )
    result = await db.execute(query)
    
    base_url = str(request.base_url)
    urls = []
    for row in result.all():
        urls.append(
            URLInfo(
                id=row.id,
                short_code=row.short_code,
                short_url=f"{base_url}{row.short_code}",
                long_url=row.long_url,
                clicks_count=row.clicks_count,
                created_at=row.created_at,
                expires_at=row.expires_at,
                is_active=row.is_active
            )
        )
    return urls

