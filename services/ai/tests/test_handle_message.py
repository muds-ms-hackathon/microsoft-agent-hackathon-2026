import json
import logging
from unittest.mock import AsyncMock, MagicMock, patch

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


def _make_message(analysis_run_id: str = "run-1") -> MagicMock:
    msg = MagicMock()
    msg.__str__ = MagicMock(  # type: ignore[method-assign]
        return_value=json.dumps({"analysis_run_id": analysis_run_id})
    )
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
                    await _handle_message(msg)

    assert any("エラー保存にも失敗" in r.message for r in caplog.records)
