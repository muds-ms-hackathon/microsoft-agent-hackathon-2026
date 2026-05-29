"""プロンプト構築関数群。各Callに渡すプロンプトを組み立てる。"""

from string import Template


def render_prompt(template: str, **kwargs: object) -> str:
    """string.Template.safe_substituteを使いプロンプト変数を展開する。
    JSONの {} をエスケープせずに済む点がstr.format()との違い。
    """
    return Template(template).safe_substitute(**kwargs)


# ──────────────────── フォーマット関数 ────────────────────


def fmt_speakers(speakers: list[dict]) -> str:
    """話者一覧をプロンプト用テキストに変換する。"""
    if not speakers:
        return "(参加者情報なし)"
    lines = []
    for s in speakers:
        name = s.get("name") or "(不明)"
        key = s.get("speaker_key", "")
        lines.append(f"- {key}: {name}")
    return "\n".join(lines)


def fmt_open_issues(open_issues: list[dict]) -> str:
    """未決事項一覧をプロンプト用テキストに変換する。"""
    if not open_issues:
        return "(なし)"
    lines = []
    for i, issue in enumerate(open_issues, 1):
        title = issue.get("title", "")
        reason = issue.get("reason", "")
        status = issue.get("status", "open")
        lines.append(f"{i}. [{status}] {title}（理由: {reason}）")
    return "\n".join(lines)


def fmt_context_all(
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
) -> str:
    """決定事項・未決事項・タスクをCall 4系のコンテキスト用テキストにまとめる。"""
    parts = []

    if decisions:
        parts.append("【決定事項】")
        for i, d in enumerate(decisions, 1):
            title = d.get("title", "")
            state = d.get("decision_state", "")
            body = d.get("body", "")
            parts.append(f"  D{i}. [{state}] {title}: {body}")

    if open_issues:
        parts.append("【未決事項】")
        for i, o in enumerate(open_issues, 1):
            title = o.get("title", "")
            reason = o.get("reason", "")
            parts.append(f"  OI{i}. {title}（{reason}）")

    if tasks:
        parts.append("【タスク】")
        for i, t in enumerate(tasks, 1):
            title = t.get("title", "")
            assignee = t.get("assignee_raw") or "(未定)"
            due = t.get("due_date_raw") or "(未定)"
            parts.append(f"  T{i}. {title}（担当: {assignee}、期限: {due}）")

    return "\n".join(parts) if parts else "(抽出済み情報なし)"


def fmt_due_date_raws(tasks: list[dict]) -> str:
    """タスクの due_date_raw を抽出してカンマ区切りで返す。空の場合は空文字列。"""
    raws = [
        t["due_date_raw"]
        for t in tasks
        if t.get("due_date_raw") and str(t["due_date_raw"]).strip()
    ]
    return ", ".join(raws)


def fmt_prev_open_issues(prev_open_issues: list[dict]) -> str:
    """前回の未決事項をプロンプト用テキストに変換する。"""
    if not prev_open_issues:
        return "(なし)"
    lines = []
    for i, issue in enumerate(prev_open_issues, 1):
        # 旧DB形式（topic）との後方互換のためフォールバックを保持
        title = issue.get("title") or issue.get("topic", "")
        reason = issue.get("reason", "")
        rc = issue.get("recurrence_count", 1)
        lines.append(f"{i}. {title}（理由: {reason}、継続回数: {rc}回）")
    return "\n".join(lines)


def fmt_prev_tasks(prev_tasks: list[dict]) -> str:
    """前回のタスクをプロンプト用テキストに変換する（n番号付き）。"""
    if not prev_tasks:
        return "(なし)"
    lines = []
    for t in prev_tasks:
        n = t.get("n", "")
        title = t.get("title", "")
        assignee = t.get("assignee_raw") or "(未定)"
        due = t.get("due_date_raw") or "(未定)"
        coc = t.get("carried_over_count", 0)
        lines.append(
            f"T{n}. {title}（担当: {assignee}、期限: {due}、持ち越し: {coc}回）"
        )
    return "\n".join(lines)


def fmt_decisions_for_call6(decisions: list[dict]) -> str:
    """Call 6用：決定事項を箇条書きで整形する。"""
    if not decisions:
        return "(なし)"
    lines = []
    for d in decisions:
        title = d.get("title", "")
        state = d.get("decision_state", "")
        body = d.get("body", "")
        item_id = d.get("id", "")
        lines.append(f"- [{item_id}][{state}] {title}: {body}")
    return "\n".join(lines)


def fmt_open_issues_for_call6(open_issues: list[dict]) -> str:
    """Call 6用：未決事項を箇条書きで整形する。"""
    if not open_issues:
        return "(なし)"
    lines = []
    for o in open_issues:
        title = o.get("title", "")
        reason = o.get("reason", "")
        status = o.get("status", "open")
        item_id = o.get("id", "")
        rc = o.get("recurrence_count", 1)
        lines.append(f"- [{item_id}][{status}] {title}（{reason}、{rc}回目）")
    return "\n".join(lines)


def fmt_tasks_for_call6(tasks: list[dict]) -> str:
    """Call 6用：タスクを箇条書きで整形する。"""
    if not tasks:
        return "(なし)"
    lines = []
    for t in tasks:
        title = t.get("title", "")
        assignee = t.get("assignee_raw") or "(未定)"
        due = t.get("due_date_raw") or t.get("due_date") or "(未定)"
        priority = t.get("priority", "required")
        item_id = t.get("id", "")
        lines.append(
            f"- [{item_id}][{priority}] {title}（担当: {assignee}、期限: {due}）"
        )
    return "\n".join(lines)


def fmt_ambiguities_for_call6(ambiguities: list[dict]) -> str:
    """Call 6用：曖昧情報を箇条書きで整形する。"""
    if not ambiguities:
        return "(なし)"
    lines = []
    for a in ambiguities:
        body = a.get("body", "")
        severity = a.get("severity", "low")
        atype = a.get("ambiguity_type", "")
        lines.append(f"- [{severity}][{atype}] {body}")
    return "\n".join(lines)


# ──────────────────── Callプロンプト構築 ────────────────────


def build_call2_prompt(
    prompts: dict,
    transcript: str,
    speakers: list[dict],
    rag_context: str,
    prev_open_issues: list[dict] | None = None,
) -> str:
    """Call 2（決定事項・未決事項抽出）のプロンプトを構築する。"""
    speakers_text = fmt_speakers(speakers)

    if prev_open_issues:
        prev_text = fmt_prev_open_issues(prev_open_issues)
        section = render_prompt(
            prompts["continuity_call2_prev_open_issues"]["template"],
            prev_open_issues=prev_text,
        )
        prev_open_issues_section = section
    else:
        prev_open_issues_section = ""

    return render_prompt(
        prompts["call2"]["template"],
        transcript=transcript,
        speakers=speakers_text,
        rag_context=rag_context,
        prev_open_issues_section=prev_open_issues_section,
    )


def build_call3_prompt(
    prompts: dict,
    transcript: str,
    speakers: list[dict],
    decisions: list[dict],
    open_issues: list[dict],
    rag_context: str,
    prev_tasks: list[dict] | None = None,
) -> str:
    """Call 3（タスク抽出）のプロンプトを構築する。"""
    speakers_text = fmt_speakers(speakers)
    context_summary = fmt_context_all(decisions, open_issues, [])

    if prev_tasks:
        prev_text = fmt_prev_tasks(prev_tasks)
        section = render_prompt(
            prompts["continuity_call3_prev_tasks"]["template"],
            prev_tasks=prev_text,
        )
        prev_tasks_section = section
    else:
        prev_tasks_section = ""

    return render_prompt(
        prompts["call3"]["template"],
        transcript=transcript,
        speakers=speakers_text,
        context_summary=context_summary,
        prev_tasks_section=prev_tasks_section,
    )


def build_call6_prompt(
    prompts: dict,
    transcript: str,
    speakers: list[dict],
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
    ambiguities: list[dict],
    estimation_note: str,
    suggested_participants: str,
    change_summary: str | None = None,
) -> str:
    """Call 6（サマリー・推奨アジェンダ生成）のプロンプトを構築する。"""
    speakers_text = fmt_speakers(speakers)

    if change_summary:
        section = render_prompt(
            prompts["continuity_call6_change_summary"]["template"],
            change_summary=change_summary,
        )
        change_summary_section = section
    else:
        change_summary_section = ""

    return render_prompt(
        prompts["call6"]["template"],
        speakers=speakers_text,
        decisions_summary=fmt_decisions_for_call6(decisions),
        open_issues_summary=fmt_open_issues_for_call6(open_issues),
        tasks_summary=fmt_tasks_for_call6(tasks),
        ambiguities_summary=fmt_ambiguities_for_call6(ambiguities),
        estimation_note=estimation_note,
        suggested_participants=suggested_participants,
        change_summary_section=change_summary_section,
    )
