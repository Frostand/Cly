from collections.abc import Sequence

from app.models.papers import Paper, RankedPaper


RRF_RANKING_METHOD = "rrf_keyword_semantic_v1"
RRF_K = 60


def fuse_ranked_papers(
    keyword_ranked: Sequence[RankedPaper],
    semantic_ranked: Sequence[RankedPaper],
    k: int = RRF_K,
) -> list[RankedPaper]:
    papers_by_id: dict[str, Paper] = {}
    keyword_ranks = _rank_lookup(keyword_ranked, papers_by_id)
    semantic_ranks = _rank_lookup(semantic_ranked, papers_by_id)

    fused: list[RankedPaper] = []
    for paper_id, paper in papers_by_id.items():
        keyword_rank = keyword_ranks.get(paper_id)
        semantic_rank = semantic_ranks.get(paper_id)
        score = _rrf_score(keyword_rank, k) + _rrf_score(semantic_rank, k)
        fused.append(
            RankedPaper(
                paper=paper,
                rank_position=0,
                relevance_score=score,
                ranking_method=RRF_RANKING_METHOD,
                ranking_explanation=(
                    f"keyword rank: {_rank_label(keyword_rank)}; "
                    f"semantic rank: {_rank_label(semantic_rank)}; "
                    f"rrf score: {score:.6f}"
                ),
            )
        )

    fused.sort(key=lambda item: (-item.relevance_score, item.paper.title.lower()))

    return [
        item.model_copy(update={"rank_position": index})
        for index, item in enumerate(fused, start=1)
    ]


def _rank_lookup(
    ranked_papers: Sequence[RankedPaper],
    papers_by_id: dict[str, Paper],
) -> dict[str, int]:
    ranks: dict[str, int] = {}
    for index, ranked_paper in enumerate(ranked_papers, start=1):
        paper_id = ranked_paper.paper.paper_id
        papers_by_id[paper_id] = ranked_paper.paper
        rank = ranked_paper.rank_position if ranked_paper.rank_position > 0 else index
        ranks[paper_id] = rank

    return ranks


def _rrf_score(rank: int | None, k: int) -> float:
    if rank is None:
        return 0.0

    return 1 / (k + rank)


def _rank_label(rank: int | None) -> str:
    if rank is None:
        return "not ranked"

    return str(rank)
