from datetime import datetime

from pydantic import BaseModel, Field


class PaperExtractionDraft(BaseModel):
    problem: str
    method: str
    datasets_or_setting: str
    key_results: list[str]
    main_contribution: str
    limitations: list[str]
    tags: list[str]
    confidence: float = Field(ge=0, le=1)
    source_quote_or_evidence: str
    has_full_text: bool = False
    full_text_status: str = "abstract_only"


class PaperExtraction(PaperExtractionDraft):
    run_id: str
    paper_id: str
    provider_name: str
    created_at: datetime


class RunExtractionsResponse(BaseModel):
    run_id: str
    extractions: list[PaperExtraction]
