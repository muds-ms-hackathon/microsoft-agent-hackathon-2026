"""routers/analysis.py の挙動検証テスト。"""
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import HTTPException

from routers.analysis import analyze
from schemas.analysis import AnalysisJobInput, AnalysisRunResult


def _make_job(run_id: str | None) -> AnalysisJobInput:
    return AnalysisJobInput(
        analysis_run_id=run_id,
        meeting_id="mtg-1",
        meeting_type="recurring_meeting",
        transcription_quality="full",
        transcript="本日の議題は...",
        meeting_date="2026-05-21",
        speakers=[],
        previous_report_json=None,
    )


def _make_completed_result() -> AnalysisRunResult:
    return AnalysisRunResult(status="completed", summary="ダミーサマリー")


@pytest.mark.asyncio
async def test_analyze_dry_run_skips_api_client():
    """analysis_run_id 省略時は AppApiClient を呼び出さない。"""
    job = _make_job(run_id=None)
    expected_result = _make_completed_result()

    with patch("routers.analysis.AzureOpenAIClient") as _mock_llm, patch(
        "routers.analysis.analyze_meeting",
        new=AsyncMock(return_value=expected_result),
    ), patch("routers.analysis.AppApiClient") as mock_client_cls:
        result = await analyze(job)

    assert result == expected_result
    mock_client_cls.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_with_run_id_calls_patch():
    """analysis_run_id 指定時は AppApiClient.update_analysis_run_result を呼ぶ。"""
    job = _make_job(run_id="run-1")
    expected_result = _make_completed_result()

    with patch("routers.analysis.AzureOpenAIClient") as _mock_llm, patch(
        "routers.analysis.analyze_meeting",
        new=AsyncMock(return_value=expected_result),
    ), patch("routers.analysis.AppApiClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.update_analysis_run_result = AsyncMock(return_value=None)
        mock_client_cls.return_value = mock_client

        result = await analyze(job)

        assert result == expected_result
        mock_client.update_analysis_run_result.assert_awaited_once()


@pytest.mark.asyncio
async def test_analyze_raises_502_when_patch_fails():
    """PATCH 失敗時は HTTPException(502) を投げ、detail に result を含める。"""
    job = _make_job(run_id="run-1")
    expected_result = _make_completed_result()

    with patch("routers.analysis.AzureOpenAIClient") as _mock_llm, patch(
        "routers.analysis.analyze_meeting",
        new=AsyncMock(return_value=expected_result),
    ), patch("routers.analysis.AppApiClient") as mock_client_cls:
        mock_client = MagicMock()
        mock_client.update_analysis_run_result = AsyncMock(
            side_effect=RuntimeError("PATCH failed")
        )
        mock_client_cls.return_value = mock_client

        with pytest.raises(HTTPException) as exc_info:
            await analyze(job)

    assert exc_info.value.status_code == 502
    detail = exc_info.value.detail
    assert isinstance(detail, dict)
    assert detail["analysis_run_id"] == "run-1"
    assert "PATCH failed" in detail["underlying_error"]
    # 解析結果が再投入できるよう含まれていること
    assert detail["result"]["status"] == "completed"
