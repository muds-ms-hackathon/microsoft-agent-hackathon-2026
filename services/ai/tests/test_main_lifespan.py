import asyncio
import logging
import os
from unittest.mock import MagicMock, patch

_SB_CONN_KEY = "AZURE_SERVICE_BUS_CONNECTION_STRING"
_DEPLOY_KEY = "AZURE_OPENAI_DEPLOYMENT_NAME"
_DEPLOY_VAL = "test-deployment"
_SECRET_KEY = "INTERNAL_API_SECRET"
_SECRET_VAL = "test-secret"
_API_KEY = "AZURE_OPENAI_API_KEY"
_API_KEY_VAL = "test-key"
_ENDPOINT_KEY = "AZURE_OPENAI_ENDPOINT"
_ENDPOINT_VAL = "https://example.openai.azure.com"


async def test_lifespan_warns_when_env_not_set(caplog):
    """接続文字列未設定時に WARNING を出してコンシューマーをスキップする"""
    import main

    env = {k: v for k, v in os.environ.items() if k != _SB_CONN_KEY}
    env[_DEPLOY_KEY] = _DEPLOY_VAL
    env[_SECRET_KEY] = _SECRET_VAL
    env[_API_KEY] = _API_KEY_VAL
    env[_ENDPOINT_KEY] = _ENDPOINT_VAL
    with patch.dict(os.environ, env):
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

    env = {
        _SB_CONN_KEY: "fake://conn",
        "AZURE_SERVICE_BUS_QUEUE_NAME": "test-queue",
        _DEPLOY_KEY: _DEPLOY_VAL,
        _SECRET_KEY: _SECRET_VAL,
        _API_KEY: _API_KEY_VAL,
        _ENDPOINT_KEY: _ENDPOINT_VAL,
    }
    with patch.dict(os.environ, env):
        with patch(
            "main.ServiceBusConsumer", return_value=mock_consumer
        ) as mock_cls:
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

    env = {
        _SB_CONN_KEY: "fake://conn",
        _DEPLOY_KEY: _DEPLOY_VAL,
        _SECRET_KEY: _SECRET_VAL,
        _API_KEY: _API_KEY_VAL,
        _ENDPOINT_KEY: _ENDPOINT_VAL,
    }
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer):
            async with main.lifespan(main.app):
                # タスクが起動するまでイベントループを1周させる
                await asyncio.sleep(0)

    assert cancelled.is_set()


async def test_lifespan_logs_error_on_consumer_failure(caplog):
    """コンシューマーが予期せず例外で終了した場合に ERROR をログに残す"""
    import main

    async def fake_start(handler):
        raise RuntimeError("接続失敗")

    mock_consumer = MagicMock()
    mock_consumer.start = fake_start

    env = {
        _SB_CONN_KEY: "fake://conn",
        _DEPLOY_KEY: _DEPLOY_VAL,
        _SECRET_KEY: _SECRET_VAL,
        _API_KEY: _API_KEY_VAL,
        _ENDPOINT_KEY: _ENDPOINT_VAL,
    }
    with patch.dict(os.environ, env):
        with patch("main.ServiceBusConsumer", return_value=mock_consumer):
            with caplog.at_level(logging.ERROR, logger="main"):
                async with main.lifespan(main.app):
                    await asyncio.sleep(0)  # タスクを実行させる
                    # done callback は call_soon で遅延するため 2 ティック必要
                    await asyncio.sleep(0)

    assert any(
        r.levelno == logging.ERROR and "予期せず終了" in r.message
        for r in caplog.records
    )


async def test_lifespan_raises_when_deployment_name_not_set():
    """(a) AZURE_OPENAI_DEPLOYMENT_NAME 未設定時に RuntimeError が raise される"""
    import main

    env = {k: v for k, v in os.environ.items() if k != _DEPLOY_KEY}
    env[_SECRET_KEY] = _SECRET_VAL
    with patch.dict(os.environ, env, clear=True):
        try:
            async with main.lifespan(main.app):
                pass
        except RuntimeError as error:
            assert _DEPLOY_KEY in str(error)
        else:
            raise AssertionError("RuntimeError が raise されなかった")


async def test_lifespan_raises_when_api_key_not_set():
    """(b) AZURE_OPENAI_API_KEY 未設定時に RuntimeError が raise される"""
    import main

    env = {k: v for k, v in os.environ.items() if k != _API_KEY}
    env[_DEPLOY_KEY] = _DEPLOY_VAL
    env[_SECRET_KEY] = _SECRET_VAL
    with patch.dict(os.environ, env, clear=True):
        try:
            async with main.lifespan(main.app):
                pass
        except RuntimeError as error:
            assert _API_KEY in str(error)
        else:
            raise AssertionError("RuntimeError が raise されなかった")


async def test_lifespan_raises_when_endpoint_not_set():
    """(c) AZURE_OPENAI_ENDPOINT 未設定時に RuntimeError が raise される"""
    import main

    env = {k: v for k, v in os.environ.items() if k != "AZURE_OPENAI_ENDPOINT"}
    env[_DEPLOY_KEY] = _DEPLOY_VAL
    env["AZURE_OPENAI_API_KEY"] = "test-key"
    env[_SECRET_KEY] = _SECRET_VAL
    with patch.dict(os.environ, env, clear=True):
        try:
            async with main.lifespan(main.app):
                pass
        except RuntimeError as error:
            assert "AZURE_OPENAI_ENDPOINT" in str(error)
        else:
            raise AssertionError("RuntimeError が raise されなかった")
