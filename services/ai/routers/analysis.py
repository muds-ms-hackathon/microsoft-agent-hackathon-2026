"""開発・検証用解析エンドポイント。Service Busを経由せずに解析を実行できる。"""

import logging

from fastapi import APIRouter

from integrations.app_api_client import AppApiClient
from llm.client import AzureOpenAIClient
from pipeline.analyze_meeting import analyze_meeting
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
    - 解析完了後にapps/apiのPATCH /internal/analysis-runs/:id/resultを呼ぶ
    """
    llm_client = AzureOpenAIClient()
    result = await analyze_meeting(job, llm_client)

    if job.analysis_run_id:
        api_client = AppApiClient()
        try:
            await api_client.update_analysis_run_result(
                job.analysis_run_id,
                result.model_dump(exclude_none=True),
            )
        except Exception:
            logger.exception("結果保存失敗 analysis_run_id=%s", job.analysis_run_id)

    return result
