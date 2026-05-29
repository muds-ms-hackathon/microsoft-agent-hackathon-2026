"""agent.plugins.MeetingContextPlugin のテスト。

各ツール（@kernel_function）が既存ロジック（estimation / continuity / rag.search）と
同じ結果を返し、収集結果をプラグインに保持することを検証する。
"""

from agent.plugins import MeetingContextPlugin
from pipeline.estimation import calc_alert_level, calc_estimation, fmt_estimation_note
from rag.search import build_mock_rag_retrieval, build_suggested_participants_context


def _make_plugin(
    previous_report_json: dict | None = None,
) -> MeetingContextPlugin:
    return MeetingContextPlugin(
        keywords=["予算", "スケジュール"],
        previous_report_json=previous_report_json,
        recurring_meeting_id="rec-1",
        tasks=[{"title": "資料作成", "priority": "required"}],
        open_issues=[{"title": "予算確定", "recurrence_count": 2}],
        decisions=[{"title": "方針A", "decision_state": "tentative"}],
    )


def test_estimate_tool_matches_calc_estimation():
    plugin = _make_plugin()
    note = plugin.estimate_next_meeting_duration()

    expected = calc_estimation(plugin._tasks, plugin._open_issues, plugin._decisions)
    assert plugin.estimation == expected
    assert plugin.estimation_note == fmt_estimation_note(expected)
    assert plugin.alert_level == calc_alert_level(expected)
    assert note == plugin.estimation_note


def test_search_tool_matches_mock_rag():
    plugin = _make_plugin()
    plugin.search_related_past_meetings()

    expected = build_mock_rag_retrieval("rec-1", ["予算", "スケジュール"])
    assert plugin.rag_retrieval == expected
    assert plugin.suggested_participants == build_suggested_participants_context(
        expected
    )


def test_summarize_changes_with_previous_report():
    prev = {
        "tasks": [{"title": "完了済み", "status": "done"}],
        "open_issues": [{"title": "継続課題", "status": "open", "recurrence_count": 3}],
    }
    plugin = _make_plugin(previous_report_json=prev)
    summary = plugin.summarize_previous_changes()

    assert plugin.change_summary == summary
    assert "完了タスク" in summary or "継続" in summary


def test_summarize_changes_without_previous_report():
    plugin = _make_plugin(previous_report_json=None)
    summary = plugin.summarize_previous_changes()

    # 前回情報がないときは change_summary を None のままにする（Call6 は None 許容）。
    assert plugin.change_summary is None
    assert "前回" in summary
