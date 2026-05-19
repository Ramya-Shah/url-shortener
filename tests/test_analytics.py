import pytest

@pytest.mark.asyncio
async def test_analytics_unauthorized(async_client):
    response = await async_client.get("/stats/abcdefg")
    assert response.status_code == 401
