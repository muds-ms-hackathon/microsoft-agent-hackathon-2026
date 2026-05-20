"""出力バリデーション関数群。"""
import logging

from .postprocess import normalize_for_similarity

logger = logging.getLogger(__name__)

# タスクのdue_date_rawに含まれていると日付混入の疑いがある相対表現キーワード
DATE_KEYWORDS = [
    "月曜", "火曜", "水曜", "木曜", "金曜", "土曜", "日曜",
    "来週", "今週", "先週", "来月", "今月", "今日", "明日", "明後日",
]


def make_warning(warning_type: str, message: str, affected_ids: list) -> dict:
    """バリデーション警告オブジェクトを生成する。"""
    return {
        "type": warning_type,
        "message": message,
        "affected_ids": affected_ids,
    }


def validate_outputs(
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
    ambiguities: list[dict],
    speakers: list[dict] | None = None,
) -> list[dict]:
    """抽出結果の内容レベルバリデーションを行い、警告リストを返す。"""
    warnings = []
    speakers = speakers or []

    # タスクの due_date_raw に相対表現キーワードが残っていないか確認する
    # （Call 5で変換済みのはずだが、変換漏れを検出する）
    for task in tasks:
        due_raw = task.get("due_date_raw") or ""
        if any(kw in due_raw for kw in DATE_KEYWORDS) and not task.get("due_date"):
            logger.warning(
                "期限変換漏れの疑い: %s -> %s", task.get("id", ""), due_raw
            )
            warnings.append(
                make_warning(
                    "unresolved_due_date",
                    f"期限が絶対日付に変換されていません: '{due_raw}'",
                    [task.get("id", "")],
                )
            )

    # 担当者が未解決のタスクを検出する
    for task in tasks:
        if task.get("assignee_resolution_status") == "unresolved":
            warnings.append(
                make_warning(
                    "unresolved_assignee",
                    "担当者を参加者と紐付けられませんでした: "
                    f"'{task.get('assignee_raw', '')}'",
                    [task.get("id", "")],
                )
            )

    # 決定事項のトピック重複を検出する
    seen_decisions: list[str] = []
    for d in decisions:
        norm = normalize_for_similarity(d.get("topic", ""))
        for seen in seen_decisions:
            if norm and seen and (norm in seen or seen in norm):
                warnings.append(
                    make_warning(
                        "duplicate_decision",
                        f"類似した決定事項が複数あります: '{d.get('topic', '')}'",
                        [d.get("id", "")],
                    )
                )
                break
        seen_decisions.append(norm)

    return warnings
