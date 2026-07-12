from collections.abc import Mapping
from datetime import datetime, timezone
from time import sleep
from typing import Any, Literal

import requests

from app.models.papers import Paper


SEMANTIC_SCHOLAR_SEARCH_URL = "https://api.semanticscholar.org/graph/v1/paper/search"
SEMANTIC_SCHOLAR_REQUEST_TIMEOUT_SECONDS = 20
SEMANTIC_SCHOLAR_FIELDS = ",".join(
    [
        "title",
        "authors",
        "abstract",
        "year",
        "url",
        "externalIds",
        "citationCount",
        "referenceCount",
        "fieldsOfStudy",
    ]
)
SEMANTIC_SCHOLAR_MAX_RETRIES = 3

SemanticScholarSearchErrorKind = Literal["timeout", "rate_limited", "general"]


class SemanticScholarSearchError(Exception):
    def __init__(
        self,
        message: str,
        *,
        kind: SemanticScholarSearchErrorKind = "general",
    ) -> None:
        super().__init__(message)
        self.kind = kind


def search_semantic_scholar(
    topic: str,
    max_results: int = 25,
    session: requests.Session | None = None,
) -> list[Paper]:
    query = topic.strip()
    if not query:
        return []

    active_session = session or requests.Session()
    params = {
        "query": query,
        "limit": max_results,
        "fields": SEMANTIC_SCHOLAR_FIELDS,
    }

    for attempt in range(SEMANTIC_SCHOLAR_MAX_RETRIES):
        try:
            response = active_session.get(
                SEMANTIC_SCHOLAR_SEARCH_URL,
                params=params,
                timeout=SEMANTIC_SCHOLAR_REQUEST_TIMEOUT_SECONDS,
            )
        except requests.exceptions.Timeout as exc:
            raise SemanticScholarSearchError(
                "Semantic Scholar search timed out",
                kind="timeout",
            ) from exc
        except requests.RequestException as exc:
            raise SemanticScholarSearchError(
                "Unable to search Semantic Scholar right now",
            ) from exc

        if response.status_code == 429:
            if attempt == SEMANTIC_SCHOLAR_MAX_RETRIES - 1:
                raise SemanticScholarSearchError(
                    "Semantic Scholar rate limit reached",
                    kind="rate_limited",
                )
            _sleep_before_retry(response, attempt)
            continue

        try:
            response.raise_for_status()
        except requests.RequestException as exc:
            raise SemanticScholarSearchError(
                "Unable to search Semantic Scholar right now",
            ) from exc

        payload = response.json()
        if not isinstance(payload, Mapping):
            raise SemanticScholarSearchError("Semantic Scholar returned invalid data")

        data = payload.get("data", [])
        if not isinstance(data, list):
            raise SemanticScholarSearchError("Semantic Scholar returned invalid data")

        return [
            _normalize_result(result)
            for result in data
            if isinstance(result, Mapping) and result.get("paperId")
        ]

    raise SemanticScholarSearchError(
        "Semantic Scholar rate limit reached",
        kind="rate_limited",
    )


def _sleep_before_retry(response: requests.Response, attempt: int) -> None:
    retry_after = response.headers.get("Retry-After")
    if retry_after is not None:
        try:
            delay_seconds = float(retry_after)
        except ValueError:
            delay_seconds = 2**attempt
    else:
        delay_seconds = 2**attempt

    sleep(min(delay_seconds, 30))


def _normalize_result(result: Mapping[str, Any]) -> Paper:
    source_id = str(result["paperId"])
    external_ids = result.get("externalIds")
    external_id_map = external_ids if isinstance(external_ids, Mapping) else {}
    doi = _optional_string(external_id_map.get("DOI"))
    arxiv_id = _optional_string(external_id_map.get("ArXiv"))

    return Paper(
        paper_id=f"s2:{source_id}",
        source="semantic_scholar",
        source_id=source_id,
        title=_clean_text(_optional_string(result.get("title")) or "Untitled paper"),
        authors=_author_names(result.get("authors")),
        abstract=_clean_text(_optional_string(result.get("abstract")) or ""),
        doi=doi,
        published_date=_published_date(result.get("year")),
        updated_date=None,
        paper_url=_paper_url(result, source_id),
        pdf_url=f"https://arxiv.org/pdf/{arxiv_id}" if arxiv_id else None,
        categories=_categories(result.get("fieldsOfStudy")),
        citation_count=_optional_int(result.get("citationCount")),
        reference_count=_optional_int(result.get("referenceCount")),
    )


def _paper_url(result: Mapping[str, Any], source_id: str) -> str:
    url = _optional_string(result.get("url"))
    if url:
        return url

    return f"https://www.semanticscholar.org/paper/{source_id}"


def _author_names(authors: object) -> list[str]:
    if not isinstance(authors, list):
        return []

    names = []
    for author in authors:
        if isinstance(author, Mapping):
            name = _optional_string(author.get("name"))
            if name:
                names.append(_clean_text(name))

    return names


def _categories(fields_of_study: object) -> list[str]:
    if not isinstance(fields_of_study, list):
        return []

    return [
        _clean_text(field)
        for field in fields_of_study
        if isinstance(field, str) and field.strip()
    ]


def _published_date(year: object) -> datetime | None:
    value = _optional_int(year)
    if value is None or value <= 0 or value > 9999:
        return None

    return datetime(value, 1, 1, tzinfo=timezone.utc)


def _optional_int(value: object) -> int | None:
    if value is None:
        return None
    if isinstance(value, bool):
        return None

    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def _optional_string(value: object) -> str | None:
    if not isinstance(value, str):
        return None

    cleaned = _clean_text(value)
    return cleaned or None


def _clean_text(value: str) -> str:
    return " ".join(value.split())
