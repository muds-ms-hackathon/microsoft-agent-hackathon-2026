"""エージェント型オーケストレーション。

抽出フェーズ（Call1〜5）で得た中間結果をツールとしてエージェントに渡し、
「次回会議計画に必要な文脈（見積もり・関連会議・前回変化）をどのツールで集めるか」を
自律的に決めさせる。集めた結果は既存パイプライン（Call6・最終組み立て）に供給する。

エージェントがツールを呼ばなかった場合や実行に失敗した場合でも解析を止めないよう、
未収集の文脈は直接計算でフォールバックして完成させる。
"""

import logging
from dataclasses import dataclass, field

from semantic_kernel.connectors.ai.chat_completion_client_base import (
    ChatCompletionClientBase,
)
from semantic_kernel.contents import ChatHistory

from agent.kernel_factory import build_auto_function_settings, build_meeting_kernel
from agent.plugins import MeetingContextPlugin
from agent.recorder import ToolCallRecorder
from pipeline.continuity import prepare_change_summary_for_call6
from pipeline.estimation import calc_alert_level, calc_estimation, fmt_estimation_note
from rag.search import build_mock_rag_retrieval, build_suggested_participants_context

logger = logging.getLogger(__name__)

# エージェントへの指示。次回会議計画に必要な文脈を、ツールを使って集めさせる。
_AGENT_INSTRUCTION = (
    "あなたは定例会議の運用を支援する解析エージェントです。"
    "今回の会議の抽出結果が与えられています。次回会議の推奨アジェンダを作るために、"
    "利用可能なツールを使って次の文脈を集めてください: "
    "(1) 次回会議の所要時間見積もり、(2) 関連する過去会議の文脈、"
    "(3) 前回会議からの変化の要約。"
    "必要なツールを自分で判断して呼び出し、集め終えたら簡潔に完了を報告してください。"
)


@dataclass
class PlanningContext:
    """エージェントが集めた次回会議計画の文脈。"""

    estimation: dict
    estimation_note: str
    alert_level: str
    rag_retrieval: dict
    suggested_participants: str
    change_summary: str | None
    tool_calls: dict[str, int] = field(default_factory=dict)
    tool_call_log: list[str] = field(default_factory=list)

    @property
    def tool_call_count(self) -> int:
        return len(self.tool_call_log)


async def gather_planning_context(
    *,
    keywords: list[str],
    previous_report_json: dict | None,
    recurring_meeting_id: str | None,
    tasks: list[dict],
    open_issues: list[dict],
    decisions: list[dict],
    chat_service: ChatCompletionClientBase,
) -> PlanningContext:
    """エージェントにツールを呼ばせて次回会議計画の文脈を集める。

    エージェント実行に失敗した場合は直接計算にフォールバックする。
    """
    plugin = MeetingContextPlugin(
        keywords=keywords,
        previous_report_json=previous_report_json,
        recurring_meeting_id=recurring_meeting_id,
        tasks=tasks,
        open_issues=open_issues,
        decisions=decisions,
    )
    recorder = ToolCallRecorder()

    try:
        kernel = build_meeting_kernel(chat_service, plugin, recorder)
        settings = build_auto_function_settings()
        history = ChatHistory()
        history.add_system_message(_AGENT_INSTRUCTION)
        history.add_user_message(
            _format_extraction_summary(tasks, open_issues, decisions)
        )
        await chat_service.get_chat_message_contents(
            chat_history=history, settings=settings, kernel=kernel
        )
        recorder.log_summary()
    except Exception as e:
        # 実行に失敗しても解析は継続する（フォールバックで文脈を完成させる）。
        logger.warning("エージェント実行に失敗、直接計算にフォールバック: %s", e)

    _fill_missing_context(plugin)

    assert plugin.estimation is not None
    assert plugin.estimation_note is not None
    assert plugin.alert_level is not None
    assert plugin.rag_retrieval is not None
    assert plugin.suggested_participants is not None

    return PlanningContext(
        estimation=plugin.estimation,
        estimation_note=plugin.estimation_note,
        alert_level=plugin.alert_level,
        rag_retrieval=plugin.rag_retrieval,
        suggested_participants=plugin.suggested_participants,
        change_summary=plugin.change_summary,
        tool_calls=recorder.counts,
        tool_call_log=list(recorder.calls),
    )


def _format_extraction_summary(
    tasks: list[dict], open_issues: list[dict], decisions: list[dict]
) -> str:
    """エージェントに渡す抽出結果サマリー。"""
    return (
        f"今回の抽出結果: タスク{len(tasks)}件、"
        f"未決事項{len(open_issues)}件、決定事項{len(decisions)}件。"
    )


def _fill_missing_context(plugin: MeetingContextPlugin) -> None:
    """エージェントが呼ばなかったツール分を直接計算で補完する。"""
    if plugin.estimation is None:
        estimation = calc_estimation(
            plugin._tasks, plugin._open_issues, plugin._decisions
        )
        plugin.estimation = estimation
        plugin.alert_level = calc_alert_level(estimation)
        plugin.estimation_note = fmt_estimation_note(estimation)
    if plugin.rag_retrieval is None:
        rag = build_mock_rag_retrieval(plugin._recurring_meeting_id, plugin._keywords)
        plugin.rag_retrieval = rag
        plugin.suggested_participants = build_suggested_participants_context(rag)
    if plugin.change_summary is None and plugin._previous_report_json:
        plugin.change_summary = prepare_change_summary_for_call6(
            plugin._previous_report_json
        )
