"""メイン会議解析パイプライン（Call 1〜6）。"""
import hashlib
import json
import logging
import tomllib
from datetime import datetime, timezone
from pathlib import Path

from llm.client import LLMClient
from llm.json_runner import run_llm_call
from pipeline.continuity import (
    prepare_change_summary_for_call6,
    prepare_prev_open_issues_for_call2,
    prepare_prev_tasks_for_call3,
)
from pipeline.estimation import calc_alert_level, calc_estimation
from pipeline.postprocess import (
    apply_due_date_conversions,
    assign_ids_and_resolve,
    infer_assignee_resolution_status,
    merge_ambiguities,
    remove_emoji,
)
from pipeline.prompt_builders import (
    build_call2_prompt,
    build_call3_prompt,
    build_call6_prompt,
    fmt_context_all,
    fmt_due_date_raws,
    render_prompt,
)
from pipeline.validation import validate_outputs
from rag.indexer import build_rag_document
from rag.search import build_mock_rag_retrieval, build_suggested_participants_context
from schemas.analysis import AnalysisJobInput, AnalysisRunResult

logger = logging.getLogger(__name__)

_PIPELINE_VERSION = "1.0.0"
_PROMPT_VERSION = "1.0.0"
_PROMPTS_PATH = (
    Path(__file__).parent.parent / "prompts" / "meeting_analysis_prompts.toml"
)


def _load_prompts() -> dict:
    """TOMLプロンプトファイルを読み込む。"""
    with open(_PROMPTS_PATH, "rb") as f:
        return tomllib.load(f)


def _calc_input_hash(job: AnalysisJobInput) -> str:
    """入力の再現性確認用ハッシュを計算する。"""
    payload = {
        "meeting_id": job.meeting_id,
        "transcript": job.transcript,
        "meeting_date": job.meeting_date,
    }
    return hashlib.sha256(
        json.dumps(payload, ensure_ascii=False).encode()
    ).hexdigest()[:16]


def _assemble(
    job: AnalysisJobInput,
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
    ambiguities: list[dict],
    summary: str,
    recommended_agenda: list[dict],
    estimation: dict,
    rag_retrieval: dict,
    validation_warnings: list[dict],
    rag_document: dict,
    estimation_note: str,
) -> dict:
    """最終reportJsonを組み立てる。"""
    alert_level = calc_alert_level(estimation)

    # 次回持ち越し対象を handover セクションにまとめる
    handover_open_issues = [
        o for o in open_issues if o.get("status") == "open"
    ]
    handover_tasks = [
        t for t in tasks if t.get("status") not in {"done", "rejected"}
    ]

    return {
        "meta": {
            "analysis_run_id": job.analysis_run_id,
            "meeting_id": job.meeting_id,
            "meeting_date": job.meeting_date,
            "meeting_type": job.meeting_type,
            "transcription_quality": job.transcription_quality,
            "pipeline_version": _PIPELINE_VERSION,
            "prompt_version": _PROMPT_VERSION,
        },
        "summary": summary,
        "alert_level": alert_level,
        "validation_warnings": validation_warnings,
        "rag_retrieval": rag_retrieval,
        "decisions": decisions,
        "open_issues": open_issues,
        "tasks": tasks,
        "ambiguities": ambiguities,
        "handover": {
            "open_issues": handover_open_issues,
            "tasks": handover_tasks,
        },
        "rag_document": rag_document,
        "related_past_meetings": rag_retrieval.get("related_past_meetings", []),
    }


async def analyze_meeting(
    job: AnalysisJobInput,
    llm_client: LLMClient,
) -> AnalysisRunResult:
    """会議書き起こしを受け取り、解析結果を返す。
    apps/apiへの保存はこの関数の呼び出し側が行う。
    """
    prompts = _load_prompts()
    raw_outputs: dict[str, str | None] = {
        "call1": None,
        "call2": None,
        "call3": None,
        "call4a": None,
        "call4b": None,
        "call5": None,
        "call6": None,
    }
    input_hash = _calc_input_hash(job)

    # speakers を dict のリストに変換する
    speakers_list = [s.model_dump() for s in job.speakers]

    try:
        # ── Call 1: キーワード抽出 ──────────────────────────────
        prompt1 = render_prompt(
            prompts["call1_keywords"]["template"],
            transcript=job.transcript,
        )
        raw1, parsed1 = run_llm_call(llm_client, "call1", prompt1)
        raw_outputs["call1"] = raw1
        if isinstance(parsed1, dict) and "_parse_error" in parsed1:
            return _failed("call1", parsed1, raw_outputs, input_hash)
        keywords: list[str] = parsed1 if isinstance(parsed1, list) else []
        logger.info("[call1] キーワード抽出完了: %d件", len(keywords))

        # ── RAG検索① ──────────────────────────────────────────
        rag_retrieval = build_mock_rag_retrieval(
            job.recurring_meeting_id, keywords
        )
        rag_context = rag_retrieval["rag_context_for_prompt"]

        # ── Call 2: 決定事項・未決事項抽出 ───────────────────────
        prev_open_issues = None
        if job.previous_report_json:
            prev_open_issues = prepare_prev_open_issues_for_call2(
                job.previous_report_json
            )

        prompt2 = build_call2_prompt(
            prompts,
            transcript=job.transcript,
            speakers=speakers_list,
            rag_context=rag_context,
            prev_open_issues=prev_open_issues,
        )
        raw2, parsed2 = run_llm_call(llm_client, "call2", prompt2)
        raw_outputs["call2"] = raw2
        if isinstance(parsed2, dict) and "_parse_error" in parsed2:
            return _failed("call2", parsed2, raw_outputs, input_hash)
        decisions: list[dict] = (
            parsed2.get("decisions", []) if isinstance(parsed2, dict) else []
        )
        open_issues: list[dict] = (
            parsed2.get("open_issues", []) if isinstance(parsed2, dict) else []
        )

        # 前回の未決事項を引き継ぐ（recurrence_count を更新）
        if prev_open_issues:
            _inherit_recurrence_counts(open_issues, prev_open_issues)

        logger.info(
            "[call2] 決定事項: %d件、未決事項: %d件",
            len(decisions),
            len(open_issues),
        )

        # ── Call 3: タスク抽出 ────────────────────────────────
        prev_tasks = None
        if job.previous_report_json:
            prev_tasks = prepare_prev_tasks_for_call3(job.previous_report_json)

        prompt3 = build_call3_prompt(
            prompts,
            transcript=job.transcript,
            speakers=speakers_list,
            decisions=decisions,
            open_issues=open_issues,
            rag_context=rag_context,
            prev_tasks=prev_tasks,
        )
        raw3, parsed3 = run_llm_call(llm_client, "call3", prompt3)
        raw_outputs["call3"] = raw3
        if isinstance(parsed3, dict) and "_parse_error" in parsed3:
            return _failed("call3", parsed3, raw_outputs, input_hash)
        tasks: list[dict] = (
            parsed3.get("tasks", []) if isinstance(parsed3, dict) else []
        )

        # 担当者の解決状態を推定する
        for task in tasks:
            task["assignee_resolution_status"] = infer_assignee_resolution_status(
                task.get("assignee_raw"), speakers_list
            )

        # 前回タスクの持ち越し回数を引き継ぐ
        if prev_tasks:
            _inherit_carried_over_counts(tasks, prev_tasks)

        logger.info("[call3] タスク: %d件", len(tasks))

        # ── Call 4a: 入力品質起因の曖昧情報 ─────────────────────
        context_summary = fmt_context_all(decisions, open_issues, tasks)
        prompt4a = render_prompt(
            prompts["call4a_quality_ambiguities"]["template"],
            transcript=job.transcript,
            transcription_quality=job.transcription_quality,
            context_summary=context_summary,
        )
        raw4a, parsed4a = run_llm_call(llm_client, "call4a", prompt4a)
        raw_outputs["call4a"] = raw4a
        ambiguities_quality: list[dict] = (
            parsed4a.get("ambiguities_quality", [])
            if isinstance(parsed4a, dict) and "_parse_error" not in parsed4a
            else []
        )

        # ── Call 4b: 会議内容起因の曖昧情報 ─────────────────────
        prompt4b = render_prompt(
            prompts["call4b_content_ambiguities"]["template"],
            context_summary=context_summary,
        )
        raw4b, parsed4b = run_llm_call(llm_client, "call4b", prompt4b)
        raw_outputs["call4b"] = raw4b
        ambiguities_content: list[dict] = (
            parsed4b.get("ambiguities_content", [])
            if isinstance(parsed4b, dict) and "_parse_error" not in parsed4b
            else []
        )

        # 曖昧情報の統合
        ambiguities = merge_ambiguities(ambiguities_quality, ambiguities_content)
        logger.info("[call4] 曖昧情報: %d件", len(ambiguities))

        # ── Call 5: 相対期限→絶対日付変換 ───────────────────────
        due_date_raws = fmt_due_date_raws(tasks)
        raw5: str | None = None
        if due_date_raws.strip():
            prompt5 = render_prompt(
                prompts["call5_due_date_conversion"]["template"],
                meeting_date=job.meeting_date,
                due_date_raws=due_date_raws,
            )
            raw5, parsed5 = run_llm_call(llm_client, "call5", prompt5)
            raw_outputs["call5"] = raw5
            if isinstance(parsed5, dict) and "_parse_error" not in parsed5:
                conversions = parsed5.get("conversions", [])
                tasks = apply_due_date_conversions(tasks, conversions)

        # ── Python: 見積もり計算 ──────────────────────────────
        estimation = calc_estimation(tasks, open_issues, decisions)
        alert_level = calc_alert_level(estimation)
        estimation_note = _fmt_estimation_note(estimation)
        logger.info(
            "[estimation] 合計: %d分、アラート: %s",
            estimation["total_minutes"],
            alert_level,
        )

        # ── RAG検索② ──────────────────────────────────────────
        rag_retrieval["used_in_calls"] = list(
            rag_retrieval.get("used_in_calls", [])
        ) + ["call6"]
        suggested_participants = build_suggested_participants_context(
            rag_retrieval
        )

        # ── Call 6: サマリー・推奨アジェンダ生成 ─────────────────
        change_summary: str | None = None
        if job.previous_report_json:
            change_summary = prepare_change_summary_for_call6(
                job.previous_report_json
            )

        prompt6 = build_call6_prompt(
            prompts,
            transcript=job.transcript,
            speakers=speakers_list,
            decisions=decisions,
            open_issues=open_issues,
            tasks=tasks,
            ambiguities=ambiguities,
            estimation_note=estimation_note,
            suggested_participants=suggested_participants,
            change_summary=change_summary,
        )
        raw6, parsed6 = run_llm_call(llm_client, "call6", prompt6)
        raw_outputs["call6"] = raw6
        summary = ""
        recommended_agenda: list[dict] = []
        if isinstance(parsed6, dict) and "_parse_error" not in parsed6:
            summary = remove_emoji(str(parsed6.get("summary", "")))
            recommended_agenda = parsed6.get("recommended_agenda", [])
            # estimation_noteはLLMが生成した版で上書き
            if parsed6.get("estimation_note"):
                estimation_note = remove_emoji(str(parsed6["estimation_note"]))

        # ── Python: ID採番・cross-reference解決 ──────────────
        decisions, open_issues, tasks, ambiguities = assign_ids_and_resolve(
            job.meeting_date, decisions, open_issues, tasks, ambiguities
        )

        # ── Python: RAGドキュメント生成 ──────────────────────
        rag_document = build_rag_document(
            decisions=decisions,
            open_issues=open_issues,
            tasks=tasks,
            keywords=keywords,
            speakers=speakers_list,
        )

        # ── Python: 内容レベルの検証 ──────────────────────────
        validation_warnings = validate_outputs(
            decisions, open_issues, tasks, ambiguities, speakers_list
        )

        # ── Python: 最終JSON組み立て ──────────────────────────
        report_json = _assemble(
            job=job,
            decisions=decisions,
            open_issues=open_issues,
            tasks=tasks,
            ambiguities=ambiguities,
            summary=summary,
            recommended_agenda=recommended_agenda,
            estimation=estimation,
            rag_retrieval=rag_retrieval,
            validation_warnings=validation_warnings,
            rag_document=rag_document,
            estimation_note=estimation_note,
        )

        completed_at = datetime.now(timezone.utc).isoformat()
        return AnalysisRunResult(
            status="completed",
            report_json=report_json,
            raw_outputs_json=raw_outputs,
            validation_warnings=validation_warnings,
            rag_retrieval_json=rag_retrieval,
            recommended_agenda=recommended_agenda,
            summary=summary,
            alert_level=alert_level,
            pipeline_version=_PIPELINE_VERSION,
            prompt_version=_PROMPT_VERSION,
            input_hash=input_hash,
            completed_at=completed_at,
        )

    except Exception as e:
        logger.exception("パイプライン例外: %s", e)
        return AnalysisRunResult(
            status="failed",
            raw_outputs_json=raw_outputs,
            input_hash=input_hash,
            error_message=str(e),
            failed_at=datetime.now(timezone.utc).isoformat(),
        )


def _failed(
    step: str, parsed: dict, raw_outputs: dict, input_hash: str
) -> AnalysisRunResult:
    """パースエラー時に failed 結果を返す。"""
    return AnalysisRunResult(
        status="failed",
        current_step=step,
        raw_outputs_json=raw_outputs,
        input_hash=input_hash,
        error_message=f"{step}: JSONパースエラー: {parsed.get('_parse_error', '')}",
        failed_at=datetime.now(timezone.utc).isoformat(),
    )


def _fmt_estimation_note(estimation: dict) -> str:
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
        per = val["minutes"] // val["count"]
        lines.append(
            f"  - {label}: {val['count']}件 × {per}分 = {val['minutes']}分"
        )
    return "\n".join(lines)


def _inherit_recurrence_counts(
    new_issues: list[dict], prev_issues: list[dict]
) -> None:
    """前回の未決事項と一致するものに recurrence_count を引き継ぐ。"""
    from .postprocess import normalize_for_similarity

    for ni in new_issues:
        norm_new = normalize_for_similarity(ni.get("topic", ""))
        for pi in prev_issues:
            norm_prev = normalize_for_similarity(pi.get("topic", ""))
            if norm_new and norm_prev and (
                norm_new in norm_prev or norm_prev in norm_new
            ):
                prev_count = pi.get("recurrence_count", 1)
                ni["recurrence_count"] = prev_count + 1
                break
        else:
            ni.setdefault("recurrence_count", 1)


def _inherit_carried_over_counts(
    new_tasks: list[dict], prev_tasks: list[dict]
) -> None:
    """前回のタスクと一致するものに carried_over_count を引き継ぐ。"""
    from .postprocess import normalize_for_similarity

    for nt in new_tasks:
        norm_new = normalize_for_similarity(nt.get("title", ""))
        for pt in prev_tasks:
            norm_prev = normalize_for_similarity(pt.get("title", ""))
            if norm_new and norm_prev and (
                norm_new in norm_prev or norm_prev in norm_new
            ):
                prev_count = pt.get("carried_over_count", 0)
                nt["carried_over_count"] = prev_count + 1
                break
        else:
            nt.setdefault("carried_over_count", 0)
