from fastapi import APIRouter, Depends, Security, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, desc, text
from app.api.deps import get_db
from app.api.auth import get_current_user
from app.models.user import User
from app.models.url import URL
from app.models.click import Click
from app.schemas.analytics import ClickStats
from datetime import datetime, timezone, timedelta

router = APIRouter(tags=["analytics"])

@router.get("/stats/{code}", response_model=ClickStats)
async def get_url_stats(
    code: str,
    db: AsyncSession = Depends(get_db),
    current_user: User = Security(get_current_user)
):
    result = await db.execute(select(URL).filter(URL.short_code == code))
    url_obj = result.scalars().first()
    
    if not url_obj:
        raise HTTPException(status_code=404, detail="URL not found")
        
    if url_obj.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not authorized to view stats for this URL")
        
    total_result = await db.execute(select(func.count(Click.id)).filter(Click.url_id == url_obj.id))
    total_clicks = total_result.scalar() or 0
    
    unique_ips_result = await db.execute(select(func.count(func.distinct(Click.ip_address))).filter(Click.url_id == url_obj.id))
    unique_ips = unique_ips_result.scalar() or 0
    
    referrers_result = await db.execute(
        select(Click.referrer, func.count(Click.id).label("count"))
        .filter(Click.url_id == url_obj.id)
        .group_by(Click.referrer)
        .order_by(desc("count"))
        .limit(5)
    )
    top_referrers = [{"referrer": row[0] or "Direct", "count": row[1]} for row in referrers_result.all()]
    
    countries_result = await db.execute(
        select(Click.country, func.count(Click.id).label("count"))
        .filter(Click.url_id == url_obj.id)
        .group_by(Click.country)
        .order_by(desc("count"))
        .limit(5)
    )
    top_countries = [{"country": row[0] or "Unknown", "count": row[1]} for row in countries_result.all()]
    
    thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
    
    clicks_by_day_query = (
        select(func.date(Click.clicked_at).label("day"), func.count(Click.id).label("count"))
        .filter(Click.url_id == url_obj.id, Click.clicked_at >= thirty_days_ago)
        .group_by(func.date(Click.clicked_at))
        .order_by(func.date(Click.clicked_at))
    )
    clicks_by_day_result = await db.execute(clicks_by_day_query)
    clicks_by_day = {str(row[0]): row[1] for row in clicks_by_day_result.all()}
    
    return ClickStats(
        total_clicks=total_clicks,
        unique_ips=unique_ips,
        clicks_by_day=clicks_by_day,
        top_referrers=top_referrers,
        top_countries=top_countries
    )
