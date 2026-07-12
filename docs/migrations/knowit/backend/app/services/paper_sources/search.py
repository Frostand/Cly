from difflib import SequenceMatcher
from typing import Literal

from app.models.papers import Paper
from app.services.paper_sources.arxiv_search import ArxivSearchError, search_arxiv
from app.services.paper_sources.semantic_scholar_search import (
    SemanticScholarSearchError,
    search_semantic_scholar,
)

PaperSource = Literal["arxiv", "semantic_scholar", "both"]


class PaperSourceSearchError(Exception):
    def __init__(self, message: str, *, kind: str = "general") -> None:
        super().__init__(message)
        self.kind = kind


def search_papers(
    topic: str,
    max_results: int = 25,
    source: PaperSource = "arxiv",
) -> list[Paper]:
    if source == "arxiv":
        return _search_arxiv(topic, max_results)

    if source == "semantic_scholar":
        return _search_semantic_scholar(topic, max_results)

    if source == "both":
        arxiv_papers: list[Paper] = []
        s2_papers: list[Paper] = []
        errors: list[str] = []
        try:
            arxiv_papers = _search_arxiv(topic, max_results)
        except PaperSourceSearchError as exc:
            errors.append(str(exc))
        try:
            s2_papers = _search_semantic_scholar(topic, max_results)
        except PaperSourceSearchError as exc:
            errors.append(str(exc))
        if not arxiv_papers and not s2_papers:
            raise PaperSourceSearchError(
                "Both paper sources failed: " + "; ".join(errors),
            )
        return deduplicate_papers([*arxiv_papers, *s2_papers])

    raise PaperSourceSearchError(f"Unknown paper source '{source}'")


def deduplicate_papers(papers: list[Paper]) -> list[Paper]:
    deduplicated: list[Paper] = []
    for paper in papers:
        if not _has_duplicate(paper, deduplicated):
            deduplicated.append(paper)

    return deduplicated


def _has_duplicate(paper: Paper, existing_papers: list[Paper]) -> bool:
    for existing_paper in existing_papers:
        if _matching_doi(paper, existing_paper):
            return True
        if _matching_title(paper, existing_paper):
            return True

    return False


def _matching_doi(left: Paper, right: Paper) -> bool:
    if not left.doi or not right.doi:
        return False

    return _normalize_doi(left.doi) == _normalize_doi(right.doi)


def _matching_title(left: Paper, right: Paper) -> bool:
    left_title = _normalize_title(left.title)
    right_title = _normalize_title(right.title)
    if not left_title or not right_title:
        return False

    return SequenceMatcher(None, left_title, right_title).ratio() >= 0.96


def _normalize_doi(value: str) -> str:
    return value.strip().lower().removeprefix("https://doi.org/").removeprefix("doi:")


def _normalize_title(value: str) -> str:
    normalized = "".join(
        character.lower() if character.isalnum() else " " for character in value
    )
    return " ".join(normalized.split())


def _search_arxiv(topic: str, max_results: int) -> list[Paper]:
    try:
        return search_arxiv(topic=topic, max_results=max_results)
    except ArxivSearchError as exc:
        raise PaperSourceSearchError(str(exc), kind=exc.kind) from exc


def _search_semantic_scholar(topic: str, max_results: int) -> list[Paper]:
    try:
        return search_semantic_scholar(topic=topic, max_results=max_results)
    except SemanticScholarSearchError as exc:
        raise PaperSourceSearchError(str(exc), kind=exc.kind) from exc
