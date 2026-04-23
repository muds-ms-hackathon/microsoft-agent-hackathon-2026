import asyncio
import logging
import os
from unittest.mock import MagicMock, patch

_SB_CONN_KEY = "AZURE_SERVICE_BUS_CONNECTION_STRING"


async def test_lifespan_warns_when_env_not_set(caplog):
    """接続文字列未設定時に WARNING を出してコンシューマーをスキップする"""
    import main

    env = {k: v for k, v in os.environ.items() if k != _SB_CONN_KEY}
    with patch.dict(os.environ, env, clear=True):
        with caplog.at_level(logging.WARNING, logger="main"):
            async with main.lifespan(main.app):
                pass

    assert any(_SB_CONN_KEY in r.message for r in caplog.records)


async def test_lifespan_starts_consumer_when_env_set():
    """接続文字列設定済み時に ServiceBusConsumer がバックグラウンド起動される"""
    import main

    started = asyncio.Event()

    async def fake_start(handler):
        started.set()
        await asyncio.Event().wait()  # キャンセルされるまでブロック

    mock_consumer = MagicMock()
    mock_consumer.start = fake_start

    env = {_SB_CONN_KEY: "fake://conn", "AZURE_SERVICE_BUS_QUEUE_NAME": "test-queue"}
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer) as mock_cls:
            async with main.lifespan(main.app):
                await asyncio.wait_for(started.wait(), timeout=1.0)

    mock_cls.assert_called_once_with("fake://conn", "test-queue")


async def test_lifespan_cancels_task_on_shutdown():
    """シャットダウン時にバックグラウンドタスクがキャンセルされ例外が伝播しない"""
    import main

    cancelled = asyncio.Event()

    async def fake_start(handler):
        try:
            await asyncio.Event().wait()
        except asyncio.CancelledError:
            cancelled.set()
            raise

    mock_consumer = MagicMock()
    mock_consumer.start = fake_start

    env = {_SB_CONN_KEY: "fake://conn"}
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer):
            async with main.lifespan(main.app):
                # タスクが起動するまでイベントループを1周させる
                await asyncio.sleep(0)

    assert cancelled.is_set()
