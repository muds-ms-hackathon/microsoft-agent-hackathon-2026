from typing import Literal, Optional

from pydantic import BaseModel

# apps/api 側の Prisma enum AnalysisRunStatus と一致させる。
# 変更時は両方を同時に更新すること。
AnalysisRunStatus = Literal["queued", "analyzing", "completed", "failed"]


class SpeakerInfo(BaseModel):
    speaker_key: str
    name: Optional[str]
    user_id: Optional[str]
    resolution_status: str


class AnalysisJobInput(BaseModel):
    # None の場合はドライランモード（apps/api へのステータス更新を行わない）
    analysis_run_id: Optional[str] = None
    meeting_id: str
    meeting_type: str
    transcription_quality: str
    transcript: str
    supplementary_memo: Optional[str] = None
    meeting_date: str  # "YYYY-MM-DD"
    recurring_meeting_id: Optional[str] = None
    previous_meeting_id: Optional[str] = None
    speakers: list[SpeakerInfo]
    previous_report_json: Optional[dict] = None


class AnalysisRunResult(BaseModel):
    status: AnalysisRunStatus
    current_step: Optional[str] = None
    report_json: Optional[dict] = None
    raw_outputs_json: Optional[dict] = None
    validation_warnings: Optional[list] = None
    rag_retrieval_json: Optional[dict] = None
    recommended_agenda: Optional[list] = None
    summary: Optional[str] = None
    alert_level: Optional[str] = None
    model_name: Optional[str] = None
    api_version: Optional[str] = None
    prompt_version: Optional[str] = None
    pipeline_version: Optional[str] = None
    input_hash: Optional[str] = None
    completed_at: Optional[str] = None
    failed_at: Optional[str] = None
    error_message: Optional[str] = None


# schema.prisma: enum TaskPriority { required optional }
# ⚠️ この値を変更する場合は schema.prisma の TaskPriority enum も合わせて更新すること
VALID_PRIORITY: frozenset[str] = frozenset({"required", "optional"})

# schema.prisma: enum AmbiguitySeverity { high medium low }
# ⚠️ この値を変更する場合は schema.prisma の AmbiguitySeverity enum も合わせて更新すること
VALID_SEVERITY: frozenset[str] = frozenset({"high", "medium", "low"})

# schema.prisma: enum AmbiguityType { missing_speaker transcription_error_low transcription_error_high
#   no_assignee no_deadline_mentioned no_deadline_absolute unclear_decision insufficient_basis unclear_scope }
# ⚠️ この値を変更する場合は schema.prisma の AmbiguityType enum も合わせて更新すること
VALID_AMBIGUITY_TYPE: frozenset[str] = frozenset(
    {
        "missing_speaker",
        "transcription_error_low",
        "transcription_error_high",
        "no_assignee",
        "no_deadline_mentioned",
        "no_deadline_absolute",
        "unclear_decision",
        "insufficient_basis",
        "unclear_scope",
    }
)
