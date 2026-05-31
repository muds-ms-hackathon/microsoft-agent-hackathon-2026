"""agent.orchestrator.gather_planning_context のテスト。

エージェントがツールを自律的に呼んで次回会議計画の文脈を集めること、
ツールを呼ばなかった場合でも直接計算でフォールバックして文脈を完成させることを検証する。
"""

from agent.kernel_factory import FakeChatCompletion, planned_tool_call
from agent.orchestrator import gather_planning_context

PLUGIN = "meeting_context"


def _gather_kwargs(**overrides):
    base = dict(
        keywords=["予算"],
        previous_report_json=None,
        recurring_meeting_id="rec-1",
        tasks=[{"title": "資料作成", "priority": "required"}],
        open_issues=[{"title": "予算確定", "recurrence_count": 2}],
        decisions=[],
    )
    base.update(overrides)
    return base


async def test_gather_runs_agent_and_harvests_tool_results():
    fake = FakeChatCompletion(
        tool_call_turns=[
            [
                planned_tool_call(PLUGIN, "estimate_next_meeting_duration"),
                planned_tool_call(PLUGIN, "search_related_past_meetings"),
                planned_tool_call(PLUGIN, "summarize_previous_changes"),
            ]
        ],
        final_message="文脈収集完了",
    )
    prev = {
        "tasks": [{"title": "完了済み", "status": "done"}],
        "open_issues": [{"title": "継続課題", "status": "open", "recurrence_count": 3}],
    }
    ctx = await gather_planning_context(
        chat_service=fake, **_gather_kwargs(previous_report_json=prev)
    )

    assert ctx.estimation is not None
    assert "想定所要時間" in ctx.estimation_note
    assert ctx.alert_level in {"low", "medium", "high"}
    assert ctx.suggested_participants is not None
    assert ctx.change_summary is not None
    # エージェントが自律的に 3 ツールを呼んだ記録が残る
    assert ctx.tool_call_count == 3
    assert ctx.tool_calls[f"{PLUGIN}-estimate_next_meeting_duration"] == 1


async def test_gather_falls_back_when_agent_skips_tools():
    # ツールを 1 つも呼ばずに即終了するエージェント。
    fake = FakeChatCompletion(tool_call_turns=[], final_message="何もしない")
    ctx = await gather_planning_context(
        chat_service=fake, **_gather_kwargs(previous_report_json=None)
    )

    # 直接計算でフォールバックし、文脈は完成している。
    assert ctx.estimation is not None
    assert ctx.estimation_note
    assert ctx.suggested_participants is not None
    # 前回情報がないので change_summary は None。
    assert ctx.change_summary is None
    # エージェントは何も呼んでいない。
    assert ctx.tool_call_count == 0
