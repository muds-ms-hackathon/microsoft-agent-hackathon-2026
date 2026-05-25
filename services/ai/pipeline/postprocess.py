"""後処理関数群。絵文字除去・担当者解決・ID採番など。"""

import re
import unicodedata

_EMOJI_PATTERN = re.compile(
    "["
    "\U0001f600-\U0001f64f"  # Emoticons
    "\U0001f300-\U0001f5ff"  # Misc Symbols and Pictographs
    "\U0001f680-\U0001f6ff"  # Transport and Map
    "\U0001f1e0-\U0001f1ff"  # Flags
    "\U0001f900-\U0001f9ff"  # Supplemental Symbols and Pictographs
    "\U0001fa00-\U0001fa6f"  # Chess Symbols
    "\U0001fa70-\U0001faff"  # Symbols and Pictographs Extended-A
    "☀-⛿"  # Miscellaneous Symbols
    "✀-➿"  # Dingbats
    "︀-️"  # Variation Selectors
    "‍"  # Zero Width Joiner
    "]+",
    flags=re.UNICODE,
)


def remove_emoji(text: str) -> str:
    """テキストから絵文字を除去する。source_quoteには適用しない。"""
    return _EMOJI_PATTERN.sub("", text).strip()


def get_flags(item: dict) -> list[str]:
    """アイテムの ambiguity_flags を list[str] で返す。"""
    flags = item.get("ambiguity_flags")
    if isinstance(flags, list):
        return [str(f) for f in flags]
    return []


def normalize_for_similarity(text: str) -> str:
    """テキストをUNFKC正規化・小文字化・空白除去して比較用文字列を返す。"""
    text = unicodedata.normalize("NFKC", text)
    text = text.lower().strip()
    text = re.sub(r"\s+", "", text)
    return text


def infer_assignee_resolution_status(
    assignee_raw: str | None, speakers: list[dict]
) -> str:
    """assignee_rawがspeakersのいずれかに一致するか推定する。
    resolved: 一致あり、unresolved: 一致なし、unknown: assignee_raw自体が不明
    """
    if not assignee_raw:
        return "unknown"
    norm_raw = normalize_for_similarity(assignee_raw)
    for s in speakers:
        name = s.get("name") or ""
        if name and normalize_for_similarity(name) in norm_raw:
            return "resolved"
    return "unresolved"


def merge_ambiguities(
    ambiguities_quality: list[dict],
    ambiguities_content: list[dict],
) -> list[dict]:
    """品質起因と内容起因の曖昧情報を統合する。重複排除は行わない。"""
    return list(ambiguities_quality) + list(ambiguities_content)


def _make_id_prefix(meeting_date: str) -> str:
    """'YYYY-MM-DD' → 'YYYYMMDD' に変換する。"""
    return meeting_date.replace("-", "")


def assign_ids_and_resolve(
    meeting_date: str,
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
    ambiguities: list[dict],
) -> tuple[list[dict], list[dict], list[dict], list[dict]]:
    """各アイテムにIDを採番し、cross-referenceを解決する。
    ID形式: D-YYYYMMDD-001, OI-YYYYMMDD-001, T-YYYYMMDD-001, A-YYYYMMDD-001
    """
    date_str = _make_id_prefix(meeting_date)

    for i, d in enumerate(decisions, 1):
        d["id"] = f"D-{date_str}-{i:03d}"

    for i, o in enumerate(open_issues, 1):
        o["id"] = f"OI-{date_str}-{i:03d}"

    for i, t in enumerate(tasks, 1):
        t["id"] = f"T-{date_str}-{i:03d}"

    for i, a in enumerate(ambiguities, 1):
        a["id"] = f"A-{date_str}-{i:03d}"

    # affected_item_idsの参照を実際のIDに解決する（現状はパススルー）
    # 将来的にはLLMが返した仮IDを実IDに置換する

    return decisions, open_issues, tasks, ambiguities


def apply_due_date_conversions(
    tasks: list[dict], conversions: list[dict]
) -> list[dict]:
    """Call 5の変換結果をタスクのdue_dateフィールドに適用する。"""
    conversion_map = {
        c["original"]: c.get("resolved") for c in conversions if c.get("original")
    }
    for task in tasks:
        raw = task.get("due_date_raw")
        if raw and raw in conversion_map:
            task["due_date"] = conversion_map[raw]
    return tasks
