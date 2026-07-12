from fastapi import APIRouter, HTTPException, Query, status

from app.models.papers import PaperSearchResponse, RankedPaperSearchResponse
from app.models.runs import TOPIC_MAX_LENGTH
from app.services.paper_sources.search import (
    PaperSource,
    PaperSourceSearchError,
    search_papers,
)
from app.services.ranking.rrf_ranker import RRF_RANKING_METHOD, fuse_ranked_papers
from app.services.ranking.semantic_ranker import rank_papers_semantically
from app.services.ranking.simple_ranker import rank_papers
from app.storage.repositories import RunNotFoundError, save_ranked_papers


router = APIRouter(prefix="/search", tags=["search"])


@router.get("/arxiv", response_model=PaperSearchResponse)
def search_arxiv_papers(
    topic: str = Query(min_length=1, max_length=TOPIC_MAX_LENGTH),
    max_results: int = Query(default=25, ge=1, le=100),
) -> PaperSearchResponse:
    return search_source_papers(topic=topic, max_results=max_results, source="arxiv")


@router.get("/papers", response_model=PaperSearchResponse)
def search_source_papers(
    topic: str = Query(min_length=1, max_length=TOPIC_MAX_LENGTH),
    max_results: int = Query(default=25, ge=1, le=100),
    source: PaperSource = Query(default="arxiv"),
) -> PaperSearchResponse:
    try:
        papers = search_papers(topic=topic, max_results=max_results, source=source)
    except PaperSourceSearchError as exc:
        raise _paper_source_search_http_exception(exc) from exc

    return PaperSearchResponse(
        topic=topic.strip(),
        source=source,
        max_results=max_results,
        papers=papers,
    )


@router.get("/arxiv/ranked", response_model=RankedPaperSearchResponse)
def search_ranked_arxiv_papers(
    topic: str = Query(min_length=1, max_length=TOPIC_MAX_LENGTH),
    max_results: int = Query(default=25, ge=1, le=100),
    run_id: str | None = Query(default=None, min_length=1),
) -> RankedPaperSearchResponse:
    return search_ranked_source_papers(
        topic=topic,
        max_results=max_results,
        source="arxiv",
        run_id=run_id,
    )


@router.get("/papers/ranked", response_model=RankedPaperSearchResponse)
def search_ranked_source_papers(
    topic: str = Query(min_length=1, max_length=TOPIC_MAX_LENGTH),
    max_results: int = Query(default=25, ge=1, le=100),
    source: PaperSource = Query(default="arxiv"),
    run_id: str | None = Query(default=None, min_length=1),
) -> RankedPaperSearchResponse:
    try:
        papers = search_papers(topic=topic, max_results=max_results, source=source)
    except PaperSourceSearchError as exc:
        raise _paper_source_search_http_exception(exc) from exc

    keyword_ranked_papers = rank_papers(topic=topic, papers=papers)
    semantic_ranked_papers = rank_papers_semantically(topic=topic, papers=papers)
    ranked_papers = fuse_ranked_papers(
        keyword_ranked=keyword_ranked_papers,
        semantic_ranked=semantic_ranked_papers,
    )
    if run_id is not None:
        try:
            save_ranked_papers(run_id=run_id, ranked_papers=ranked_papers)
        except RunNotFoundError as exc:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Research run not found",
            ) from exc

    return RankedPaperSearchResponse(
        topic=topic.strip(),
        source=source,
        max_results=max_results,
        ranking_method=RRF_RANKING_METHOD,
        papers=ranked_papers,
    )


def _paper_source_search_http_exception(exc: PaperSourceSearchError) -> HTTPException:
    status_by_kind = {
        "timeout": status.HTTP_504_GATEWAY_TIMEOUT,
        "rate_limited": status.HTTP_429_TOO_MANY_REQUESTS,
        "general": status.HTTP_502_BAD_GATEWAY,
    }
    return HTTPException(
        status_code=status_by_kind[exc.kind],
        detail={
            "message": str(exc),
            "type": exc.kind,
        },
    )


_arxiv_search_http_exception = _paper_source_search_http_exception
