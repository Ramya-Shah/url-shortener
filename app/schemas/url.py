from pydantic import BaseModel, HttpUrl, Field
from typing import Optional
from datetime import datetime

class URLCreateRequest(BaseModel):
    long_url: HttpUrl = Field(..., description="The original long URL to shorten.")
    custom_alias: Optional[str] = Field(None, min_length=4, max_length=20, description="Optional custom alias for the short URL.")
    expires_in_days: Optional[int] = Field(None, gt=0, description="Optional expiration in days.")

class URLCreateResponse(BaseModel):
    short_url: str
    short_code: str
    expires_at: Optional[datetime]
    created_at: datetime

class URLInfo(BaseModel):
    id: int
    short_code: str
    short_url: str
    long_url: str
    clicks_count: int
    created_at: datetime
    expires_at: Optional[datetime]
    is_active: bool

