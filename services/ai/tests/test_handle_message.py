import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
import httpx

from main import _handle_message
from schemas.analysis import AnalysisRunResult

_INPUT_DATA = {
    "meeting_id": "mtg-1",
    "meeting_type": "regular",
    "transcription_quality": "good",
    "transcript": "テスト議事録",
    "meeting_date": "2026-05-17",
    "speakers": [],
}

_FAKE_RESULT = AnalysisRunResult(
    status="completed", completed_at="2026-05-17T11:00:00Z"
)

_REPORT_JSON_EMPTY = {"decisions": [], "tasks": [], "ambiguities": []}


def _make_message(analysis_run_id: str = "run-1") -> MagicMock:
    msg = MagicMock()
    msg.body = json.dumps({"analysis_run_id": analysis_run_id}).encode("utf-8")
    return msg


async def test_handle_message_normal_path():
    """正常系: 解析完了後に update_analysis_run_result が completed で呼ばれる"""
    msg = _make_message()
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.update_analysis_run_result = AsyncMock()

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting", new=AsyncMock(return_value=_FAKE_RESULT)
            ):
                await _handle_message(msg)

    mock_api.get_analysis_run_input.assert_awaited_once_with("run-1")
    mock_api.update_analysis_run_result.assert_awaited_once()
    call_args = mock_api.update_analysis_run_result.call_args
    assert call_args.args[0] == "run-1"
    assert call_args.args[1]["status"] == "completed"


async def test_handle_message_analyze_failure_updates_failed_status():
    """analyze_meeting が例外を投げたとき、status=failed で update が呼ばれる"""
    msg = _make_message()
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.update_analysis_run_result = AsyncMock()

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(side_effect=RuntimeError("解析失敗")),
            ):
                with pytest.raises(RuntimeError, match="解析失敗"):
                    await _handle_message(msg)

    mock_api.update_analysis_run_result.assert_awaited_once()
    call_args = mock_api.update_analysis_run_result.call_args
    assert call_args.args[0] == "run-1"
    assert call_args.args[1]["status"] == "failed"
    assert "解析失敗" in call_args.args[1]["error_message"]


async def test_handle_message_update_failure_logs_error(caplog):
    """update も失敗したとき「エラー保存にも失敗」がログに残る"""
    msg = _make_message()
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.update_analysis_run_result = AsyncMock(
        side_effect=RuntimeError("保存エラー")
    )

    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(side_effect=RuntimeError("解析失敗")),
            ):
                with caplog.at_level(logging.ERROR, logger="main"):
                    with pytest.raises(RuntimeError):
                        await _handle_message(msg)

    assert any("エラー保存にも失敗" in r.message for r in caplog.records)


# ── ヘルパー ──────────────────────────────────────────────────────────────────


def _make_completed_result(report_json: dict | None = None) -> AnalysisRunResult:
    """status=completed かつ report_json が truthy な結果を返す"""
    return AnalysisRunResult(
        status="completed",
        completed_at="2026-05-17T11:00:00Z",
        report_json=report_json if report_json is not None else _REPORT_JSON_EMPTY,
    )


def _make_http_error(status_code: int) -> httpx.HTTPStatusError:
    request = httpx.Request("POST", "http://localhost/complete")
    response = httpx.Response(status_code, request=request)
    return httpx.HTTPStatusError(
        f"HTTP {status_code}", request=request, response=response
    )


# ── テスト 1：complete と update の呼び出し順 ─────────────────────────────────
async def test_handle_message_calls_complete_before_update():
    """complete_analysis_run が先、update_analysis_run_result が後に呼ばれること"""
    call_order: list[str] = []

    async def _on_complete(*args, **kwargs):
        call_order.append("complete")

    async def _on_update(*args, **kwargs):
        call_order.append("update")

    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock(side_effect=_on_complete)
    mock_api.update_analysis_run_result = AsyncMock(side_effect=_on_update)

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result()),
            ):
                await _handle_message(msg)

    assert call_order == ["complete", "update"]


# ── テスト 2：camelCase 変換 ──────────────────────────────────────────────────
async def test_handle_message_camel_case_conversion():
    """decisions/tasks/ambiguities の camelCase 変換が正しいこと"""
    report_json = {
        "decisions": [
            {"topic": "意思決定1", "content": "内容1", "source_quote": "引用D"},
        ],
        "tasks": [
            {
                "title": "タスク1",
                "body": "タスク内容1",
                "source_quote": "引用T",
                "priority": "required",
            },
        ],
        "ambiguities": [
            {
                "body": "曖昧点1",
                "source_quote": "引用A",
                "ambiguity_type": "no_assignee",
                "severity": "high",
            },
        ],
    }

    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock()
    mock_api.update_analysis_run_result = AsyncMock()

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result(report_json)),
            ):
                await _handle_message(msg)

    mock_api.complete_analysis_run.assert_awaited_once()
    kwargs = mock_api.complete_analysis_run.call_args.kwargs

    assert kwargs["decision_items"] == [
        {"title": "意思決定1", "body": "内容1", "sourceQuote": "引用D"}
    ]
    assert kwargs["tasks"] == [
        {
            "title": "タスク1",
            "body": "タスク内容1",
            "sourceQuote": "引用T",
            "priority": "required",
        }
    ]
    assert kwargs["ambiguous_infos"] == [
        {
            "body": "曖昧点1",
            "sourceQuote": "引用A",
            "ambiguityType": "no_assignee",
            "severity": "high",
        }
    ]


# ── テスト 3：complete 成功後に update が失敗 → raise ──────────────────────────
async def test_handle_message_raises_when_update_fails_after_complete():
    """complete 成功後に update が失敗 → raise されること"""
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock()
    mock_api.update_analysis_run_result = AsyncMock(
        side_effect=RuntimeError("update失敗")
    )

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result()),
            ):
                with pytest.raises(RuntimeError, match="update失敗"):
                    await _handle_message(msg)

    mock_api.complete_analysis_run.assert_awaited_once()
    # failed 保存の再試行がされていないこと（1回のみ = 正常系の update 呼び出し）
    mock_api.update_analysis_run_result.assert_awaited_once()


# ── テスト 4：complete が 4xx → failed 保存 → raise しない ────────────────────
async def test_handle_message_saves_failed_and_not_raise_on_complete_4xx():
    """complete が 4xx → failed 保存 → raise しないこと"""
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock(side_effect=_make_http_error(422))
    mock_api.update_analysis_run_result = AsyncMock()

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result()),
            ):
                await _handle_message(msg)  # raise しないこと

    mock_api.update_analysis_run_result.assert_awaited_once()
    result_arg = mock_api.update_analysis_run_result.call_args.args[1]
    assert result_arg["status"] == "failed"


# ── テスト 5：complete が 5xx → failed 保存せず raise ────────────────────────
async def test_handle_message_raises_without_saving_failed_on_complete_5xx():
    """complete が 5xx → failed 保存せず raise"""
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock(side_effect=_make_http_error(500))
    mock_api.update_analysis_run_result = AsyncMock()

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result()),
            ):
                with pytest.raises(httpx.HTTPStatusError):
                    await _handle_message(msg)

    mock_api.complete_analysis_run.assert_awaited_once()
    mock_api.update_analysis_run_result.assert_not_awaited()


# ── テスト 6：complete が 4xx かつ failed 保存も失敗 → raise ─────────────────
async def test_handle_message_raises_when_failed_save_also_fails_on_complete_4xx():
    """complete が 4xx かつ failed 保存も失敗 → raise されること"""
    mock_api = MagicMock()
    mock_api.get_analysis_run_input = AsyncMock(return_value=_INPUT_DATA)
    mock_api.complete_analysis_run = AsyncMock(side_effect=_make_http_error(422))
    mock_api.update_analysis_run_result = AsyncMock(
        side_effect=RuntimeError("保存エラー")
    )

    msg = _make_message()
    with patch("main.AppApiClient", return_value=mock_api):
        with patch("main.AzureOpenAIClient"):
            with patch(
                "main.analyze_meeting",
                new=AsyncMock(return_value=_make_completed_result()),
            ):
                with pytest.raises(RuntimeError, match="保存エラー"):
                    await _handle_message(msg)

    mock_api.update_analysis_run_result.assert_awaited_once()
    result_arg = mock_api.update_analysis_run_result.call_args.args[1]
    assert result_arg["status"] == "failed"
