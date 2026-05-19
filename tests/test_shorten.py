import pytest
from unittest.mock import patch

@pytest.mark.asyncio
async def test_shorten_url_unauthorized(async_client):
    response = await async_client.post("/shorten", json={"long_url": "https://example.com"})
    assert response.status_code == 401

@pytest.mark.asyncio
@patch("app.api.routes.shorten.ShortenerService")
async def test_shorten_url_success(mock_shortener, async_client):
    class MockUser:
        id = 1
        
    class MockURL:
        short_code = "abcdefg"
        expires_at = None
        created_at = "2024-01-01T00:00:00Z"

    instance = mock_shortener.return_value
    # AsyncMock for create_short_url since it's an async function
    from unittest.mock import AsyncMock
    instance.create_short_url = AsyncMock(return_value=MockURL())

    from app.api.auth import get_current_user
    from app.main import app
    app.dependency_overrides[get_current_user] = lambda: MockUser()

    response = await async_client.post("/shorten", json={"long_url": "https://example.com"})
    
    app.dependency_overrides.clear()
    
    assert response.status_code == 201
    assert response.json()["short_code"] == "abcdefg"
