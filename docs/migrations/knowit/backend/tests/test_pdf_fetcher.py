import unittest

from app.models.papers import Paper
from app.services.paper_sources.pdf_fetcher import fetch_pdf_for_paper


def paper(pdf_url: str | None = "https://arxiv.org/pdf/0000.0001v1") -> Paper:
    return Paper(
        paper_id="arxiv:0000.0001v1",
        source="arxiv",
        source_id="0000.0001v1",
        title="Tool Using Language Models",
        authors=["Ada Lovelace"],
        abstract="Tool learning augments language models with external tools.",
        paper_url="https://arxiv.org/abs/0000.0001v1",
        pdf_url=pdf_url,
        categories=["cs.CL"],
    )


class FakeResponse:
    def __init__(
        self,
        status_code: int,
        chunks: list[bytes] | None = None,
        content_type: str = "application/pdf",
    ) -> None:
        self.status_code = status_code
        self.chunks = chunks or []
        self.headers = {"content-type": content_type}
        self.closed = False

    def iter_content(self, chunk_size: int) -> list[bytes]:
        return self.chunks

    def close(self) -> None:
        self.closed = True


class FakeSession:
    def __init__(self, responses: list[FakeResponse]) -> None:
        self.responses = responses
        self.calls = 0

    def get(self, *args, **kwargs) -> FakeResponse:
        response = self.responses[min(self.calls, len(self.responses) - 1)]
        self.calls += 1
        return response


class PdfFetcherTest(unittest.TestCase):
    def test_pdf_fetcher_handles_missing_pdf_url(self) -> None:
        result = fetch_pdf_for_paper(paper(pdf_url=None), delay_seconds=0)

        self.assertEqual(result.status, "no_pdf_available")
        self.assertIsNone(result.content)

    def test_pdf_fetcher_handles_missing_pdf_response(self) -> None:
        session = FakeSession([FakeResponse(404)])

        result = fetch_pdf_for_paper(
            paper(),
            session=session,  # type: ignore[arg-type]
            delay_seconds=0,
        )

        self.assertEqual(result.status, "no_pdf_available")
        self.assertIsNone(result.content)
        self.assertEqual(session.calls, 1)

    def test_pdf_fetcher_retries_rate_limit_and_returns_pdf_bytes(self) -> None:
        session = FakeSession(
            [
                FakeResponse(429),
                FakeResponse(200, chunks=[b"%PDF-1.7", b" body"]),
            ]
        )

        result = fetch_pdf_for_paper(
            paper(),
            session=session,  # type: ignore[arg-type]
            delay_seconds=0,
            retries=2,
        )

        self.assertEqual(result.status, "pdf_downloaded")
        self.assertEqual(result.content, b"%PDF-1.7 body")
        self.assertEqual(session.calls, 2)

    def test_pdf_fetcher_rejects_non_pdf_content(self) -> None:
        session = FakeSession(
            [FakeResponse(200, chunks=[b"<html>not a pdf</html>"], content_type="text/html")]
        )

        result = fetch_pdf_for_paper(
            paper(),
            session=session,  # type: ignore[arg-type]
            delay_seconds=0,
        )

        self.assertEqual(result.status, "download_failed")
        self.assertIsNone(result.content)


if __name__ == "__main__":
    unittest.main()
