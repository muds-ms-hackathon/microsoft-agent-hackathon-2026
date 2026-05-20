import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, cast

from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncAzureOpenAI

from consumers.service_bus import ServiceBusConsumer
from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
from routers.analysis import router as analysis_router
from routers.health import router as health_router
from schemas.analysis import AnalysisJobInput

logger = logging.getLogger(__name__)

_DEFAULT_QUEUE_NAME = "decision-loop"

# lifespan で初期化し、 _handle_message から参照する
_openai_client: AsyncAzureOpenAI | None = None
_deployment_name: str = ""  # lifespan で設定


def _create_openai_client() -> AsyncAzureOpenAI:
    """テストでモック注入できるよう factory 関数として切り出す"""
    return AsyncAzureOpenAI(
        api_key=os.getenv("AZURE_OPENAI_API_KEY"),
        azure_endpoint=os.getenv("AZURE_OPENAI_ENDPOINT", ""),
        api_version=os.getenv("AZURE_OPENAI_API_VERSION", "2024-02-01"),
    )


# Azure OpenAI API を呼び出して、文字起こしから決定事項・タスク・曖昧箇所を抽出する
async def _analyze_transcript(transcript: str) -> dict[str, Any]:
    """文字起こしを Azure OpenAI で解析し、決定事項・タスク・曖昧箇所を抽出する"""
    if _openai_client is None:
        raise RuntimeError("OpenAI クライアントが初期化されていません")

    system_prompt = """あなたは会議の文字起こしを分析するアシスタントです
以下の3種類の情報をJSONで抽出してください。

1. decisionItems: 決定事項・議論中の事項
2. tasks: 担当者・期限・内容が明確なタスク
3. ambiguousInfos: 担当者不明・期限不明・内容が曖昧な箇所

出力形式(JSONのみ)
{
    "decisionItems": [
        {"title": "...", "body": "...", "sourceQuote": "...", "status": "open"}
    ],
    "tasks": [
        {
            "title": "...", "body": "...", "sourceQuote": "...",
            "status": "todo", "priority": "required"
        }
    ],
    "ambiguousInfos": [
        {
            "body": "...", "sourceQuote": "...", "status": "draft",
            "ambiguityType": "no_assignee", "severity": "medium"
        }
    ]
}"""

    response = await _openai_client.chat.completions.create(
        model=_deployment_name,
        messages=[
            {"role": "system", "content": system_prompt},
            {
                "role": "user",
                "content": f"以下の会議の文字起こしを分析してください:\n\n{transcript}",
            },
        ],
        response_format={"type": "json_object"},
    )

    return cast(dict[str, Any], json.loads(response.choices[0].message.content or "{}"))


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
            logger.exception("エラー保存にも失敗 analysis_run_id=%s", analysis_run_id)


def _on_consumer_done(task: asyncio.Task) -> None:
    # cancel 以外で終了した場合はエラーをログに残す
    if not task.cancelled() and (exc := task.exception()):
        logger.error("Service Bus コンシューマーが予期せず終了しました: %s", exc)


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _openai_client, _deployment_name

    deployment = os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME")
    if not deployment:
        raise RuntimeError("AZURE_OPENAI_DEPLOYMENT_NAME が未設定です")
    _deployment_name = deployment

    client = _create_openai_client()  # ローカル変数に受ける
    _openai_client = client  # グローバル変数にセット
    task = None

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
        await client.close()
        _openai_client = None


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
