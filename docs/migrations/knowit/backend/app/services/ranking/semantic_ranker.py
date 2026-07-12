import math
from collections.abc import Sequence

from app.models.papers import Paper, RankedPaper
from app.services.ai_providers.base import BaseAIProvider
from app.services.ai_providers.registry import get_provider


SEMANTIC_RANKING_METHOD = "semantic_embedding_v1"


def rank_papers_semantically(
    topic: str,
    papers: Sequence[Paper],
    provider: BaseAIProvider | None = None,
) -> list[RankedPaper]:
    if not papers:
        return []

    embedding_provider = provider or get_provider("mock")
    topic_embedding, *paper_embeddings = embedding_provider.embed_texts(
        [topic, *[_paper_text(paper) for paper in papers]],
        options={"task": "semantic_ranking"},
    )

    ranked = [
        RankedPaper(
            paper=paper,
            rank_position=0,
            relevance_score=_cosine_similarity(topic_embedding, paper_embedding),
            ranking_method=SEMANTIC_RANKING_METHOD,
            ranking_explanation="cosine similarity between topic and paper metadata embeddings",
        )
        for paper, paper_embedding in zip(papers, paper_embeddings, strict=True)
    ]
    ranked.sort(key=lambda item: (-item.relevance_score, item.paper.title.lower()))

    return [
        item.model_copy(update={"rank_position": index})
        for index, item in enumerate(ranked, start=1)
    ]


def _paper_text(paper: Paper) -> str:
    return f"{paper.title}\n\n{paper.abstract}"


def _cosine_similarity(left: Sequence[float], right: Sequence[float]) -> float:
    dot = sum(left_value * right_value for left_value, right_value in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm == 0 or right_norm == 0:
        return 0.0

    return dot / (left_norm * right_norm)
