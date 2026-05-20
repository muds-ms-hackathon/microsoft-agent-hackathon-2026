import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from consumers.service_bus import ServiceBusConsumer
from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
from routers.analysis import router as analysis_router
from routers.health import router as health_router
from routers.ws import router as ws_router
from schemas.analysis import AnalysisJobInput

logger = logging.getLogger(__name__)

_DEFAULT_QUEUE_NAME = "decision-loop"


async def _handle_message(message: ServiceBusReceivedMessage) -> None:
    """Service Busからのメッセージを受信し、解析パイプラインを実行する。"""
    body = json.loads(str(message))
    analysis_run_id = body["analysis_run_id"]

    api_client = AppApiClient()
    llm_client = AzureOpenAIClient()

    try:
        # 解析に必要な入力情報を取得する
        input_data = await api_client.get_analysis_run_input(analysis_run_id)
        job = AnalysisJobInput(**input_data)

        # パイプライン実行
        result = await analyze_meeting(job, llm_client)

        # 結果を保存する
        await api_client.update_analysis_run_result(
            analysis_run_id,
            result.model_dump(exclude_none=True),
        )
        logger.info(
            "解析完了 analysis_run_id=%s status=%s", analysis_run_id, result.status
        )

    except Exception as e:
        logger.error("解析失敗 analysis_run_id=%s: %s", analysis_run_id, e)
        try:
            await api_client.update_analysis_run_result(
                analysis_run_id,
                {
                    "status": "failed",
                    "error_message": str(e),
                    "failed_at": datetime.now(timezone.utc).isoformat(),
                },
            )
        except Exception:
            logger.exception(
                "エラー保存にも失敗 analysis_run_id=%s", analysis_run_id
            )


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
app.include_router(analysis_router)
