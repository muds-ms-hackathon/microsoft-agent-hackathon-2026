async def test_health_returns_ok(client):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


async def test_undefined_path_returns_404(client):
    response = await client.get("/undefined-path")
    assert response.status_code == 404
