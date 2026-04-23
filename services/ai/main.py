import asyncio
import logging
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from consumers.service_bus import ServiceBusConsumer
from routers.health import router as health_router
from routers.ws import router as ws_router

logger = logging.getLogger(__name__)


async def _handle_message(message) -> None:
    logger.info("受信メッセージ: %s", message)


@asynccontextmanager
async def lifespan(app: FastAPI):
    connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
    task = None

    if connection_string:
        queue_name = os.getenv("AZURE_SERVICE_BUS_QUEUE_NAME", "decision-loop")
        consumer = ServiceBusConsumer(connection_string, queue_name)
        task = asyncio.create_task(consumer.start(_handle_message))
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
        except asyncio.CancelledError:
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
