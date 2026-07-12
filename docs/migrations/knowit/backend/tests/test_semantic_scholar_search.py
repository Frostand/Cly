import unittest
from unittest.mock import Mock, patch

import requests

from app.models.papers import Paper
from app.services.paper_sources import semantic_scholar_search
from app.services.paper_sources.search import deduplicate_papers, search_papers
from app.services.paper_sources.semantic_scholar_search import (
    SEMANTIC_SCHOLAR_SEARCH_URL,
    SemanticScholarSearchError,
    search_semantic_scholar,
)


def response(
    status_code: int = 200,
    payload: dict | None = None,
    headers: dict[str, str] | None = None,
) -> Mock:
    mock_response = Mock()
    mock_response.status_code = status_code
    mock_response.headers = headers or {}
    mock_response.json.return_value = payload or {"data": []}
    mock_response.raise_for_status.side_effect = (
        requests.HTTPError("request failed") if status_code >= 400 else None
    )
    return mock_response


class SemanticScholarSearchTest(unittest.TestCase):
    def test_blank_query_returns_empty_without_request(self) -> None:
        session = Mock()

        self.assertEqual(search_semantic_scholar("   ", session=session), [])

        session.get.assert_not_called()

    def test_search_normalizes_semantic_scholar_result(self) -> None:
        session = Mock()
        session.get.return_value = response(
            payload={
                "data": [
                    {
                        "paperId": "abc123",
                        "title": " Retrieval Augmented Generation ",
                        "authors": [{"name": "Ada Lovelace"}],
                        "abstract": "  A paper\nabout RAG. ",
                        "year": 2024,
                        "url": "https://www.semanticscholar.org/paper/abc123",
                        "externalIds": {
                            "DOI": "10.1000/rag",
                            "ArXiv": "2401.00001",
                        },
                        "citationCount": 42,
                        "referenceCount": 11,
                        "fieldsOfStudy": ["Computer Science"],
                    }
                ]
            }
        )

        papers = search_semantic_scholar("retrieval augmented generation", 5, session)

        self.assertEqual(len(papers), 1)
        paper = papers[0]
        self.assertEqual(paper.paper_id, "s2:abc123")
        self.assertEqual(paper.source, "semantic_scholar")
        self.assertEqual(paper.source_id, "abc123")
        self.assertEqual(paper.title, "Retrieval Augmented Generation")
        self.assertEqual(paper.authors, ["Ada Lovelace"])
        self.assertEqual(paper.abstract, "A paper about RAG.")
        self.assertEqual(paper.doi, "10.1000/rag")
        self.assertEqual(paper.published_date.year, 2024)
        self.assertEqual(paper.pdf_url, "https://arxiv.org/pdf/2401.00001")
        self.assertEqual(paper.categories, ["Computer Science"])
        self.assertEqual(paper.citation_count, 42)
        self.assertEqual(paper.reference_count, 11)
        session.get.assert_called_once()
        self.assertEqual(session.get.call_args.args[0], SEMANTIC_SCHOLAR_SEARCH_URL)
        self.assertEqual(session.get.call_args.kwargs["params"]["limit"], 5)

    def test_rate_limit_retries_then_succeeds(self) -> None:
        session = Mock()
        session.get.side_effect = [
            response(status_code=429, headers={"Retry-After": "0"}),
            response(payload={"data": []}),
        ]

        with patch.object(semantic_scholar_search, "sleep") as sleep:
            papers = search_semantic_scholar("topic", session=session)

        self.assertEqual(papers, [])
        self.assertEqual(session.get.call_count, 2)
        sleep.assert_called_once_with(0.0)

    def test_rate_limit_after_retries_is_classified(self) -> None:
        session = Mock()
        session.get.return_value = response(status_code=429, headers={"Retry-After": "0"})

        with patch.object(semantic_scholar_search, "sleep"):
            with self.assertRaises(SemanticScholarSearchError) as raised:
                search_semantic_scholar("topic", session=session)

        self.assertEqual(raised.exception.kind, "rate_limited")
        self.assertEqual(str(raised.exception), "Semantic Scholar rate limit reached")

    def test_timeout_is_classified(self) -> None:
        session = Mock()
        session.get.side_effect = requests.exceptions.Timeout("slow")

        with self.assertRaises(SemanticScholarSearchError) as raised:
            search_semantic_scholar("topic", session=session)

        self.assertEqual(raised.exception.kind, "timeout")
        self.assertEqual(str(raised.exception), "Semantic Scholar search timed out")

    def test_deduplicate_papers_uses_doi_and_title_similarity(self) -> None:
        papers = [
            Paper(
                paper_id="arxiv:1",
                source="arxiv",
                source_id="1",
                title="Retrieval Augmented Generation for Knowledge Intensive NLP",
                authors=[],
                abstract="",
                doi="10.1000/rag",
                paper_url="https://arxiv.org/abs/1",
                pdf_url=None,
                categories=[],
            ),
            Paper(
                paper_id="s2:1",
                source="semantic_scholar",
                source_id="1",
                title="Retrieval-Augmented Generation for Knowledge-Intensive NLP",
                authors=[],
                abstract="",
                doi="https://doi.org/10.1000/rag",
                paper_url="https://www.semanticscholar.org/paper/1",
                pdf_url=None,
                categories=[],
            ),
            Paper(
                paper_id="s2:2",
                source="semantic_scholar",
                source_id="2",
                title="A Different Paper",
                authors=[],
                abstract="",
                paper_url="https://www.semanticscholar.org/paper/2",
                pdf_url=None,
                categories=[],
            ),
        ]

        deduplicated = deduplicate_papers(papers)

        self.assertEqual([paper.paper_id for paper in deduplicated], ["arxiv:1", "s2:2"])

    def test_both_source_search_merges_and_deduplicates(self) -> None:
        arxiv_paper = Paper(
            paper_id="arxiv:1",
            source="arxiv",
            source_id="1",
            title="Shared Paper",
            authors=[],
            abstract="",
            doi="10.1000/shared",
            paper_url="https://arxiv.org/abs/1",
            pdf_url=None,
            categories=[],
        )
        semantic_duplicate = arxiv_paper.model_copy(
            update={
                "paper_id": "s2:1",
                "source": "semantic_scholar",
                "source_id": "1",
            }
        )

        with (
            patch(
                "app.services.paper_sources.search.search_arxiv",
                return_value=[arxiv_paper],
            ),
            patch(
                "app.services.paper_sources.search.search_semantic_scholar",
                return_value=[semantic_duplicate],
            ),
        ):
            papers = search_papers("shared", max_results=10, source="both")

        self.assertEqual([paper.paper_id for paper in papers], ["arxiv:1"])


if __name__ == "__main__":
    unittest.main()
