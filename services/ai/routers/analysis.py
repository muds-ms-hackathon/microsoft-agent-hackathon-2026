"""開発・検証用解析エンドポイント。Service Busを経由せずに解析を実行できる。"""

import logging

from fastapi import APIRouter, HTTPException

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
    - PATCH失敗時は 502 を返し、呼び出し側に保存失敗を明示する
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
        except Exception as e:
            logger.exception("結果保存失敗 analysis_run_id=%s", job.analysis_run_id)
            # PATCH 失敗を握り潰さず、呼び出し側に通知する。
            # 解析自体は完了しているので、再投入判断に使えるよう
            # result も detail に含める。
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
