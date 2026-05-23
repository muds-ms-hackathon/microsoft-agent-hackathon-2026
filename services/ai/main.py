import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone

import httpx
from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from consumers.service_bus import ServiceBusConsumer
from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
from routers.analysis import router as analysis_router
from routers.health import router as health_router
from schemas.analysis import (
    VALID_AMBIGUITY_TYPE,
    VALID_PRIORITY,
    VALID_SEVERITY,
    AnalysisJobInput,
)

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
    except (json.JSONDecodeError, TypeError, UnicodeDecodeError) as error:
        logger.error("メッセージのデコードに失敗 (破棄): %s", error)
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
    complete_attempted = False
    complete_done = False
    try:
        input_data = await api_client.get_analysis_run_input(analysis_run_id)
        job = AnalysisJobInput(**input_data)
        result = await analyze_meeting(job, llm_client)
        if result.status == "completed" and result.report_json:
            report = result.report_json
            decision_items = []
            for decision in report.get("decisions", []):
                if not isinstance(decision, dict):
                    continue
                if not isinstance(decision.get("topic"), str) or not decision["topic"]:
                    continue
                decision_item: dict = {"title": decision["topic"]}
                if isinstance(decision.get("content"), str):
                    decision_item["body"] = decision["content"]
                if isinstance(decision.get("source_quote"), str):
                    decision_item["sourceQuote"] = decision["source_quote"]
                decision_items.append(decision_item)
            task_items = []
            for task in report.get("tasks", []):
                if not isinstance(task, dict):
                    continue
                if not isinstance(task.get("title"), str) or not task["title"]:
                    continue
                task_item: dict = {"title": task["title"]}
                if isinstance(task.get("body"), str):
                    task_item["body"] = task["body"]
                if isinstance(task.get("source_quote"), str):
                    task_item["sourceQuote"] = task["source_quote"]
                if task.get("priority") in VALID_PRIORITY:
                    task_item["priority"] = task["priority"]
                task_items.append(task_item)
            ambiguous_infos = []
            for ambiguity in report.get("ambiguities", []):
                if not isinstance(ambiguity, dict):
                    continue
                if not isinstance(ambiguity.get("body"), str) or not ambiguity["body"]:
                    continue
                ambiguity_item: dict = {"body": ambiguity["body"]}
                if isinstance(ambiguity.get("source_quote"), str):
                    ambiguity_item["sourceQuote"] = ambiguity["source_quote"]
                if ambiguity.get("ambiguity_type") in VALID_AMBIGUITY_TYPE:
                    ambiguity_item["ambiguityType"] = ambiguity["ambiguity_type"]
                if ambiguity.get("severity") in VALID_SEVERITY:
                    ambiguity_item["severity"] = ambiguity["severity"]
                ambiguous_infos.append(ambiguity_item)
            complete_attempted = True
            await api_client.complete_analysis_run(
                analysis_run_id,
                decision_items=decision_items,
                tasks=task_items,
                ambiguous_infos=ambiguous_infos,
            )
            complete_done = True
        await api_client.update_analysis_run_result(
            analysis_run_id,
            result.model_dump(exclude_none=True),
        )
        logger.info(
            "解析完了 analysis_run_id=%s status=%s",
            analysis_run_id,
            result.status,
        )
    except Exception as error:
        logger.error("解析失敗 analysis_run_id=%s: %s", analysis_run_id, error)
        if not complete_attempted:
            # complete 未呼び出しなので失敗確定、failed に落として再配送させる
            try:
                await api_client.update_analysis_run_result(
                    analysis_run_id,
                    {
                        "status": "failed",
                        "error_message": str(error),
                        "failed_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            except Exception:
                logger.exception(
                    "エラー保存にも失敗 analysis_run_id=%s", analysis_run_id
                )
            raise
        elif complete_done:
            # complete 成功後に update_analysis_run_result が失敗
            # 再配送で update を再試行させる
            logger.error(
                "complete済みだが詳細結果の保存に失敗 analysis_run_id=%s",
                analysis_run_id,
            )
            raise
        elif isinstance(error, httpx.HTTPStatusError) and error.response.status_code < 500:
            # 4xx は恒久失敗：failed 保存後raise せず、 再配送ループを防ぐ
            logger.error(
                "complete が 4xx で拒否 analysis_run_id=%s: %s",
                analysis_run_id,
                error,
            )
            try:
                await api_client.update_analysis_run_result(
                    analysis_run_id,
                    {
                        "status": "failed",
                        "error_message": str(error),
                        "failed_at": datetime.now(timezone.utc).isoformat(),
                    },
                )
            except Exception:
                logger.exception(
                    "エラー保存にも失敗 analysis_run_id=%s", analysis_run_id
                )
                raise  # failed 保存に失敗した場合は再配送させる
            # raise しない → failed 保存成功時のみ Consumer がメッセージを complete
        else:
            # 5xx / 通信断 / timeout → DB 状態不明のため再配送に委ねる
            logger.error(
                "complete失敗（DB状態不明）再配送 analysis_run_id=%s: %s",
                analysis_run_id,
                error,
            )
            raise


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
