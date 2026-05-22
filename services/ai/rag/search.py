"""RAG検索インターフェース。初期実装はモック。"""
import logging

logger = logging.getLogger(__name__)


def build_mock_rag_retrieval(
    recurring_meeting_id: str | None,
    keywords: list[str],
) -> dict:
    """RAG検索のモック実装。関連過去会議なしを返す。
    本番実装では Azure AI Search を呼び出す。
    """
    logger.debug(
        "RAGモック: recurring_meeting_id=%s, keywords=%s",
        recurring_meeting_id,
        keywords,
    )
    return {
        "rag_context_for_prompt": "(関連過去会議なし: RAGモック)",
        "related_past_meetings": [],
        "used_in_calls": ["call2", "call3"],
        "suggested_participants": [],
    }


def build_suggested_participants_context(rag_retrieval: dict) -> str:
    """推奨参加者コンテキストを生成する。"""
    participants = rag_retrieval.get("suggested_participants", [])
    if not participants:
        return "(RAG由来の推奨参加者なし)"
    return "\n".join(f"- {p}" for p in participants)
