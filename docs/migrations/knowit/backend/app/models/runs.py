from datetime import datetime
from enum import StrEnum

from pydantic import BaseModel, Field

TOPIC_MAX_LENGTH = 500


class RunStatus(StrEnum):
    CREATED = "created"
    SEARCHING = "searching"
    RANKING = "ranking"
    SEMANTIC_RANKING = "semantic_ranking"
    PDF_DOWNLOADING = "pdf_downloading"
    EXTRACTING = "extracting"
    SYNTHESIZING = "synthesizing"
    COMPLETE = "complete"
    FAILED = "failed"


class CreateRunRequest(BaseModel):
    topic: str = Field(min_length=1, max_length=TOPIC_MAX_LENGTH)


class StartRunRequest(BaseModel):
    max_results: int = Field(default=10, ge=1, le=100)
    provider_name: str = Field(default="mock", min_length=1)
    paper_source: str = Field(
        default="arxiv",
        pattern="^(arxiv|semantic_scholar|both)$",
    )


class ResearchRun(BaseModel):
    run_id: str
    topic: str
    status: RunStatus
    current_stage: RunStatus
    created_at: datetime
    updated_at: datetime
    error_message: str | None = None
