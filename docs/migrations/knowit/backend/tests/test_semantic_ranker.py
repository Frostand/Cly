import unittest
from collections.abc import Mapping, Sequence
from typing import Any

from app.models.ai_providers import ProviderHealth, ProviderInfo
from app.models.papers import Paper
from app.services.ai_providers.base import BaseAIProvider
from app.services.ranking.semantic_ranker import (
    SEMANTIC_RANKING_METHOD,
    rank_papers_semantically,
)


def paper(title: str, abstract: str) -> Paper:
    return Paper(
        paper_id=f"test:{title}",
        source="test",
        source_id=title,
        title=title,
        authors=["Ada Lovelace"],
        abstract=abstract,
        paper_url="https://example.test/paper",
        categories=["cs.AI"],
    )


class StubEmbeddingProvider(BaseAIProvider):
    name = "stub"

    def info(self) -> ProviderInfo:
        raise NotImplementedError

    def health_check(self) -> ProviderHealth:
        raise NotImplementedError

    def embed_texts(
        self,
        texts: Sequence[str],
        options: Mapping[str, Any] | None = None,
    ) -> list[list[float]]:
        embeddings_by_marker = {
            "query": [1.0, 0.0],
            "close": [0.9, 0.1],
            "far": [0.0, 1.0],
        }
        return [
            next(
                embedding
                for marker, embedding in embeddings_by_marker.items()
                if marker in text
            )
            for text in texts
        ]


class SemanticRankerTest(unittest.TestCase):
    def test_semantic_ranker_empty_papers(self) -> None:
        self.assertEqual(rank_papers_semantically("query", []), [])

    def test_semantic_similarity_orders_papers(self) -> None:
        ranked = rank_papers_semantically(
            "query",
            [
                paper("Far paper", "far"),
                paper("Close paper", "close"),
            ],
            provider=StubEmbeddingProvider(),
        )

        self.assertEqual(ranked[0].paper.title, "Close paper")
        self.assertEqual(ranked[0].rank_position, 1)
        self.assertEqual(ranked[0].ranking_method, SEMANTIC_RANKING_METHOD)
        self.assertGreater(ranked[0].relevance_score, ranked[1].relevance_score)


if __name__ == "__main__":
    unittest.main()
