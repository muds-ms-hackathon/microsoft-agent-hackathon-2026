"""エージェントが自律的に呼び出すツール群（Semantic Kernel プラグイン）。

既存の純関数ロジック（estimation / continuity / rag.search）を `@kernel_function`
でラップして公開する。各ツールは解析ジョブの文脈にバインドされ、LLM 側の引数捏造を
避けるため入力はバインド済み文脈から取る。収集結果はプラグインに保持し、
オーケストレーターが取り出して既存パイプラインに供給する。
"""

import logging

from semantic_kernel.functions import kernel_function

from pipeline.continuity import prepare_change_summary_for_call6
from pipeline.estimation import calc_alert_level, calc_estimation, fmt_estimation_note
from rag.search import build_mock_rag_retrieval, build_suggested_participants_context

logger = logging.getLogger(__name__)


class MeetingContextPlugin:
    """次回会議計画に必要な文脈を集めるツール群。

    解析の抽出フェーズ（Call1〜5）で得た中間結果をバインドし、エージェントが
    「どのツールをいつ呼ぶか」を自律的に決められるようにする。Call6（サマリー・
    推奨アジェンダ生成）に渡す estimation_note / suggested_participants /
    change_summary をここで用意する。
    """

    def __init__(
        self,
        *,
        keywords: list[str],
        previous_report_json: dict | None,
        recurring_meeting_id: str | None,
        tasks: list[dict],
        open_issues: list[dict],
        decisions: list[dict],
    ) -> None:
        self._keywords = keywords
        self._previous_report_json = previous_report_json
        self._recurring_meeting_id = recurring_meeting_id
        self._tasks = tasks
        self._open_issues = open_issues
        self._decisions = decisions

        # エージェントが呼び出した結果の収集先。未呼び出しなら None のまま。
        self.estimation: dict | None = None
        self.estimation_note: str | None = None
        self.alert_level: str | None = None
        self.rag_retrieval: dict | None = None
        self.suggested_participants: str | None = None
        self.change_summary: str | None = None

    @kernel_function(
        name="estimate_next_meeting_duration",
        description=(
            "今回抽出したタスク・未決事項・決定事項から、次回会議の想定所要時間と"
            "アラートレベルを見積もる。会議の負荷を把握したいときに呼ぶ。"
        ),
    )
    def estimate_next_meeting_duration(self) -> str:
        estimation = calc_estimation(self._tasks, self._open_issues, self._decisions)
        self.estimation = estimation
        self.alert_level = calc_alert_level(estimation)
        self.estimation_note = fmt_estimation_note(estimation)
        logger.info(
            "[tool] estimate_next_meeting_duration: %d分 (%s)",
            estimation["total_minutes"],
            self.alert_level,
        )
        return self.estimation_note

    @kernel_function(
        name="search_related_past_meetings",
        description=(
            "今回のキーワードに関連する過去会議を検索し、推奨参加者などの文脈を得る。"
            "推奨アジェンダの根拠を補強したいときに呼ぶ。"
        ),
    )
    def search_related_past_meetings(self) -> str:
        rag = build_mock_rag_retrieval(self._recurring_meeting_id, self._keywords)
        self.rag_retrieval = rag
        self.suggested_participants = build_suggested_participants_context(rag)
        logger.info(
            "[tool] search_related_past_meetings: 関連会議 %d件",
            len(rag.get("related_past_meetings", [])),
        )
        return self.suggested_participants

    @kernel_function(
        name="summarize_previous_changes",
        description=(
            "前回会議からの変化（完了タスク・持ち越し・解決/継続中の未決事項）を要約する。"
            "前回からの流れを推奨アジェンダに反映したいときに呼ぶ。"
        ),
    )
    def summarize_previous_changes(self) -> str:
        if not self._previous_report_json:
            self.change_summary = None
            logger.info("[tool] summarize_previous_changes: 前回情報なし")
            return "(前回会議の情報がないため変化なし)"
        summary = prepare_change_summary_for_call6(self._previous_report_json)
        self.change_summary = summary
        logger.info("[tool] summarize_previous_changes: 要約を生成")
        return summary
