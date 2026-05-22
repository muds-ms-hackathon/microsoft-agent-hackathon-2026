"""RAGインデックス登録インターフェース。初期実装はモック。"""
import logging

logger = logging.getLogger(__name__)


def build_rag_document(
    decisions: list[dict],
    open_issues: list[dict],
    tasks: list[dict],
    keywords: list[str],
    speakers: list[dict],
) -> dict:
    """AI Search に登録するRAGドキュメントを構築する。
    confirmed かつ rejected でない決定事項のテキストのみを含める。
    """
    confirmed_decision_texts = [
        d.get("content", "")
        for d in decisions
        if d.get("decision_state") == "confirmed" and d.get("status") != "rejected"
    ]
    open_issue_texts = [
        o.get("topic", "")
        for o in open_issues
        if o.get("status") == "open"
    ]
    participant_names = [
        s.get("name", "")
        for s in speakers
        if s.get("name")
    ]

    return {
        "theme_keywords": keywords,
        "confirmed_decision_texts": confirmed_decision_texts,
        "open_issue_texts": open_issue_texts,
        "participant_names": participant_names,
    }


async def index_rag_document(meeting_id: str, rag_document: dict) -> None:
    """RAGドキュメントをインデックスに登録する（モック）。
    本番実装では Azure AI Search の upsert を呼び出す。
    """
    logger.info("RAGインデックス登録(モック): meeting_id=%s", meeting_id)
