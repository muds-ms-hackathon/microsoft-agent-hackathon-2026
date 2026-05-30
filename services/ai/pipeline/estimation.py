"""次回会議所要時間の見積もり計算。LLMには任せずPythonで計算する。"""


def calc_estimation(
    tasks: list[dict],
    open_issues: list[dict],
    decisions: list[dict],
) -> dict:
    """次回会議の所要時間見積もり内訳を計算する。
    各カテゴリごとの件数と分数を返す。
    """
    breakdown: dict[str, dict] = {}

    # 必須タスクのステータス確認（2分/件）
    required_tasks = [t for t in tasks if t.get("priority") == "required"]
    if required_tasks:
        breakdown["required_task_check"] = {
            "count": len(required_tasks),
            "minutes": len(required_tasks) * 2,
        }

    # 新規未決事項の議論（5分/件）、再発未決事項（8分/件）
    new_issues = [o for o in open_issues if o.get("recurrence_count", 1) == 1]
    recurring_issues = [o for o in open_issues if o.get("recurrence_count", 1) >= 2]
    if new_issues:
        breakdown["open_issue_new"] = {
            "count": len(new_issues),
            "minutes": len(new_issues) * 5,
        }
    if recurring_issues:
        breakdown["open_issue_recurring"] = {
            "count": len(recurring_issues),
            "minutes": len(recurring_issues) * 8,
        }

    # 期限超過タスクの確認（3分/件）
    overdue_tasks = [t for t in tasks if t.get("is_overdue", False)]
    if overdue_tasks:
        breakdown["overdue_task"] = {
            "count": len(overdue_tasks),
            "minutes": len(overdue_tasks) * 3,
        }

    # 仮決定の再確認（5分/件）
    tentative = [d for d in decisions if d.get("decision_state") == "tentative"]
    if tentative:
        breakdown["tentative_reconfirm"] = {
            "count": len(tentative),
            "minutes": len(tentative) * 5,
        }

    # バッファ（10分固定）
    breakdown["buffer"] = {"count": 1, "minutes": 10}

    total = sum(v["minutes"] for v in breakdown.values())
    return {"breakdown": breakdown, "total_minutes": total}


def calc_alert_level(estimation: dict) -> str:
    """見積もり合計分数からアラートレベルを計算する。
    LLMには任せずPythonで判定する。
    """
    total = estimation.get("total_minutes", 0)
    if total >= 60:
        return "high"
    if total >= 30:
        return "medium"
    return "low"


def fmt_estimation_note(estimation: dict) -> str:
    """見積もり内訳を人間が読めるテキストに変換する。"""
    total = estimation.get("total_minutes", 0)
    breakdown = estimation.get("breakdown", {})
    lines = [f"次回会議の想定所要時間: 約{total}分"]
    label_map = {
        "required_task_check": "必須タスク確認",
        "open_issue_new": "新規未決事項",
        "open_issue_recurring": "継続未決事項",
        "overdue_task": "期限超過タスク",
        "tentative_reconfirm": "仮決定の再確認",
        "buffer": "バッファ",
    }
    for key, val in breakdown.items():
        label = label_map.get(key, key)
        count = val.get("count", 0)
        minutes = val.get("minutes", 0)
        if count <= 0:
            # 件数 0 のカテゴリは「N分」のみ表示し、ZeroDivisionError を回避する。
            lines.append(f"  - {label}: 0件 = {minutes}分")
            continue
        per = minutes // count
        lines.append(f"  - {label}: {count}件 × {per}分 = {minutes}分")
    return "\n".join(lines)
