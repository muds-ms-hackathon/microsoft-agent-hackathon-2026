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


def _make_failed_result() -> AnalysisRunResult:
    return AnalysisRunResult(
        status="failed",
        current_step="call2",
        error_message="LLMエラー",
    )


def _make_mock_api() -> MagicMock:
    mock = MagicMock()
    mock.mark_analyzing = AsyncMock()
    mock.complete_analysis_run = AsyncMock()
    mock.mark_failed = AsyncMock()
    return mock


@pytest.mark.asyncio
async def test_analyze_dry_run_skips_api_client():
    """analysis_run_id 省略時は AppApiClient を呼び出さない。"""
    job = _make_job(run_id=None)
    expected_result = _make_completed_result()

    with (
        patch("routers.analysis.AzureOpenAIClient"),
        patch(
            "routers.analysis.analyze_meeting",
            new=AsyncMock(return_value=expected_result),
        ),
        patch("routers.analysis.AppApiClient") as mock_client_cls,
    ):
        result = await analyze(job)

    assert result == expected_result
    mock_client_cls.assert_not_called()


@pytest.mark.asyncio
async def test_analyze_with_run_id_completed_path():
    """analysis_run_id 指定・completed: mark_analyzing → complete_analysis_run が呼ばれる。"""
    job = _make_job(run_id="run-1")
    expected_result = _make_completed_result()
    mock_api = _make_mock_api()

    with (
        patch("routers.analysis.AzureOpenAIClient"),
        patch(
            "routers.analysis.analyze_meeting",
            new=AsyncMock(return_value=expected_result),
        ),
        patch("routers.analysis.AppApiClient", return_value=mock_api),
        patch(
            "routers.analysis.build_complete_payload", return_value={"mocked": True}
        ) as mock_build,
    ):
        result = await analyze(job)

    assert result == expected_result
    mock_api.mark_analyzing.assert_awaited_once_with("run-1")
    mock_build.assert_called_once_with(expected_result)
    mock_api.complete_analysis_run.assert_awaited_once_with("run-1", {"mocked": True})
    mock_api.mark_failed.assert_not_awaited()


@pytest.mark.asyncio
async def test_analyze_with_run_id_failed_path():
    """analysis_run_id 指定・failed: mark_analyzing → mark_failed が呼ばれる。"""
    job = _make_job(run_id="run-1")
    failed_result = _make_failed_result()
    mock_api = _make_mock_api()

    with (
        patch("routers.analysis.AzureOpenAIClient"),
        patch(
            "routers.analysis.analyze_meeting",
            new=AsyncMock(return_value=failed_result),
        ),
        patch("routers.analysis.AppApiClient", return_value=mock_api),
    ):
        result = await analyze(job)

    assert result == failed_result
    mock_api.mark_analyzing.assert_awaited_once_with("run-1")
    mock_api.mark_failed.assert_awaited_once_with(
        "run-1",
        error_message="LLMエラー",
        current_step="call2",
    )
    mock_api.complete_analysis_run.assert_not_awaited()


@pytest.mark.asyncio
async def test_analyze_raises_502_when_mark_analyzing_fails():
    """mark_analyzing 失敗時は HTTPException(502) を投げる。"""
    job = _make_job(run_id="run-1")
    mock_api = _make_mock_api()
    mock_api.mark_analyzing = AsyncMock(side_effect=RuntimeError("遷移失敗"))

    with (
        patch("routers.analysis.AzureOpenAIClient"),
        patch("routers.analysis.analyze_meeting"),
        patch("routers.analysis.AppApiClient", return_value=mock_api),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await analyze(job)

    assert exc_info.value.status_code == 502
    assert exc_info.value.detail["analysis_run_id"] == "run-1"
    assert "遷移失敗" in exc_info.value.detail["underlying_error"]


@pytest.mark.asyncio
async def test_analyze_raises_502_when_complete_fails():
    """complete_analysis_run 失敗時は HTTPException(502) を投げ detail に result を含む。"""
    job = _make_job(run_id="run-1")
    expected_result = _make_completed_result()
    mock_api = _make_mock_api()
    mock_api.complete_analysis_run = AsyncMock(side_effect=RuntimeError("保存失敗"))

    with (
        patch("routers.analysis.AzureOpenAIClient"),
        patch(
            "routers.analysis.analyze_meeting",
            new=AsyncMock(return_value=expected_result),
        ),
        patch("routers.analysis.AppApiClient", return_value=mock_api),
        patch("routers.analysis.build_complete_payload", return_value={}),
    ):
        with pytest.raises(HTTPException) as exc_info:
            await analyze(job)

    assert exc_info.value.status_code == 502
    detail = exc_info.value.detail
    assert detail["analysis_run_id"] == "run-1"
    assert "保存失敗" in detail["underlying_error"]
    assert detail["result"]["status"] == "completed"
