import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from main import _handle_message
from pipeline.complete_payload import build_complete_payload
from schemas.analysis import AnalysisRunResult

_INPUT_DATA = {
    "meeting_id": "mtg-1",
    "meeting_type": "regular",
    "transcription_quality": "good",
    "transcript": "テスト議事録",
    "meeting_date": "2026-05-17",
    "speakers": [],
}

_COMPLETED_RESULT = AnalysisRunResult(
    status="completed",
    summary="テストサマリー",
    alert_level="low",
    pipeline_version="1.0.0",
    prompt_version="1.0.0",
    input_hash="abc123",
    report_json={
        "decisions": [
            {
                "topic": "決定事項A",
                "content": "本文A",
                "source_quote": "引用A",
                "source_context": "文脈A",
                "decision_state": "confirmed",
            }
        ],
        "open_issues": [
            {
                "topic": "未決事項B",
                "body": "詳細B",
                "reason": "no_consensus",
                "recurrence_count": 2,
                "expected_resolution_date": "2026-06-01",
            }
        ],
        "tasks": [
            {
                "title": "タスクC",
                "body": "作業内容",
                "assignee_raw": "田中",
                "due_date_raw": "来週",
                "due_date": "2026-05-24",
                "priority": "required",
            }
        ],
        "ambiguities": [
            {
                "body": "不明点D",
                "ambiguity_type": "no_assignee",
                "severity": "high",
            }
        ],
    },
    completed_at="2026-05-17T11:00:00Z",
)

_FAILED_RESULT = AnalysisRunResult(
    status="failed",
    current_step="call2",
    error_message="LLM呼び出しエラー",
    failed_at="2026-05-17T11:00:00Z",
)

_REPORT_JSON_EMPTY: dict[str, list] = {"decisions": [], "tasks": [], "ambiguities": []}


def _make_message(analysis_run_id: str = "run-1") -> MagicMock:
    msg = MagicMock()
    msg.body = json.dumps({"analysis_run_id": analysis_run_id}).encode("utf-8")
    return msg


def _make_mock_api() -> MagicMock:
    mock = MagicMock()
    mock.mark_analyzing = AsyncMock()
    mock.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock.complete_analysis_run = AsyncMock()
    mock.mark_failed = AsyncMock()
    return mock


async def test_handle_message_completed_path():
    """正常系: mark_analyzing → analyze → complete_analysis_run が呼ばれる"""
    msg = _make_message()
    mock_api = _make_mock_api()

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting", new=AsyncMock(return_value=_COMPLETED_RESULT)
            ):
                await _handle_message(msg)

    mock_api.mark_analyzing.assert_awaited_once_with("run-1")
    mock_api.get_analysis_run_input.assert_awaited_once_with("run-1")
    mock_api.complete_analysis_run.assert_awaited_once()
    call_args = mock_api.complete_analysis_run.call_args
    assert call_args.args[0] == "run-1"
    payload = call_args.args[1]
    assert payload["summary"] == "テストサマリー"
    assert payload["alert_level"] == "low"
    assert len(payload["decision_items"]) == 2  # decisions + open_issues
    assert len(payload["tasks"]) == 1
    assert len(payload["ambiguous_infos"]) == 1
    mock_api.mark_failed.assert_not_awaited()


async def test_handle_message_failed_path_no_reraise():
    """analyze_meeting が status=failed を返したとき mark_failed が呼ばれ再配送しない"""
    msg = _make_message()
    mock_api = _make_mock_api()

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting", new=AsyncMock(return_value=_FAILED_RESULT)
            ):
                # 例外が伝播しないことを確認
                await _handle_message(msg)

    mock_api.mark_failed.assert_awaited_once_with(
        "run-1",
        error_message="LLM呼び出しエラー",
        current_step="call2",
    )
    mock_api.complete_analysis_run.assert_not_awaited()


async def test_handle_message_mark_analyzing_failure_reraises():
    """mark_analyzing が失敗したとき例外を伝播させる（再配送）"""
    msg = _make_message()
    mock_api = _make_mock_api()
    mock_api.mark_analyzing = AsyncMock(side_effect=RuntimeError("ネットワークエラー"))

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with pytest.raises(RuntimeError, match="ネットワークエラー"):
                await _handle_message(msg)

    mock_api.get_analysis_run_input.assert_not_awaited()


async def test_handle_message_complete_failure_reraises():
    """complete_analysis_run が失敗したとき例外を伝播させる（再配送）"""
    msg = _make_message()
    mock_api = _make_mock_api()
    mock_api.complete_analysis_run = AsyncMock(side_effect=RuntimeError("APIエラー"))

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting", new=AsyncMock(return_value=_COMPLETED_RESULT)
            ):
                with pytest.raises(RuntimeError, match="APIエラー"):
                    await _handle_message(msg)


async def test_handle_message_mark_failed_failure_reraises():
    """mark_failed が失敗したとき例外を伝播させる（再配送）"""
    msg = _make_message()
    mock_api = _make_mock_api()
    mock_api.mark_failed = AsyncMock(side_effect=RuntimeError("保存エラー"))

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting", new=AsyncMock(return_value=_FAILED_RESULT)
            ):
                with pytest.raises(RuntimeError, match="保存エラー"):
                    await _handle_message(msg)


async def test_handle_message_invalid_body_discards():
    """不正なメッセージボディは破棄する（例外なし）"""
    msg = MagicMock()
    msg.body = b"not json"

    # 例外が出ないことを確認
    await _handle_message(msg)


async def test_handle_message_missing_analysis_run_id_discards():
    """analysis_run_id が欠落したメッセージは破棄する（例外なし）"""
    msg = MagicMock()
    msg.body = json.dumps({"other_field": "value"}).encode("utf-8")

    await _handle_message(msg)


# build_complete_payload のユニットテスト


def test_build_complete_payload_decision_items():
    """decisions と open_issues が decision_items にまとめられる"""
    result = AnalysisRunResult(
        status="completed",
        report_json={
            "decisions": [
                {"topic": "決定A", "content": "本文A", "decision_state": "confirmed"}
            ],
            "open_issues": [
                {
                    "topic": "未決B",
                    "reason": "no_consensus",
                    "recurrence_count": 1,
                    "expected_resolution_date": "2026-06-01",
                }
            ],
            "tasks": [],
            "ambiguities": [],
        },
    )
    payload = build_complete_payload(result)

    assert len(payload["decision_items"]) == 2
    confirmed = payload["decision_items"][0]
    assert confirmed["title"] == "決定A"
    assert confirmed["body"] == "本文A"
    assert confirmed["decision_state"] == "confirmed"

    open_item = payload["decision_items"][1]
    assert open_item["title"] == "未決B"
    assert open_item["decision_state"] == "open"
    assert open_item["reason"] == "no_consensus"
    assert open_item["recurrence_count"] == 1
    assert open_item["decision_deadline"] == "2026-06-01"


def test_build_complete_payload_tasks():
    """tasks フィールドが正しくマッピングされる"""
    result = AnalysisRunResult(
        status="completed",
        report_json={
            "decisions": [],
            "open_issues": [],
            "tasks": [
                {
                    "title": "タスクA",
                    "body": "内容",
                    "assignee_raw": "田中",
                    "due_date_raw": "来週",
                    "due_date": "2026-05-24",
                    "priority": "required",
                    "carried_over_count": 2,
                }
            ],
            "ambiguities": [],
        },
    )
    payload = build_complete_payload(result)

    assert len(payload["tasks"]) == 1
    task = payload["tasks"][0]
    assert task["title"] == "タスクA"
    assert task["assignee_raw"] == "田中"
    assert task["due_date"] == "2026-05-24"
    assert task["priority"] == "required"
    assert task["carried_over_count"] == 2


def test_build_complete_payload_ambiguous_infos():
    """ambiguities が ambiguous_infos にマッピングされる"""
    result = AnalysisRunResult(
        status="completed",
        report_json={
            "decisions": [],
            "open_issues": [],
            "tasks": [],
            "ambiguities": [
                {
                    "body": "不明点X",
                    "ambiguity_type": "no_assignee",
                    "severity": "high",
                    "inference_basis": "推定根拠",
                }
            ],
        },
    )
    payload = build_complete_payload(result)

    assert len(payload["ambiguous_infos"]) == 1
    info = payload["ambiguous_infos"][0]
    assert info["body"] == "不明点X"
    assert info["ambiguity_type"] == "no_assignee"
    assert info["severity"] == "high"
    assert info["inference_basis"] == "推定根拠"


def test_build_complete_payload_empty_report():
    """report_json が None のとき空リストになる"""
    result = AnalysisRunResult(status="completed", report_json=None)
    payload = build_complete_payload(result)

    assert payload["decision_items"] == []
    assert payload["tasks"] == []
    assert payload["ambiguous_infos"] == []
    assert payload["report_json"] == {}
