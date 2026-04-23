import asyncio
import logging
import os
from contextlib import asynccontextmanager

from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from consumers.service_bus import ServiceBusConsumer
from routers.health import router as health_router
from routers.ws import router as ws_router

logger = logging.getLogger(__name__)

_DEFAULT_QUEUE_NAME = "decision-loop"


async def _handle_message(message: ServiceBusReceivedMessage) -> None:
    logger.info("受信メッセージ: %s", message)


def _on_consumer_done(task: asyncio.Task) -> None:
    # cancel 以外で終了した場合はエラーをログに残す
    if not task.cancelled() and (exc := task.exception()):
        logger.error("Service Bus コンシューマーが予期せず終了しました: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
    task = None

    if connection_string:
        queue_name = os.getenv("AZURE_SERVICE_BUS_QUEUE_NAME", _DEFAULT_QUEUE_NAME)
        consumer = ServiceBusConsumer(connection_string, queue_name)
        task = asyncio.create_task(consumer.start(_handle_message))
        task.add_done_callback(_on_consumer_done)
    else:
        logger.warning(
            "AZURE_SERVICE_BUS_CONNECTION_STRING が未設定のため、"
            "Service Bus コンシューマーをスキップします"
        )

    yield

    if task is not None:
        task.cancel()
        try:
            await task
        except (asyncio.CancelledError, Exception):
            pass


app = FastAPI(title="AI Service", lifespan=lifespan)

# 開発環境用: フロントエンド開発サーバーからのリクエストを許可する
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(ws_router)
