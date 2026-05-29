"""agent.kernel_factory のテスト。

Azure OpenAI 設定の有無判定と、テスト用フェイク ChatCompletion サービスが
「ツール呼び出しターン → 最終応答」の順で応答を返すことを検証する。
"""

from semantic_kernel.connectors.ai.prompt_execution_settings import (
    PromptExecutionSettings,
)
from semantic_kernel.contents import ChatHistory
from semantic_kernel.contents.function_call_content import FunctionCallContent

from agent.kernel_factory import (
    FakeChatCompletion,
    is_azure_configured,
    planned_tool_call,
)

ENV_KEYS = [
    "AZURE_OPENAI_API_KEY",
    "AZURE_OPENAI_API_VERSION",
    "AZURE_OPENAI_ENDPOINT",
    "AZURE_OPENAI_DEPLOYMENT_NAME",
]

PLUGIN = "meeting_context"


def _search_call():
    return planned_tool_call(PLUGIN, "search_past_meetings", keywords="予算")


def test_is_azure_configured_false_when_missing(monkeypatch):
    for k in ENV_KEYS:
        monkeypatch.delenv(k, raising=False)
    assert is_azure_configured() is False


def test_is_azure_configured_false_when_partial(monkeypatch):
    for k in ENV_KEYS:
        monkeypatch.delenv(k, raising=False)
    monkeypatch.setenv("AZURE_OPENAI_API_KEY", "x")
    assert is_azure_configured() is False


def test_is_azure_configured_true_when_all_set(monkeypatch):
    for k in ENV_KEYS:
        monkeypatch.setenv(k, "dummy")
    assert is_azure_configured() is True


async def test_fake_first_turn_returns_function_calls():
    fake = FakeChatCompletion(
        tool_call_turns=[[_search_call()]],
        final_message="完了",
    )
    msgs = await fake._inner_get_chat_message_contents(
        ChatHistory(), PromptExecutionSettings()
    )
    fcs = [i for i in msgs[0].items if isinstance(i, FunctionCallContent)]
    assert len(fcs) == 1
    assert fcs[0].plugin_name == "meeting_context"
    assert fcs[0].function_name == "search_past_meetings"


async def test_fake_returns_final_message_after_tool_turns():
    fake = FakeChatCompletion(
        tool_call_turns=[[_search_call()]],
        final_message="解析を完了しました",
    )
    await fake._inner_get_chat_message_contents(
        ChatHistory(), PromptExecutionSettings()
    )
    final = await fake._inner_get_chat_message_contents(
        ChatHistory(), PromptExecutionSettings()
    )
    assert final[0].content == "解析を完了しました"
    assert not [i for i in final[0].items if isinstance(i, FunctionCallContent)]


async def test_fake_with_no_tool_turns_returns_final_immediately():
    fake = FakeChatCompletion(tool_call_turns=[], final_message="即終了")
    msgs = await fake._inner_get_chat_message_contents(
        ChatHistory(), PromptExecutionSettings()
    )
    assert msgs[0].content == "即終了"


def test_planned_tool_call_shape():
    call = planned_tool_call("plug", "func", a=1, b="x")
    assert call["plugin_name"] == "plug"
    assert call["function_name"] == "func"
    assert call["arguments"] == {"a": 1, "b": "x"}
