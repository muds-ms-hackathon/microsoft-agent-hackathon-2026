import logging
import os
from typing import Any, cast

import httpx

logger = logging.getLogger(__name__)


class AppApiClient:
    def __init__(self) -> None:
        self.base_url = os.environ.get("INTERNAL_API_BASE_URL", "http://localhost:3001")
        self._secret = os.environ.get("INTERNAL_API_SECRET", "")

    @property
    def _headers(self) -> dict[str, str]:
        return {"x-internal-secret": self._secret}

    async def get_analysis_run_input(self, analysis_run_id: str) -> dict:
        """GET /internal/analysis-runs/:id/input"""
        async with httpx.AsyncClient() as client:
            response = await client.get(
                f"{self.base_url}/internal/analysis-runs/{analysis_run_id}/input",
                headers=self._headers,
                timeout=30.0,
            )
            response.raise_for_status()
            return cast(dict[str, Any], response.json())

    async def update_analysis_run_result(
        self, analysis_run_id: str, result: dict
    ) -> None:
        """PATCH /internal/analysis-runs/:id/result"""
        async with httpx.AsyncClient() as client:
            response = await client.patch(
                f"{self.base_url}/internal/analysis-runs/{analysis_run_id}/result",
                json=result,
                headers=self._headers,
                timeout=30.0,
            )
            response.raise_for_status()

    async def complete_analysis_run(
        self,
        analysis_run_id: str,
        decision_items: list[dict],
        tasks: list[dict],
        ambiguous_infos: list[dict],
    ) -> None:
        """POST /internal/analysis-runs/:id/complete"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                f"{self.base_url}/internal/analysis-runs/{analysis_run_id}/complete",
                json={
                    "decisionItems": decision_items,
                    "tasks": tasks,
                    "ambiguousInfos": ambiguous_infos,
                },
                headers=self._headers,
                timeout=30.0,
            )
            response.raise_for_status()
