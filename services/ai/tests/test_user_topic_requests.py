"""ユーザー事前登録議題（user_topic_requests）の受信・整形・プロンプト注入のテスト。

#347: apps/api は user_topic_requests を送っていたが、AnalysisJobInput に
フィールドが無く Pydantic の extra=ignore で破棄されていた。その回帰防止を含む。
"""

from schemas.analysis import AnalysisJobInput, UserTopicRequest


def _api_input_dict() -> dict:
    """apps/api の GET /internal/analysis-runs/:id/input が返す形を模した入力。"""
    return {
        "analysis_run_id": "run-1",
        "meeting_id": "mtg-1",
        "meeting_type": "recurring_meeting",
        "transcription_quality": "full",
        "transcript": "本日の議題は...",
        "meeting_date": "2026-05-30",
        "speakers": [],
        "previous_report_json": None,
        "user_topic_requests": [
            {
                "title": "予算の再検討",
                "body": "前回保留になった増額分を詰める",
                "priority": "required",
                "requested_by_name": "田中",
            },
            {
                "title": "次期スケジュール共有",
                "body": None,
                "priority": "optional",
                "requested_by_name": "佐藤",
            },
        ],
    }


def test_analysis_job_input_keeps_user_topic_requests():
    """API が送る user_topic_requests が破棄されず保持される（#347 回帰防止）。"""
    job = AnalysisJobInput(**_api_input_dict())

    assert len(job.user_topic_requests) == 2
    first = job.user_topic_requests[0]
    assert isinstance(first, UserTopicRequest)
    assert first.title == "予算の再検討"
    assert first.body == "前回保留になった増額分を詰める"
    assert first.priority == "required"
    assert first.requested_by_name == "田中"


def test_analysis_job_input_defaults_to_empty_list():
    """user_topic_requests 未指定時は空リスト（後方互換）。"""
    data = _api_input_dict()
    del data["user_topic_requests"]

    job = AnalysisJobInput(**data)

    assert job.user_topic_requests == []
