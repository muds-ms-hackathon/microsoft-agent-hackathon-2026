"""開発・検証用解析エンドポイント。Service Busを経由せずに解析を実行できる。"""

import logging

from fastapi import APIRouter, HTTPException

from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
from pipeline.complete_payload import build_complete_payload
from schemas.analysis import AnalysisJobInput, AnalysisRunResult

router = APIRouter()
logger = logging.getLogger(__name__)


@router.post("/analyze", response_model=AnalysisRunResult)
async def analyze(job: AnalysisJobInput) -> AnalysisRunResult:
    """開発・検証用エンドポイント。Service Busを経由せずに解析を実行できる。

    analysis_run_idが省略された場合（ドライランモード）:
    - apps/apiへのステータス更新は行わない
    - 結果JSONだけをレスポンスで返す

    analysis_run_idがある場合:
    - 本番Service Bus経路と同じ保存フローを使う
    - mark_analyzing → analyze_meeting → complete_analysis_run / mark_failed
    - 失敗時は 502 を返し、呼び出し側に保存失敗を明示する
    """
    llm_client = AzureOpenAIClient()

    if not job.analysis_run_id:
        # ドライラン: App Server には保存しない
        return await analyze_meeting(job, llm_client)

    api_client = AppApiClient()
    try:
        await api_client.mark_analyzing(job.analysis_run_id)
    except Exception as e:
        logger.exception("mark_analyzing 失敗 analysis_run_id=%s", job.analysis_run_id)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "analyzing への遷移に失敗しました",
                "analysis_run_id": job.analysis_run_id,
                "underlying_error": str(e),
            },
        ) from e

    result = await analyze_meeting(job, llm_client)

    try:
        if result.status == "completed":
            await api_client.complete_analysis_run(
                job.analysis_run_id,
                build_complete_payload(result),
            )
        else:
            await api_client.mark_failed(
                job.analysis_run_id,
                error_message=result.error_message,
                current_step=result.current_step,
            )
    except Exception as e:
        logger.exception("結果保存失敗 analysis_run_id=%s", job.analysis_run_id)
        raise HTTPException(
            status_code=502,
            detail={
                "error": "結果保存に失敗しました",
                "analysis_run_id": job.analysis_run_id,
                "underlying_error": str(e),
                "result": result.model_dump(exclude_none=True),
            },
        ) from e

    return result
