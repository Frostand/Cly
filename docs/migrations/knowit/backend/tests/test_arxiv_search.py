import unittest
from unittest.mock import patch

import arxiv
import requests

from app.services.paper_sources import arxiv_search
from app.services.paper_sources.arxiv_search import ArxivSearchError, TimeoutSession, search_arxiv
from app.routes.search import _arxiv_search_http_exception


class ArxivSearchTest(unittest.TestCase):
    def test_timeout_session_adds_default_timeout(self) -> None:
        with patch.object(
            requests.Session,
            "request",
            side_effect=requests.exceptions.Timeout("slow response"),
        ) as request:
            session = TimeoutSession(timeout_seconds=7)

            with self.assertRaises(requests.exceptions.Timeout):
                session.get("https://export.arxiv.org/api/query")

        self.assertEqual(request.call_args.kwargs["timeout"], 7)

    def test_timeout_session_keeps_explicit_timeout(self) -> None:
        with patch.object(
            requests.Session,
            "request",
            side_effect=requests.exceptions.Timeout("slow response"),
        ) as request:
            session = TimeoutSession(timeout_seconds=7)

            with self.assertRaises(requests.exceptions.Timeout):
                session.get("https://export.arxiv.org/api/query", timeout=2)

        self.assertEqual(request.call_args.kwargs["timeout"], 2)

    def test_blank_query_returns_empty_without_constructing_client(self) -> None:
        with patch.object(arxiv_search.arxiv, "Client") as client:
            self.assertEqual(search_arxiv("   "), [])

        client.assert_not_called()

    def test_timeout_error_is_classified(self) -> None:
        with patch.object(
            arxiv_search.arxiv.Client,
            "results",
            side_effect=requests.exceptions.Timeout("slow response"),
        ):
            with self.assertRaises(ArxivSearchError) as raised:
                search_arxiv("retrieval augmented generation", max_results=1)

        self.assertEqual(raised.exception.kind, "timeout")
        self.assertEqual(str(raised.exception), "arXiv search timed out")

    def test_rate_limit_error_is_classified(self) -> None:
        with patch.object(
            arxiv_search.arxiv.Client,
            "results",
            side_effect=arxiv.HTTPError(
                "https://export.arxiv.org/api/query",
                retry=3,
                status=429,
            ),
        ):
            with self.assertRaises(ArxivSearchError) as raised:
                search_arxiv("retrieval augmented generation", max_results=1)

        self.assertEqual(raised.exception.kind, "rate_limited")
        self.assertEqual(str(raised.exception), "arXiv rate limit reached")

    def test_general_arxiv_error_is_classified(self) -> None:
        with patch.object(
            arxiv_search.arxiv.Client,
            "results",
            side_effect=arxiv.UnexpectedEmptyPageError("url", retry=3, raw_feed=None),
        ):
            with self.assertRaises(ArxivSearchError) as raised:
                search_arxiv("retrieval augmented generation", max_results=1)

        self.assertEqual(raised.exception.kind, "general")
        self.assertEqual(str(raised.exception), "Unable to search arXiv right now")

    def test_http_exception_mapping_includes_specific_type(self) -> None:
        timeout_exception = _arxiv_search_http_exception(
            ArxivSearchError("arXiv search timed out", kind="timeout")
        )
        rate_limit_exception = _arxiv_search_http_exception(
            ArxivSearchError("arXiv rate limit reached", kind="rate_limited")
        )
        general_exception = _arxiv_search_http_exception(
            ArxivSearchError("Unable to search arXiv right now")
        )

        self.assertEqual(timeout_exception.status_code, 504)
        self.assertEqual(timeout_exception.detail["type"], "timeout")
        self.assertEqual(rate_limit_exception.status_code, 429)
        self.assertEqual(rate_limit_exception.detail["type"], "rate_limited")
        self.assertEqual(general_exception.status_code, 502)
        self.assertEqual(general_exception.detail["type"], "general")


if __name__ == "__main__":
    unittest.main()
