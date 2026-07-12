import re
from collections.abc import Sequence

from app.models.papers import Paper, RankedPaper


SIMPLE_RANKING_METHOD = "keyword_v1"

_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
_STOP_WORDS = {
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "by",
    "for",
    "from",
    "in",
    "is",
    "of",
    "on",
    "or",
    "the",
    "to",
    "using",
    "with",
}


def rank_papers(topic: str, papers: Sequence[Paper]) -> list[RankedPaper]:
    terms = _topic_terms(topic)
    query = topic.strip().lower()

    scored = [_score_paper(paper=paper, query=query, terms=terms) for paper in papers]
    scored.sort(key=lambda ranked: (-ranked.relevance_score, ranked.paper.title.lower()))

    return [
        ranked.model_copy(update={"rank_position": index})
        for index, ranked in enumerate(scored, start=1)
    ]


def _score_paper(paper: Paper, query: str, terms: list[str]) -> RankedPaper:
    title = paper.title.lower()
    abstract = paper.abstract.lower()

    title_matches = _count_term_matches(title, terms)
    abstract_matches = _count_term_matches(abstract, terms)
    title_phrase_matches = _count_phrase_matches(title, query)
    abstract_phrase_matches = _count_phrase_matches(abstract, query)

    score = (
        title_matches * 3
        + abstract_matches
        + title_phrase_matches * 8
        + abstract_phrase_matches * 4
    )

    explanation = (
        f"title term matches: {title_matches}; "
        f"abstract term matches: {abstract_matches}; "
        f"title exact phrase matches: {title_phrase_matches}; "
        f"abstract exact phrase matches: {abstract_phrase_matches}"
    )

    return RankedPaper(
        paper=paper,
        rank_position=0,
        relevance_score=float(score),
        ranking_method=SIMPLE_RANKING_METHOD,
        ranking_explanation=explanation,
    )


def _topic_terms(topic: str) -> list[str]:
    tokens = _tokens(topic)
    terms = [token for token in tokens if token not in _STOP_WORDS]
    if not terms:
        terms = tokens

    return list(dict.fromkeys(terms))


def _count_term_matches(text: str, terms: list[str]) -> int:
    if not terms:
        return 0

    tokens = _tokens(text)
    return sum(1 for token in tokens if token in terms)


def _count_phrase_matches(text: str, query: str) -> int:
    if not query:
        return 0

    return text.count(query)


def _tokens(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())
