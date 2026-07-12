import unittest

from app.models.papers import Paper, RankedPaper
from app.services.ranking.rrf_ranker import RRF_RANKING_METHOD, fuse_ranked_papers


def paper(paper_id: str, title: str) -> Paper:
    return Paper(
        paper_id=paper_id,
        source="test",
        source_id=paper_id,
        title=title,
        authors=["Ada Lovelace"],
        abstract="Test abstract",
        paper_url="https://example.test/paper",
        categories=["cs.AI"],
    )


def ranked(paper: Paper, rank_position: int, method: str) -> RankedPaper:
    return RankedPaper(
        paper=paper,
        rank_position=rank_position,
        relevance_score=float(100 - rank_position),
        ranking_method=method,
        ranking_explanation="test",
    )


class RrfRankerTest(unittest.TestCase):
    def test_rrf_merges_both_signals(self) -> None:
        high_both = paper("p1", "High in both")
        semantic_only = paper("p2", "Semantic only")
        keyword_only = paper("p3", "Keyword only")
        neither = paper("p4", "Neither")

        result = fuse_ranked_papers(
            keyword_ranked=[
                ranked(high_both, 1, "keyword_v1"),
                ranked(keyword_only, 2, "keyword_v1"),
                ranked(semantic_only, 3, "keyword_v1"),
                ranked(neither, 4, "keyword_v1"),
            ],
            semantic_ranked=[
                ranked(high_both, 1, "semantic_embedding_v1"),
                ranked(semantic_only, 2, "semantic_embedding_v1"),
                ranked(keyword_only, 3, "semantic_embedding_v1"),
                ranked(neither, 4, "semantic_embedding_v1"),
            ],
        )

        self.assertEqual(result[0].paper.paper_id, high_both.paper_id)
        self.assertLess(
            [item.paper.paper_id for item in result].index(semantic_only.paper_id),
            [item.paper.paper_id for item in result].index(neither.paper_id),
        )
        self.assertEqual(result[0].ranking_method, RRF_RANKING_METHOD)
        self.assertIn("keyword rank: 1", result[0].ranking_explanation)
        self.assertIn("semantic rank: 1", result[0].ranking_explanation)
        self.assertEqual([item.rank_position for item in result], [1, 2, 3, 4])


if __name__ == "__main__":
    unittest.main()
