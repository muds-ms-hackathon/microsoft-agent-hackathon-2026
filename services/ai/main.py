import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager

from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from consumers.service_bus import ServiceBusConsumer
from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
from pipeline.complete_payload import build_complete_payload
from routers.analysis import router as analysis_router
from routers.health import router as health_router
from schemas.analysis import AnalysisJobInput

logger = logging.getLogger(__name__)

_DEFAULT_QUEUE_NAME = "decision-loop"


# NOTE: このメッセージスキーマは apps/api/src/lib/service-bus.ts の
# sendToServiceBus のペイロードと対になっています。
# フィールドを変更する場合は必ず両方を同時に更新してください。
def _parse_message_body(message: ServiceBusReceivedMessage) -> bytes:
    """message.body が bytes / Iterable[bytes] のどちらでも扱えるようにする"""
    body = message.body
    if isinstance(body, bytes):
        return body
    if isinstance(body, (bytearray, memoryview)):
        return bytes(body)
    if hasattr(body, "__iter__"):
        chunks = []
        for chunk in body:
            if not isinstance(chunk, (bytes, bytearray, memoryview)):
                raise TypeError(f"非対応の chunk 型: {type(chunk)}")
            chunks.append(chunk)
        return b"".join(chunks)
    raise TypeError(f"未対応の message.body 型: {type(body)}")


async def _handle_message(message: ServiceBusReceivedMessage) -> None:
    """Service Busからのメッセージを受信し、解析パイプラインを実行する。"""
    # 取り出し失敗で Consumer が落ちないよう、パース段階で完結させる
    try:
        body = json.loads(_parse_message_body(message).decode("utf-8"))
    except (json.JSONDecodeError, TypeError, UnicodeDecodeError) as e:
        logger.error("メッセージのデコードに失敗 (破棄): %s", e)
        return
    if not isinstance(body, dict):
        logger.error("メッセージボディが dict ではありません: %s", type(body).__name__)
        return
    analysis_run_id = body.get("analysis_run_id")
    if not isinstance(analysis_run_id, str) or not analysis_run_id.strip():
        logger.error(
            "analysis_run_id が欠落/不正です (破棄): keys=%s", list(body.keys())
        )
        return
    api_client = AppApiClient()
    llm_client = AzureOpenAIClient()

    # queued → analyzing に遷移する（失敗時は例外を伝播させ再配送）
    await api_client.mark_analyzing(analysis_run_id)

    input_data = await api_client.get_analysis_run_input(analysis_run_id)
    job = AnalysisJobInput(**input_data)

    # analyze_meeting は例外を飲み込み status="failed" の結果を返す
    result = await analyze_meeting(job, llm_client)

    if result.status == "completed":
        # 解析結果・業務データを一括保存する（失敗時は例外を伝播させ再配送）
        await api_client.complete_analysis_run(
            analysis_run_id, build_complete_payload(result)
        )
        logger.info("解析完了 analysis_run_id=%s", analysis_run_id)
    else:
        # パイプライン内部エラー: mark_failed が成功すれば再配送不要
        # mark_failed 自体が失敗した場合のみ例外を伝播させる
        await api_client.mark_failed(
            analysis_run_id,
            error_message=result.error_message,
            current_step=result.current_step,
        )
        logger.info(
            "解析失敗を記録 analysis_run_id=%s error=%s",
            analysis_run_id,
            result.error_message,
        )


def _on_consumer_done(task: asyncio.Task) -> None:
    # cancel 以外で終了した場合はエラーをログに残す
    if not task.cancelled() and (exc := task.exception()):
        logger.error("Service Bus コンシューマーが予期せず終了しました: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):

    # 必須環境変数を一括検証する（クライアント生成より前に全チェック）
    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")
    if not deployment:
        raise RuntimeError("AZURE_OPENAI_DEPLOYMENT_NAME が未設定です")

    api_key = os.environ.get("AZURE_OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("AZURE_OPENAI_API_KEY が未設定です")

    endpoint = os.environ.get("AZURE_OPENAI_ENDPOINT")
    if not endpoint:
        raise RuntimeError("AZURE_OPENAI_ENDPOINT が未設定です")

    internal_secret = os.environ.get("INTERNAL_API_SECRET")
    if not internal_secret:
        raise RuntimeError("INTERNAL_API_SECRET が未設定です")

    task: asyncio.Task | None = None

    try:
        connection_string = os.getenv("AZURE_SERVICE_BUS_CONNECTION_STRING")
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

    finally:
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
app.include_router(analysis_router)
