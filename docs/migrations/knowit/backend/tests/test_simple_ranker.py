import unittest

from app.models.papers import Paper
from app.services.ranking.simple_ranker import SIMPLE_RANKING_METHOD, rank_papers


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


class SimpleRankerTest(unittest.TestCase):
    def test_title_matches_rank_above_abstract_only_matches(self) -> None:
        papers = [
            paper(
                "A general survey",
                "This paper mentions retrieval augmented generation in passing.",
            ),
            paper(
                "Retrieval Augmented Generation for Agents",
                "A focused paper about tool use.",
            ),
        ]

        ranked = rank_papers("retrieval augmented generation", papers)

        self.assertEqual(ranked[0].paper.title, "Retrieval Augmented Generation for Agents")
        self.assertEqual(ranked[0].rank_position, 1)
        self.assertEqual(ranked[1].rank_position, 2)
        self.assertGreater(ranked[0].relevance_score, ranked[1].relevance_score)

    def test_explanation_and_method_are_present(self) -> None:
        ranked = rank_papers(
            "retrieval augmented generation",
            [paper("Retrieval Augmented Generation", "retrieval systems")],
        )

        self.assertEqual(ranked[0].ranking_method, SIMPLE_RANKING_METHOD)
        self.assertIn("title term matches", ranked[0].ranking_explanation)
        self.assertIn("abstract term matches", ranked[0].ranking_explanation)

    def test_empty_topic_does_not_crash(self) -> None:
        ranked = rank_papers("", [paper("Anything", "Any abstract")])

        self.assertEqual(len(ranked), 1)
        self.assertEqual(ranked[0].relevance_score, 0)
        self.assertEqual(ranked[0].rank_position, 1)


if __name__ == "__main__":
    unittest.main()
