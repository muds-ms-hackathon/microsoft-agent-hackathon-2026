import asyncio
import logging
import os
from unittest.mock import MagicMock, patch

import pytest
from httpx import ASGITransport, AsyncClient

_SB_CONN_KEY = "AZURE_SERVICE_BUS_CONNECTION_STRING"


@pytest.fixture
def app():
    from main import app

    return app


async def test_lifespan_warns_when_env_not_set(app, caplog):
    """接続文字列未設定時に WARNING を出してコンシューマーをスキップする"""
    env = {k: v for k, v in os.environ.items() if k != _SB_CONN_KEY}
    with patch.dict(os.environ, env, clear=True):
        with caplog.at_level(logging.WARNING, logger="main"):
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ):
                pass

    assert any(_SB_CONN_KEY in r.message for r in caplog.records)


async def test_lifespan_starts_consumer_when_env_set(app):
    """接続文字列設定済み時に ServiceBusConsumer がバックグラウンド起動される"""
    # start() が永続的に動き続けるよう asyncio.Event で制御
    started = asyncio.Event()

    async def fake_start(handler):
        started.set()
        await asyncio.Event().wait()  # キャンセルされるまでブロック

    mock_consumer = MagicMock()
    mock_consumer.start = fake_start

    env = {_SB_CONN_KEY: "fake://conn", "AZURE_SERVICE_BUS_QUEUE_NAME": "test-queue"}
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer) as mock_cls:
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ):
                await asyncio.wait_for(started.wait(), timeout=1.0)

    mock_cls.assert_called_once_with("fake://conn", "test-queue")


async def test_lifespan_cancels_task_on_shutdown(app):
    """シャットダウン時にバックグラウンドタスクがキャンセルされ例外が伝播しない"""
    cancelled = asyncio.Event()

    async def fake_start(handler):
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    mock_consumer = MagicMock()
    mock_consumer.start = fake_start

    env = {"AZURE_SERVICE_BUS_CONNECTION_STRING": "fake://conn"}
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer):
            # AsyncClient コンテキストを抜けると lifespan の shutdown が実行される
            async with AsyncClient(
                transport=ASGITransport(app=app), base_url="http://test"
            ):
                pass

    assert cancelled.is_set()
