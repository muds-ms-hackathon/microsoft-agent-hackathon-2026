"""AnalysisRunResult から POST /complete ペイロードを組み立てるユーティリティ。"""

from schemas.analysis import AnalysisRunResult


def build_complete_payload(result: AnalysisRunResult) -> dict:
    """AnalysisRunResult から POST /complete ペイロードを組み立てて返す。"""
    report_json = result.report_json or {}

    decision_items = [
        {
            "title": d.get("topic", ""),
            "body": d.get("content") or d.get("body"),
            "source_quote": d.get("source_quote"),
            "source_context": d.get("source_context"),
            "decision_state": d.get("decision_state"),
            "ambiguity_flags": d.get("ambiguity_flags"),
        }
        for d in report_json.get("decisions", [])
    ] + [
        {
            "title": o.get("topic", ""),
            "body": o.get("body") or o.get("content"),
            "source_quote": o.get("source_quote"),
            "source_context": o.get("source_context"),
            "decision_state": "open",
            "reason": o.get("reason"),
            "recurrence_count": o.get("recurrence_count"),
            "decision_deadline": o.get("expected_resolution_date"),
        }
        for o in report_json.get("open_issues", [])
    ]

    tasks = [
        {
            "title": t.get("title", ""),
            "body": t.get("body"),
            "source_quote": t.get("source_quote"),
            "source_context": t.get("source_context"),
            "priority": t.get("priority"),
            "assignee_raw": t.get("assignee_raw"),
            "due_date_raw": t.get("due_date_raw"),
            "due_date": t.get("due_date"),
            "due_date_estimated": t.get("due_date_estimated"),
            "start_date": t.get("start_date"),
            "follow_up_date": t.get("follow_up_date"),
            "carried_over_count": t.get("carried_over_count"),
            "ambiguity_flags": t.get("ambiguity_flags"),
            "progress_note": t.get("progress_note"),
        }
        for t in report_json.get("tasks", [])
    ]

    ambiguous_infos = [
        {
            "body": a.get("body", ""),
            "source_quote": a.get("source_quote"),
            "source_context": a.get("source_context"),
            "ambiguity_type": a.get("ambiguity_type"),
            "severity": a.get("severity"),
            "inference_basis": a.get("inference_basis"),
            "due_date_raw": a.get("due_date_raw"),
            "due_date_estimated": a.get("due_date_estimated"),
            "affected_item_ids": a.get("affected_item_ids"),
        }
        for a in report_json.get("ambiguities", [])
    ]

    return {
        "summary": result.summary,
        "alert_level": result.alert_level,
        "model_name": result.model_name,
        "api_version": result.api_version,
        "prompt_version": result.prompt_version,
        "pipeline_version": result.pipeline_version,
        "input_hash": result.input_hash,
        "report_json": report_json,
        "raw_outputs_json": result.raw_outputs_json,
        "validation_warnings": result.validation_warnings,
        "rag_retrieval_json": result.rag_retrieval_json,
        "recommended_agenda": result.recommended_agenda,
        "decision_items": decision_items,
        "tasks": tasks,
        "ambiguous_infos": ambiguous_infos,
    }
