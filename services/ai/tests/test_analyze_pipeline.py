"""パイプラインのユニットテスト。FakeLLMClientを使い、Azure OpenAI不要で動作する。"""
import json

import pytest

from llm.client import FakeLLMClient
from pipeline.analyze_meeting import (
    _extract_keywords,
    _fmt_estimation_note,
    analyze_meeting,
)
from pipeline.continuity import (
    prepare_change_summary_for_call6,
    prepare_prev_open_issues_for_call2,
    prepare_prev_tasks_for_call3,
)
from pipeline.estimation import calc_alert_level, calc_estimation
from pipeline.postprocess import (
    infer_assignee_resolution_status,
    merge_ambiguities,
    normalize_for_similarity,
    remove_emoji,
)
from pipeline.validation import validate_outputs
from schemas.analysis import AnalysisJobInput, SpeakerInfo

# ──────────────────────── FakeLLMClient用フィクスチャ ─────────────────────────

def _make_fake_responses() -> dict[str, str]:
    """各Callに対応するFakeレスポンスを返す。
    キーはFakeLLMClientが prompt に対して部分一致するユニーク文字列。
    各プロンプトテンプレートにある識別文字列を選ぶ。
    """
    call1_resp = json.dumps(["プロジェクトA", "予算", "期限", "設計書"])
    call2_resp = json.dumps({
        "decisions": [
            {
                "topic": "予算の増額",
                "decision_state": "confirmed",
                "content": "来期予算を10%増額する",
                "source_quote": "予算は10%増やしましょう",
                "source_context": "予算議題の後半",
                "status": "draft",
            }
        ],
        "open_issues": [
            {
                "topic": "設計書のレビュー担当",
                "reason": "no_consensus",
                "status": "open",
                "source_quote": "設計書のレビューは誰がやる？",
                "source_context": "タスク分担の議論",
                "expected_resolution_date": None,
                "responsible_raw": None,
            }
        ],
    })
    call3_resp = json.dumps({
        "tasks": [
            {
                "title": "設計書の更新",
                "body": "最新仕様を反映する",
                "assignee_raw": "田中",
                "due_date_raw": "来週金曜",
                "priority": "required",
                "assignee_source": "explicit_mention",
                "source_quote": "田中さん、設計書お願いします",
                "source_context": "タスク分担",
                "status": "draft",
            }
        ],
        "progress_notes": [],
    })
    call4a_resp = json.dumps({"ambiguities_quality": []})
    call4b_resp = json.dumps({
        "ambiguities_content": [
            {
                "ambiguity_type": "no_deadline_absolute",
                "severity": "medium",
                "body": "設計書更新の期限が相対表現のみ",
                "source_quote": None,
                "source_context": "タスク分担",
                "inference_basis": "due_date_rawが相対表現",
                "affected_item_ids": [],
            }
        ]
    })
    call5_resp = json.dumps({
        "conversions": [
            {"original": "来週金曜", "resolved": "2026-05-22"}
        ]
    })
    call6_resp = json.dumps({
        "summary": "予算増額が確定し、設計書更新タスクが発生した",
        "recommended_agenda": [
            {
                "title": "設計書レビュー担当の確定",
                "estimated_minutes": 5,
                "reason": "未決事項の解消",
            }
        ],
        "estimation_note": "次回会議の想定所要時間: 約20分",
    })

    # キーはプロンプトテンプレート内のユニークな部分文字列
    return {
        "キーワードを抽出": call1_resp,            # call1
        "決定事項と未決事項を抽出": call2_resp,   # call2
        "タスクを抽出してください": call3_resp,   # call3
        "書き起こし品質に起因する曖昧情報": call4a_resp,   # call4a
        "会議内容に起因する曖昧情報": call4b_resp, # call4b
        "絶対日付（YYYY-MM-DD）に変換": call5_resp,        # call5
        "サマリーと推奨アジェンダを生成": call6_resp,      # call6
    }


def _make_job() -> AnalysisJobInput:
    return AnalysisJobInput(
        analysis_run_id=None,  # ドライランモード
        meeting_id="mtg-test",
        meeting_type="recurring_meeting",
        transcription_quality="full",
        transcript=(
            "田中: 予算は10%増やしましょう。"
            "設計書のレビューは誰がやる？田中さん、設計書お願いします。"
        ),
        meeting_date="2026-05-17",
        speakers=[
            SpeakerInfo(
                speaker_key="spk-1",
                name="田中",
                user_id=None,
                resolution_status="resolved",
            )
        ],
        previous_report_json=None,
    )


# ──────────────────────── パイプライン縦断テスト ──────────────────────────────

@pytest.mark.asyncio
async def test_analyze_meeting_completed():
    """FakeLLMClientを使ったCall 1〜6の縦断テスト。"""
    job = _make_job()
    client = FakeLLMClient(_make_fake_responses())

    result = await analyze_meeting(job, client)

    assert result.status == "completed"
    assert result.report_json is not None
    assert result.summary == "予算増額が確定し、設計書更新タスクが発生した"
    assert result.alert_level in {"low", "medium", "high"}
    assert result.pipeline_version == "1.0.0"

    report = result.report_json
    assert report is not None
    assert "decisions" in report
    assert len(report["decisions"]) == 1
    assert report["decisions"][0]["topic"] == "予算の増額"

    assert "tasks" in report
    assert len(report["tasks"]) == 1
    task = report["tasks"][0]
    assert task["title"] == "設計書の更新"
    # due_dateがCall 5で絶対日付に変換されていること
    assert task.get("due_date") == "2026-05-22"

    assert "open_issues" in report
    assert len(report["open_issues"]) == 1

    # IDが採番されていること
    assert report["decisions"][0].get("id", "").startswith("D-")
    assert report["tasks"][0].get("id", "").startswith("T-")
    assert report["open_issues"][0].get("id", "").startswith("OI-")

    # rag_documentが生成されていること
    assert "rag_document" in report
    assert "confirmed_decision_texts" in report["rag_document"]

    # handoverが存在すること
    assert "handover" in report

    # estimation / estimation_note が report_json に含まれていること（#251）
    assert "estimation" in report
    assert "breakdown" in report["estimation"]
    assert "total_minutes" in report["estimation"]
    assert isinstance(report.get("estimation_note"), str)
    assert "想定所要時間" in report["estimation_note"]


@pytest.mark.asyncio
async def test_analyze_meeting_parse_error_returns_failed():
    """Call 2でJSONパースエラーが発生した場合、failedを返す。"""
    bad_responses = _make_fake_responses()
    # call2のプロンプト識別文字列を上書きして不正なJSONを返させる
    bad_responses["決定事項と未決事項を抽出"] = "これはJSONではありません"

    job = _make_job()
    client = FakeLLMClient(bad_responses)

    result = await analyze_meeting(job, client)

    assert result.status == "failed"
    assert result.current_step == "call2"
    assert result.error_message is not None
    assert "JSONパースエラー" in result.error_message


# ──────────────────────── 個別モジュールのユニットテスト ─────────────────────


def test_remove_emoji():
    assert remove_emoji("hello 😀 world") == "hello  world"
    assert remove_emoji("絵文字なし") == "絵文字なし"


def test_normalize_for_similarity():
    assert normalize_for_similarity("プロジェクト A") == "プロジェクトa"
    assert normalize_for_similarity("  Hello  ") == "hello"


def test_infer_assignee_resolution_status_resolved():
    speakers = [{"speaker_key": "spk-1", "name": "田中"}]
    assert infer_assignee_resolution_status("田中", speakers) == "resolved"


def test_infer_assignee_resolution_status_unresolved():
    speakers = [{"speaker_key": "spk-1", "name": "田中"}]
    assert infer_assignee_resolution_status("鈴木", speakers) == "unresolved"


def test_infer_assignee_resolution_status_unknown():
    assert infer_assignee_resolution_status(None, []) == "unknown"


def test_merge_ambiguities():
    qa = [{"ambiguity_type": "missing_speaker", "severity": "low"}]
    ca = [{"ambiguity_type": "no_assignee", "severity": "high"}]
    merged = merge_ambiguities(qa, ca)
    assert len(merged) == 2


def test_calc_estimation_and_alert():
    tasks = [{"priority": "required"}, {"priority": "optional"}]
    open_issues = [{"recurrence_count": 1}, {"recurrence_count": 3}]
    decisions = [{"decision_state": "tentative"}]
    est = calc_estimation(tasks, open_issues, decisions)
    assert est["total_minutes"] > 0
    assert "breakdown" in est
    level = calc_alert_level(est)
    assert level in {"low", "medium", "high"}


def test_validate_outputs_unresolved_due_date():
    tasks = [
        {
            "id": "T-001",
            "title": "設計書更新",
            "due_date_raw": "来週月曜",
            "assignee_resolution_status": "resolved",
        }
    ]
    warnings = validate_outputs([], [], tasks, [])
    assert any(w["type"] == "unresolved_due_date" for w in warnings)


def test_validate_outputs_no_warnings():
    tasks = [
        {
            "id": "T-001",
            "title": "設計書更新",
            "due_date_raw": "来週月曜",
            "due_date": "2026-05-25",
            "assignee_resolution_status": "resolved",
        }
    ]
    warnings = validate_outputs([], [], tasks, [])
    assert not any(w["type"] == "unresolved_due_date" for w in warnings)


# ──────────────────────── 継続コンテキストのユニットテスト ────────────────────


def test_prepare_prev_open_issues_excludes_resolved_human():
    prev_json = {
        "open_issues": [
            {"topic": "A", "status": "open"},
            {"topic": "B", "status": "resolved_human"},
            {"topic": "C", "status": "resolved_ai"},
        ]
    }
    result = prepare_prev_open_issues_for_call2(prev_json)
    topics = [o["topic"] for o in result]
    assert "A" in topics
    assert "C" in topics
    assert "B" not in topics


def test_prepare_prev_tasks_excludes_done_rejected():
    prev_json = {
        "tasks": [
            {"title": "X", "status": "done"},
            {"title": "Y", "status": "rejected"},
            {"title": "Z", "status": "todo"},
        ]
    }
    result = prepare_prev_tasks_for_call3(prev_json)
    titles = [t["title"] for t in result]
    assert "Z" in titles
    assert "X" not in titles
    assert "Y" not in titles
    # n番号が付与されていること
    assert result[0]["n"] == 1


def test_prepare_change_summary_for_call6():
    prev_json = {
        "tasks": [
            {"title": "完了タスク", "status": "done"},
            {"title": "継続タスク", "status": "todo"},
        ],
        "open_issues": [
            {"topic": "解決済み", "status": "resolved_human", "recurrence_count": 1},
            {"topic": "継続中", "status": "open", "recurrence_count": 4},
        ],
    }
    summary = prepare_change_summary_for_call6(prev_json)
    assert "完了タスク" in summary
    assert "継続中" in summary  # high_recurrence_issues に含まれる


# ──────────────────────── _extract_keywords ──────────────────────────


def test_extract_keywords_from_list():
    assert _extract_keywords(["a", "b", "c"]) == ["a", "b", "c"]


def test_extract_keywords_from_keywords_key():
    assert _extract_keywords({"keywords": ["x", "y"]}) == ["x", "y"]


def test_extract_keywords_from_items_key():
    assert _extract_keywords({"items": ["foo"]}) == ["foo"]


def test_extract_keywords_falls_back_to_first_list_value():
    assert _extract_keywords({"other": ["alpha"]}) == ["alpha"]


def test_extract_keywords_returns_empty_when_no_list_found():
    assert _extract_keywords({"summary": "string only"}) == []


def test_extract_keywords_returns_empty_for_unsupported_type():
    assert _extract_keywords("not a dict or list") == []  # type: ignore[arg-type]


def test_extract_keywords_coerces_to_str():
    assert _extract_keywords([1, 2, 3]) == ["1", "2", "3"]


# ──────────────────────── _fmt_estimation_note ────────────────────────


def test_fmt_estimation_note_with_normal_breakdown():
    estimation = {
        "total_minutes": 25,
        "breakdown": {
            "required_task_check": {"count": 3, "minutes": 6},
            "buffer": {"count": 1, "minutes": 10},
        },
    }
    note = _fmt_estimation_note(estimation)
    assert "想定所要時間: 約25分" in note
    assert "必須タスク確認: 3件 × 2分 = 6分" in note
    assert "バッファ: 1件 × 10分 = 10分" in note


def test_fmt_estimation_note_handles_zero_count_without_zero_division():
    """count==0 のカテゴリでも ZeroDivisionError を起こさない。"""
    estimation = {
        "total_minutes": 10,
        "breakdown": {
            "buffer": {"count": 0, "minutes": 10},
        },
    }
    note = _fmt_estimation_note(estimation)
    # 0件のカテゴリは「N分」のみ表示する
    assert "0件" in note
    assert "10分" in note


def test_fmt_estimation_note_with_empty_breakdown():
    note = _fmt_estimation_note({"total_minutes": 0, "breakdown": {}})
    assert "想定所要時間: 約0分" in note
