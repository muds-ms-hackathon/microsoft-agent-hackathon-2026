import pytest
from starlette.testclient import TestClient


@pytest.fixture
def sync_client(app):
    return TestClient(app)


def test_websocket_connection(sync_client):
    # WebSocket接続が確立でき、初回メッセージを受信できることを確認
    with sync_client.websocket_connect("/ws") as ws:
        data = ws.receive_json()
        assert data == {"type": "connected"}


def test_websocket_echo(sync_client):
    # メッセージ送信後にエコーが返ることを確認
    with sync_client.websocket_connect("/ws") as ws:
        ws.receive_json()  # 接続確認メッセージを読み捨て
        ws.send_json({"message": "hello"})
        data = ws.receive_json()
        assert data == {"echo": "hello"}
