from collections.abc import Iterator
from dataclasses import dataclass
from typing import Literal
import time

import requests

from app.models.papers import Paper


PDF_FETCH_TIMEOUT_SECONDS = 30
ARXIV_PDF_DELAY_SECONDS = 3
PDF_FETCH_RETRIES = 3
MAX_PDF_BYTES = 25 * 1024 * 1024

PdfFetchStatus = Literal[
    "pdf_downloaded",
    "no_pdf_available",
    "download_failed",
]


@dataclass(frozen=True)
class PdfFetchResult:
    status: PdfFetchStatus
    content: bytes | None = None


def fetch_pdf_for_paper(
    paper: Paper,
    *,
    session: requests.Session | None = None,
    delay_seconds: float = ARXIV_PDF_DELAY_SECONDS,
    retries: int = PDF_FETCH_RETRIES,
    timeout_seconds: int = PDF_FETCH_TIMEOUT_SECONDS,
    max_bytes: int = MAX_PDF_BYTES,
) -> PdfFetchResult:
    if not paper.pdf_url:
        return PdfFetchResult(status="no_pdf_available")

    http_session = session or requests.Session()
    attempts = max(1, retries)
    for attempt in range(attempts):
        if paper.source == "arxiv" and delay_seconds > 0:
            time.sleep(delay_seconds)

        try:
            response = http_session.get(
                paper.pdf_url,
                headers={"Accept": "application/pdf"},
                stream=True,
                timeout=timeout_seconds,
            )
        except requests.RequestException:
            if attempt == attempts - 1:
                return PdfFetchResult(status="download_failed")
            continue

        if response.status_code == 404:
            _close_response(response)
            return PdfFetchResult(status="no_pdf_available")

        if response.status_code == 429 or response.status_code >= 500:
            _close_response(response)
            if attempt == attempts - 1:
                return PdfFetchResult(status="download_failed")
            continue

        if response.status_code < 200 or response.status_code >= 300:
            _close_response(response)
            return PdfFetchResult(status="download_failed")

        content = _read_limited_response(response, max_bytes=max_bytes)
        if content is None:
            return PdfFetchResult(status="download_failed")
        if not _looks_like_pdf(content, response.headers.get("content-type", "")):
            return PdfFetchResult(status="download_failed")
        return PdfFetchResult(status="pdf_downloaded", content=content)

    return PdfFetchResult(status="download_failed")


def _read_limited_response(
    response: requests.Response,
    *,
    max_bytes: int,
) -> bytes | None:
    chunks: list[bytes] = []
    total_bytes = 0
    try:
        for chunk in _iter_response_content(response):
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                return None
            chunks.append(chunk)
    except requests.RequestException:
        return None
    finally:
        _close_response(response)

    return b"".join(chunks)


def _iter_response_content(response: requests.Response) -> Iterator[bytes]:
    for chunk in response.iter_content(chunk_size=64 * 1024):
        if chunk:
            yield chunk


def _looks_like_pdf(content: bytes, content_type: str) -> bool:
    return content.startswith(b"%PDF") or "application/pdf" in content_type.lower()


def _close_response(response: requests.Response) -> None:
    close = getattr(response, "close", None)
    if callable(close):
        close()
