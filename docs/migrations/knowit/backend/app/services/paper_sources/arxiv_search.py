from collections.abc import Iterable
from typing import Literal

import arxiv
import requests

from app.models.papers import Paper


ARXIV_REQUEST_TIMEOUT_SECONDS = 20

ArxivSearchErrorKind = Literal["timeout", "rate_limited", "general"]


class ArxivSearchError(Exception):
    def __init__(self, message: str, *, kind: ArxivSearchErrorKind = "general") -> None:
        super().__init__(message)
        self.kind = kind


class TimeoutSession(requests.Session):
    def __init__(self, timeout_seconds: int = ARXIV_REQUEST_TIMEOUT_SECONDS) -> None:
        super().__init__()
        self.timeout_seconds = timeout_seconds

    def request(self, method: str, url: str, **kwargs: object) -> requests.Response:
        kwargs.setdefault("timeout", self.timeout_seconds)
        return super().request(method, url, **kwargs)


def search_arxiv(topic: str, max_results: int = 25) -> list[Paper]:
    query = topic.strip()
    if not query:
        return []

    client = arxiv.Client(page_size=min(max_results, 100), delay_seconds=3, num_retries=3)
    client._session = TimeoutSession()
    search = arxiv.Search(
        query=query,
        max_results=max_results,
        sort_by=arxiv.SortCriterion.Relevance,
    )

    try:
        return [_normalize_result(result) for result in client.results(search)]
    except requests.exceptions.Timeout as exc:
        raise ArxivSearchError("arXiv search timed out", kind="timeout") from exc
    except arxiv.HTTPError as exc:
        if exc.status == 429:
            raise ArxivSearchError("arXiv rate limit reached", kind="rate_limited") from exc
        raise ArxivSearchError("Unable to search arXiv right now") from exc
    except arxiv.ArxivError as exc:
        raise ArxivSearchError("Unable to search arXiv right now") from exc


def _normalize_result(result: arxiv.Result) -> Paper:
    source_id = _source_id(result)
    return Paper(
        paper_id=f"arxiv:{source_id}",
        source="arxiv",
        source_id=source_id,
        title=_clean_text(result.title),
        authors=_author_names(result.authors),
        abstract=_clean_text(result.summary),
        doi=result.doi,
        published_date=result.published,
        updated_date=result.updated,
        paper_url=result.entry_id,
        pdf_url=result.pdf_url,
        categories=list(result.categories or []),
    )


def _source_id(result: arxiv.Result) -> str:
    short_id = result.get_short_id()
    if short_id:
        return short_id

    return result.entry_id.rstrip("/").split("/")[-1]


def _author_names(authors: Iterable[arxiv.Result.Author]) -> list[str]:
    return [_clean_text(author.name) for author in authors if author.name]


def _clean_text(value: str) -> str:
    return " ".join(value.split())
