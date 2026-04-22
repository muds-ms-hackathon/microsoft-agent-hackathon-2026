import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def app():
    from main import app
    return app


@pytest.fixture
async def client(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as c:
        yield c
