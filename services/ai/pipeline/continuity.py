"""前回会議データから継続コンテキストを準備する関数群。"""


def prepare_prev_open_issues_for_call2(previous_report_json: dict) -> list:
    """前回のopen_issuesのうち、resolved_humanのみを除外して返す。
    resolved_aiは人間未確認のため持ち越しを継続する。
    """
    open_issues = previous_report_json.get("open_issues", [])
    return [
        o for o in open_issues if o.get("status") != "resolved_human"
    ]


def prepare_prev_tasks_for_call3(previous_report_json: dict) -> list:
    """前回のtasksのうち、done/rejectedのものを除外して返す。
    各タスクにn番号を付与してから返す。
    """
    tasks = previous_report_json.get("tasks", [])
    incomplete = [
        t for t in tasks if t.get("status") not in {"done", "rejected"}
    ]
    for i, t in enumerate(incomplete, 1):
        t["n"] = i
    return incomplete


def fmt_change_summary(
    completed_tasks: list,
    carried_over_tasks: list,
    resolved_issues: list,
    carried_over_issues: list,
    high_recurrence_issues: list,
) -> str:
    """Call 6に渡す「前回からの変化サマリー」テキストを生成する。"""
    parts = []
    if completed_tasks:
        titles = "、".join(
            t.get("title", "") for t in completed_tasks[:3]
        )
        suffix = f"（他{len(completed_tasks) - 3}件）" if len(completed_tasks) > 3 else ""
        parts.append(f"✅ 完了タスク {len(completed_tasks)}件: {titles}{suffix}")
    if carried_over_tasks:
        parts.append(f"⏩ 持ち越しタスク: {len(carried_over_tasks)}件")
    if resolved_issues:
        topics = "、".join(o.get("topic", "") for o in resolved_issues[:3])
        parts.append(f"✅ 解決した未決事項: {topics}")
    if carried_over_issues:
        parts.append(f"⏩ 持ち越し未決事項: {len(carried_over_issues)}件")
    if high_recurrence_issues:
        topics = "、".join(
            o.get("topic", "") for o in high_recurrence_issues
        )
        parts.append(f"⚠️ 3回以上継続している未決事項: {topics}")
    return "\n".join(parts) if parts else "(前回との変化なし)"


def prepare_change_summary_for_call6(previous_report_json: dict) -> str:
    """fmt_change_summaryに渡す引数を前回JSONから計算する。"""
    tasks = previous_report_json.get("tasks", [])
    open_issues = previous_report_json.get("open_issues", [])

    completed_tasks = [
        t for t in tasks if t.get("status") in {"done", "rejected"}
    ]
    carried_over_tasks = [
        t for t in tasks if t.get("status") not in {"done", "rejected"}
    ]
    resolved_issues = [
        o for o in open_issues if o.get("status") == "resolved_human"
    ]
    carried_over_issues = [
        o for o in open_issues if o.get("status") != "resolved_human"
    ]
    high_recurrence_issues = [
        o for o in open_issues if o.get("recurrence_count", 1) >= 3
    ]

    return fmt_change_summary(
        completed_tasks=completed_tasks,
        carried_over_tasks=carried_over_tasks,
        resolved_issues=resolved_issues,
        carried_over_issues=carried_over_issues,
        high_recurrence_issues=high_recurrence_issues,
    )
