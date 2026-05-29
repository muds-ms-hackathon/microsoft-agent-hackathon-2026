"""Semantic Kernel の Kernel / ChatCompletion サービス構築。

本番では既存 Azure OpenAI デプロイを `AzureChatCompletion` として登録する
（新規 Azure リソース不要）。テスト・Azure 未設定環境では `FakeChatCompletion`
を使い、ツール呼び出しループをフェイクで駆動する。
"""

import json
import logging
import os
from typing import TYPE_CHECKING, Any, ClassVar

from pydantic import PrivateAttr
from semantic_kernel import Kernel
from semantic_kernel.connectors.ai.chat_completion_client_base import (
    ChatCompletionClientBase,
)
from semantic_kernel.connectors.ai.function_choice_behavior import (
    FunctionChoiceBehavior,
)
from semantic_kernel.connectors.ai.prompt_execution_settings import (
    PromptExecutionSettings,
)
from semantic_kernel.contents import ChatHistory, ChatMessageContent
from semantic_kernel.contents.function_call_content import FunctionCallContent
from semantic_kernel.contents.utils.author_role import AuthorRole
from semantic_kernel.filters import FilterTypes

if TYPE_CHECKING:
    from agent.plugins import MeetingContextPlugin
    from agent.recorder import ToolCallRecorder

logger = logging.getLogger(__name__)

# エージェントに公開するプラグイン名。ツールの完全修飾名は "{PLUGIN_NAME}-{関数名}"。
PLUGIN_NAME = "meeting_context"

# 既存 AzureOpenAIClient と同じ環境変数を流用する（llm/client.py 参照）。
_AZURE_ENV_KEYS = (
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
)

# Kernel に登録するチャットサービスの ID。エージェント実行時に参照する。
CHAT_SERVICE_ID = "meeting_agent"


def is_azure_configured() -> bool:
    """Azure OpenAI 接続に必要な環境変数がすべて揃っているか判定する。

    未設定（ローカル/CI）の場合はフェイク経由にフォールバックさせる用途。
    """
    return all(os.environ.get(key) for key in _AZURE_ENV_KEYS)


def build_azure_chat_completion(
    service_id: str = CHAT_SERVICE_ID,
) -> ChatCompletionClientBase:
    """既存 Azure OpenAI デプロイを SK の ChatCompletion サービスとして構築する。"""
    # 遅延 import: Azure 未設定環境でモジュール読み込み時に失敗させないため。
    from semantic_kernel.connectors.ai.open_ai import AzureChatCompletion

    return AzureChatCompletion(
        service_id=service_id,
        api_key=os.environ["AZURE_OPENAI_API_KEY"],
        api_version=os.environ["AZURE_OPENAI_API_VERSION"],
        endpoint=os.environ["AZURE_OPENAI_ENDPOINT"],
        deployment_name=os.environ["AZURE_OPENAI_DEPLOYMENT_NAME"],
    )


def build_auto_function_settings() -> PromptExecutionSettings:
    """ツールの自動呼び出しを有効にした実行設定を生成する。"""
    settings = PromptExecutionSettings()
    settings.function_choice_behavior = FunctionChoiceBehavior.Auto()
    return settings


def build_meeting_kernel(
    chat_service: ChatCompletionClientBase,
    plugin: "MeetingContextPlugin",
    recorder: "ToolCallRecorder | None" = None,
) -> Kernel:
    """サービス・文脈プラグイン・記録フィルタを束ねた Kernel を構築する。"""
    kernel = Kernel()
    kernel.add_service(chat_service)
    kernel.add_plugin(plugin, plugin_name=PLUGIN_NAME)
    if recorder is not None:
        kernel.add_filter(FilterTypes.AUTO_FUNCTION_INVOCATION, recorder.as_filter())
    return kernel


def planned_tool_call(plugin_name: str, function_name: str, **arguments: Any) -> dict:
    """FakeChatCompletion 用の「呼び出すツール」記述を生成するヘルパー。"""
    return {
        "plugin_name": plugin_name,
        "function_name": function_name,
        "arguments": dict(arguments),
    }


class FakeChatCompletion(ChatCompletionClientBase):
    """テスト/Azure 未設定環境用のフェイク ChatCompletion サービス。

    `tool_call_turns` に渡したターンを順に消化する。各ターンは
    `planned_tool_call(...)` のリストで、エージェントがそのターンで呼ぶツール群を表す。
    全ターンを消化したら `final_message` を最終応答として返す。

    SK の自動関数呼び出しループ
    （ChatCompletionClientBase.get_chat_message_contents）は
    SUPPORTS_FUNCTION_CALLING=True かつ各ターンの FunctionCallContent を順に処理する。
    これだけで「エージェントが自律的にツールを呼ぶ」挙動を実 LLM なしで再現できる。
    """

    SUPPORTS_FUNCTION_CALLING: ClassVar[bool] = True

    ai_model_id: str = "fake-meeting-agent"
    tool_call_turns: list = []
    final_message: str = "解析を完了しました。"

    _turn: int = PrivateAttr(default=0)

    async def _inner_get_chat_message_contents(
        self,
        chat_history: ChatHistory,
        settings: PromptExecutionSettings,
    ) -> list[ChatMessageContent]:
        current = self._turn
        self._turn += 1

        if current >= len(self.tool_call_turns):
            return [
                ChatMessageContent(
                    role=AuthorRole.ASSISTANT, content=self.final_message
                )
            ]

        items: list[Any] = []
        for i, call in enumerate(self.tool_call_turns[current]):
            items.append(
                FunctionCallContent(
                    id=f"fake-{current}-{i}",
                    name=f"{call['plugin_name']}-{call['function_name']}",
                    plugin_name=call["plugin_name"],
                    function_name=call["function_name"],
                    arguments=json.dumps(call.get("arguments", {}), ensure_ascii=False),
                )
            )
        return [ChatMessageContent(role=AuthorRole.ASSISTANT, items=items)]

    async def _inner_get_streaming_chat_message_contents(
        self,
        chat_history: ChatHistory,
        settings: PromptExecutionSettings,
        function_invoke_attempt: int = 0,
    ):
        # ストリーミングは本オーケストレーションでは使用しない。
        raise NotImplementedError(
            "FakeChatCompletion はストリーミングをサポートしません。"
        )
        if False:  # pragma: no cover - mypy 用の AsyncGenerator ヒント
            yield
