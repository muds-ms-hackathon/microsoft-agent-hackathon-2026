"""ユーザー事前登録議題（user_topic_requests）の受信・整形・プロンプト注入のテスト。

#347: apps/api は user_topic_requests を送っていたが、AnalysisJobInput に
フィールドが無く Pydantic の extra=ignore で破棄されていた。その回帰防止を含む。
"""

from pipeline.analyze_meeting import _load_prompts
from pipeline.prompt_builders import (
    build_call6_prompt,
    fmt_topic_requests_for_call6,
)
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


def _topic_requests() -> list[UserTopicRequest]:
    return [
        UserTopicRequest(
            title="予算の再検討",
            body="前回保留になった増額分を詰める",
            priority="required",
            requested_by_name="田中",
        ),
        UserTopicRequest(
            title="次期スケジュール共有",
            body=None,
            priority="optional",
            requested_by_name="佐藤",
        ),
    ]


def test_fmt_topic_requests_for_call6_includes_priority_body_requester():
    """整形結果に priority・本文・登録者が含まれる。"""
    text = fmt_topic_requests_for_call6(_topic_requests())

    assert "[required]" in text
    assert "[optional]" in text
    assert "予算の再検討" in text
    assert "前回保留になった増額分を詰める" in text
    assert "田中" in text


def _build_call6(topics: list[UserTopicRequest] | None) -> str:
    return build_call6_prompt(
        _load_prompts(),
        transcript="本日の議題は...",
        speakers=[],
        decisions=[],
        open_issues=[],
        tasks=[],
        ambiguities=[],
        estimation_note="",
        suggested_participants="",
        user_topic_requests=topics,
    )


def test_build_call6_prompt_injects_topic_requests():
    """議題ありのとき Call 6 プロンプトに議題セクションが入る。"""
    prompt = _build_call6(_topic_requests())

    assert "次回会議でユーザーが取り上げたいと登録した議題です" in prompt
    assert "予算の再検討" in prompt
    assert "[required]" in prompt


def test_build_call6_prompt_omits_section_when_empty():
    """議題が0件のときはセクションを出さず、プレースホルダも残さない。"""
    prompt = _build_call6([])

    assert "次回会議でユーザーが取り上げたいと登録した議題です" not in prompt
    assert "予算の再検討" not in prompt
    assert "$user_topic_requests_section" not in prompt
