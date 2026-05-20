import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from typing import Any, cast

import httpx
from azure.servicebus import ServiceBusReceivedMessage
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from openai import AsyncAzureOpenAI

from consumers.service_bus import ServiceBusConsumer
from routers.health import router as health_router

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
    parsed = json.loads(_parse_message_body(message).decode("utf-8"))
    if not isinstance(parsed, dict):
        logger.error("メッセージボディが dict ではありません: %s", type(parsed))
        return
    body = parsed

    if body.get("type") != "meeting.process":
        logger.info("未対応のメッセージタイプをスキップ: %s", body.get("type"))
        return

    # 必須フィールドの検証
    meeting_id = body.get("meetingId")
    analysis_run_id = body.get("analysisRunId")
    transcript = body.get("transcript")
    if (
        not isinstance(meeting_id, str)
        or not isinstance(analysis_run_id, str)
        or not isinstance(transcript, str)
    ):
        # 欠損メッセージは再配送せず破棄する
        # (DLQ が必要であれば ValueError を raise に変更する)
        logger.error(
            "メッセージに必須フィールドが不足しています (破棄) : %s", body.get("type")
        )
        return

    backend_url = os.getenv("BACKEND_API_URL", "http://localhost:3000")

    async with httpx.AsyncClient(timeout=120.0) as client:
        try:
            resp = await client.patch(
                f"{backend_url}/internal/analysis-runs/{analysis_run_id}",
                json={"status": "analyzing"},
            )
            resp.raise_for_status()

            result = await _analyze_transcript(transcript)

            resp = await client.post(
                f"{backend_url}/internal/analysis-runs/{analysis_run_id}/complete",
                json={
                    "decisionItems": result.get("decisionItems", []),
                    "tasks": result.get("tasks", []),
                    "ambiguousInfos": result.get("ambiguousInfos", []),
                },
            )
            resp.raise_for_status()
            logger.info("会議 %s の解析が完了しました", meeting_id)

        except Exception:
            logger.exception("会議 %s の解析中にエラーが発生しました", meeting_id)
            # failed 更新自体の失敗で元のエラーをマスクしないよう別 try に分ける
            try:
                resp = await client.patch(
                    f"{backend_url}/internal/analysis-runs/{analysis_run_id}",
                    json={"status": "failed"},
                )
                resp.raise_for_status()
            except Exception:
                logger.exception(
                    "failed ステータス更新に失敗しました (analysis_run_id=%s) ",
                    analysis_run_id,
                )
            raise  # Consumer に失敗を伝えて再配送させる


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
