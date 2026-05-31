"""agent.recorder.ToolCallRecorder と Kernel 組み立てのテスト。

フェイク ChatCompletion で「エージェントが自律的に 1 つ以上のツールを呼び、
その呼び出しが recorder に記録される」ことを検証する（Issue 受け入れ基準①）。
"""

from semantic_kernel.contents import ChatHistory

from agent.kernel_factory import (
    FakeChatCompletion,
    build_auto_function_settings,
    build_meeting_kernel,
    planned_tool_call,
)
from agent.plugins import MeetingContextPlugin
from agent.recorder import ToolCallRecorder

PLUGIN = "meeting_context"


def _make_plugin() -> MeetingContextPlugin:
    return MeetingContextPlugin(
        keywords=["予算"],
        previous_report_json=None,
        recurring_meeting_id="rec-1",
        tasks=[{"title": "資料作成", "priority": "required"}],
        open_issues=[{"title": "予算確定", "recurrence_count": 2}],
        decisions=[],
    )


async def _run_agent(fake: FakeChatCompletion, plugin, recorder):
    kernel = build_meeting_kernel(fake, plugin, recorder)
    settings = build_auto_function_settings()
    history = ChatHistory()
    history.add_user_message("この会議を解析するための文脈を集めてください。")
    return await fake.get_chat_message_contents(
        chat_history=history, settings=settings, kernel=kernel
    )


async def test_agent_autonomously_calls_tools_and_records():
    plugin = _make_plugin()
    recorder = ToolCallRecorder()
    fake = FakeChatCompletion(
        tool_call_turns=[
            [
                planned_tool_call(PLUGIN, "estimate_next_meeting_duration"),
                planned_tool_call(PLUGIN, "search_related_past_meetings"),
            ]
        ],
        final_message="文脈収集を完了しました",
    )

    result = await _run_agent(fake, plugin, recorder)

    # 最終応答が返る
    assert result[-1].content == "文脈収集を完了しました"
    # エージェントが 1 つ以上のツールを自律的に呼んでいる（受け入れ基準①）
    assert len(recorder.calls) >= 1
    assert recorder.counts[f"{PLUGIN}-estimate_next_meeting_duration"] == 1
    assert recorder.counts[f"{PLUGIN}-search_related_past_meetings"] == 1
    # ツールの副作用（収集結果）がプラグインに反映されている
    assert plugin.estimation is not None
    assert plugin.rag_retrieval is not None


async def test_recorder_counts_repeated_calls():
    recorder = ToolCallRecorder()
    recorder.record_call(f"{PLUGIN}-estimate_next_meeting_duration")
    recorder.record_call(f"{PLUGIN}-estimate_next_meeting_duration")
    recorder.record_call(f"{PLUGIN}-search_related_past_meetings")

    assert recorder.counts == {
        f"{PLUGIN}-estimate_next_meeting_duration": 2,
        f"{PLUGIN}-search_related_past_meetings": 1,
    }
    assert recorder.total == 3


async def test_recorder_summary_lists_each_tool():
    recorder = ToolCallRecorder()
    recorder.record_call("a-x")
    recorder.record_call("a-x")
    summary = recorder.summary()
    assert "a-x" in summary
    assert "2" in summary
