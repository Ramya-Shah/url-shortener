import pytest
from unittest.mock import patch, AsyncMock
from app.main import app
from app.api.deps import get_redis

@pytest.mark.asyncio
@patch("app.api.routes.redirect.CacheService")
@patch("app.api.routes.redirect.enrich_and_store_click.delay")
async def test_redirect_cache_hit(mock_delay, mock_cache, async_client):
    cache_instance = mock_cache.return_value
    cache_instance.get_long_url = AsyncMock(return_value="https://example.com")
    
    async def mock_get_redis():
        yield None
    app.dependency_overrides[get_redis] = mock_get_redis

    response = await async_client.get("/abcdefg", follow_redirects=False)
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 302
    assert response.headers["location"] == "https://example.com"
    mock_delay.assert_called_once()
