import logging
from collections.abc import Callable, Coroutine
from typing import Any

from azure.servicebus.aio import ServiceBusClient

logger = logging.getLogger(__name__)


class ServiceBusConsumer:
    def __init__(self, connection_string: str, queue_name: str) -> None:
        self.connection_string = connection_string
        self.queue_name = queue_name
        # テスト時にモック注入できるよう factory を属性として持つ
        self._client_factory = ServiceBusClient.from_connection_string

    async def start(self, handler: Callable[..., Coroutine[Any, Any, None]]) -> None:
        """キューからメッセージを受信してハンドラーに渡す受信ループを起動する。
        停止するにはこのコルーチンを実行している asyncio.Task をキャンセルする。
        """
        async with self._client_factory(self.connection_string) as client:
            async with client.get_queue_receiver(self.queue_name) as receiver:
                async for message in receiver:
                    try:
                        await handler(message)
                        await receiver.complete_message(message)
                    except Exception:
                        # 1件の処理失敗でループを止めない
                        logger.exception("メッセージ処理中にエラーが発生しました: %s", message)
