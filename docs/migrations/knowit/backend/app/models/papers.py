from datetime import datetime

from pydantic import BaseModel


class Paper(BaseModel):
    paper_id: str
    source: str
    source_id: str
    title: str
    authors: list[str]
    abstract: str
    doi: str | None = None
    published_date: datetime | None = None
    updated_date: datetime | None = None
    paper_url: str
    pdf_url: str | None = None
    categories: list[str]
    citation_count: int | None = None
    reference_count: int | None = None


class PaperSearchResponse(BaseModel):
    topic: str
    source: str
    max_results: int
    papers: list[Paper]


class RankedPaper(BaseModel):
    paper: Paper
    rank_position: int
    relevance_score: float
    ranking_method: str
    ranking_explanation: str


class RankedPaperSearchResponse(BaseModel):
    topic: str
    source: str
    max_results: int
    ranking_method: str
    papers: list[RankedPaper]


class RunPapersResponse(BaseModel):
    run_id: str
    papers: list[RankedPaper]
