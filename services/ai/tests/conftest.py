import pytest
from httpx import ASGITransport, AsyncClient


@pytest.fixture
def app():
    from main import app
    return app


@pytest.fixture
async def client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c
