from contextlib import asynccontextmanager
from unittest.mock import AsyncMock, MagicMock

from consumers.service_bus import ServiceBusConsumer


def test_consumer_can_be_instantiated():
    consumer = ServiceBusConsumer(
        connection_string="Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test",
        queue_name="test-queue",
    )
    assert consumer is not None


def test_consumer_stores_queue_name():
    consumer = ServiceBusConsumer(
        connection_string="Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test",
        queue_name="my-queue",
    )
    assert consumer.queue_name == "my-queue"


async def test_consumer_start_calls_receive_loop():
    # start() がメッセージを受信してハンドラーに渡すことを確認
    consumer = ServiceBusConsumer(
        connection_string="Endpoint=sb://test.servicebus.windows.net/;SharedAccessKeyName=test;SharedAccessKey=test",
        queue_name="test-queue",
    )

    received_messages = []

    async def handler(msg):
        received_messages.append(msg)

    mock_message = MagicMock()

    # receiver: async for で 1 件だけ返す非同期イテレーブル
    class _MockReceiver:
        def __init__(self):
            self._items = [mock_message]
            self.complete_message = AsyncMock()

        def __aiter__(self):
            return self

        async def __anext__(self):
            if self._items:
                return self._items.pop(0)
            raise StopAsyncIteration

    mock_receiver = _MockReceiver()

    # client: get_queue_receiver がレシーバーを包む async context manager を返す
    mock_client = MagicMock()

    @asynccontextmanager
    async def receiver_ctx(*_args, **_kwargs):
        yield mock_receiver

    mock_client.get_queue_receiver = receiver_ctx

    # factory: 呼び出すと client を包む async context manager を返す
    @asynccontextmanager
    async def client_factory(_conn_str):
        yield mock_client

    consumer._client_factory = client_factory
    await consumer.start(handler)

    assert len(received_messages) == 1


