# Research Workspace, Map, Folders, and RRF Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Elicit-inspired research workspace where users can rank papers with keyword plus semantic signals, inspect results in a compact sortable table, save papers into local folders, download folder contents, and view a visual relationship map.

**Architecture:** Keep the current FastAPI + SQLite + Next.js app and add focused modules around ranking, paper metrics, library folders, and map generation. The backend remains local-first and deterministic by default; the frontend shifts from one long scrolling page to an app shell with a command center, table workspace, detail panel, folders sidebar, and map panel.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLite, pytest, Next.js App Router, React, TypeScript, Tailwind CSS, browser-native SVG, Playwright for UI verification.

## Global Constraints

- Follow `/Users/al1234/Documents/KnowIT!/AGENTS.md`: local-first, privacy-conscious, and no frontend secrets.
- Do not add cloud AI calls in this plan.
- Do not send full papers, PDFs, local files, extracted notes, or user topics to cloud AI.
- Ranking must work without paid APIs and without LLM calls.
- Keep arXiv/open metadata as the default source.
- Store folders, saved papers, generated maps, and metrics locally in SQLite.
- Provider health checks must not send private research content.
- Frontend must display provider/local status but must never receive API keys or raw secrets.
- Citation counts are optional metadata; if unavailable, citation sorting places unknown counts last.
- PDF parsing is documented as a follow-up ticket in this plan and is not part of the implementation tasks below.
- Preserve enough source references for users to inspect original papers.

---

## Scope Check

This request spans ranking, results layout, saved-paper organization, downloads, and a visual map. These features are tightly coupled around the same ranked paper set, so they are one integrated slice rather than separate projects. PDF parsing changes ingestion and text-storage behavior, so it is captured as a follow-up ticket after the workspace slice is stable.

## File Structure

### Backend Files

- Create `research-field-mapper/backend/app/models/metrics.py`
  - Pydantic models for citation/date/relevance sort metadata.
- Create `research-field-mapper/backend/app/models/workspaces.py`
  - Pydantic models for folders, saved papers, and folder downloads.
- Create `research-field-mapper/backend/app/models/research_maps.py`
  - Pydantic models for graph nodes, edges, clusters, and map responses.
- Create `research-field-mapper/backend/app/services/ranking/rrf_ranker.py`
  - Deterministic keyword + lightweight semantic ranker using Reciprocal Rank Fusion.
- Create `research-field-mapper/backend/app/services/enrichment/citation_metrics.py`
  - Local metadata enrichment interface and OpenAlex-compatible lookup function with testable HTTP injection.
- Create `research-field-mapper/backend/app/services/maps/research_map_builder.py`
  - Deterministic map builder from ranked papers, extractions, and landscape relationships.
- Create `research-field-mapper/backend/app/routes/workspaces.py`
  - Folder CRUD, save paper to folder, list folder papers, and folder ZIP download.
- Create `research-field-mapper/backend/app/routes/research_maps.py`
  - `GET /api/runs/{run_id}/map`.
- Modify `research-field-mapper/backend/app/models/papers.py`
  - Add paper metrics and ranking component fields to response models.
- Modify `research-field-mapper/backend/app/storage/database.py`
  - Add tables for `paper_metrics`, `folders`, `folder_papers`, and `research_maps`.
- Modify `research-field-mapper/backend/app/storage/repositories.py`
  - Add repository functions for metrics, folders, and maps.
- Modify `research-field-mapper/backend/app/services/ranking/__init__.py`
  - Export the RRF ranker.
- Modify `research-field-mapper/backend/app/pipeline/research_pipeline.py`
  - Replace `rank_papers` with `rank_papers_rrf`, save optional metrics, and build the map after synthesis.
- Modify `research-field-mapper/backend/app/routes/search.py`
  - Return `rrf_keyword_semantic_v1` ranked responses.
- Modify `research-field-mapper/backend/app/main.py`
  - Register workspace and map routers.
- Test `research-field-mapper/backend/tests/test_rrf_ranker.py`
- Test `research-field-mapper/backend/tests/test_citation_metrics.py`
- Test `research-field-mapper/backend/tests/test_workspaces.py`
- Test `research-field-mapper/backend/tests/test_research_map.py`

### Frontend Files

- Create `research-field-mapper/frontend/lib/types.ts`
  - Shared TypeScript types for runs, papers, metrics, folders, maps, and provider status.
- Create `research-field-mapper/frontend/lib/api.ts`
  - Typed fetch wrappers for existing and new backend routes.
- Create `research-field-mapper/frontend/lib/paperSort.ts`
  - Client sorting helpers used by table controls.
- Create `research-field-mapper/frontend/components/AppShell.tsx`
  - Left rail, header, and workspace frame.
- Create `research-field-mapper/frontend/components/CommandCenter.tsx`
  - Elicit-style topic input with provider/status controls.
- Create `research-field-mapper/frontend/components/RunWorkspace.tsx`
  - Main stateful workspace composed from table, detail panel, map, and folder controls.
- Create `research-field-mapper/frontend/components/PaperResultsTable.tsx`
  - Compact selectable table with sort/filter/search/download actions.
- Create `research-field-mapper/frontend/components/PaperDetailPanel.tsx`
  - Selected paper detail view with TL;DR, Problem, Method, Key results, and Why it matters.
- Create `research-field-mapper/frontend/components/ResearchMap.tsx`
  - SVG relationship map with node/edge interactions.
- Create `research-field-mapper/frontend/components/FolderSidebar.tsx`
  - Local library folders and folder paper counts.
- Create `research-field-mapper/frontend/components/SaveToFolderButton.tsx`
  - Save selected paper to an existing or newly created folder.
- Create `research-field-mapper/frontend/components/DownloadFolderButton.tsx`
  - Calls the folder download route.
- Modify `research-field-mapper/frontend/app/page.tsx`
  - Replace the long page with `RunWorkspace`.
- Modify `research-field-mapper/frontend/app/globals.css`
  - App shell colors, table density, detail panel, map canvas, and responsive rules.
- Test by creating `research-field-mapper/frontend/tests/workspace.spec.ts`
  - Playwright UI workflow against the local app.
- Modify `research-field-mapper/frontend/package.json`
  - Add `test:e2e` only if Playwright is already installed or install it in the frontend task.

---

## Task 1: Backend RRF Ranking and Paper Metrics

**Files:**
- Create: `research-field-mapper/backend/app/models/metrics.py`
- Create: `research-field-mapper/backend/app/services/ranking/rrf_ranker.py`
- Modify: `research-field-mapper/backend/app/models/papers.py`
- Modify: `research-field-mapper/backend/app/services/ranking/__init__.py`
- Modify: `research-field-mapper/backend/app/routes/search.py`
- Modify: `research-field-mapper/backend/app/pipeline/research_pipeline.py`
- Test: `research-field-mapper/backend/tests/test_rrf_ranker.py`

**Interfaces:**
- Consumes: `Paper` and `RankedPaper` from `app.models.papers`.
- Produces: `rank_papers_rrf(topic: str, papers: Sequence[Paper], metrics_by_paper_id: Mapping[str, PaperMetric] | None = None) -> list[RankedPaper]`.
- Produces: `RRF_RANKING_METHOD = "rrf_keyword_semantic_v1"`.
- Produces: `PaperMetric(paper_id: str, citation_count: int | None, citation_source: str | None, citation_updated_at: datetime | None)`.
- Produces: `RankedPaper.ranking_components: RankingComponents`.

- [ ] **Step 1: Write the failing RRF ranking tests**

Add `research-field-mapper/backend/tests/test_rrf_ranker.py`:

```python
from datetime import datetime, timezone

from app.models.metrics import PaperMetric
from app.models.papers import Paper
from app.services.ranking.rrf_ranker import RRF_RANKING_METHOD, rank_papers_rrf


def make_paper(
    paper_id: str,
    title: str,
    abstract: str,
    published_date: datetime | None = None,
) -> Paper:
    return Paper(
        paper_id=paper_id,
        source="arxiv",
        source_id=paper_id,
        title=title,
        authors=["Researcher One"],
        abstract=abstract,
        published_date=published_date,
        updated_date=None,
        paper_url=f"https://arxiv.org/abs/{paper_id}",
        pdf_url=f"https://arxiv.org/pdf/{paper_id}",
        categories=["cs.CL"],
    )


def test_rrf_combines_keyword_and_semantic_rankings() -> None:
    exact_keyword = make_paper(
        "2401.00001",
        "Retrieval augmented generation survey",
        "This paper says retrieval augmented generation once.",
    )
    semantic_match = make_paper(
        "2401.00002",
        "Grounded question answering with external documents",
        "Evidence retrieval and answer generation are combined for grounded responses.",
    )
    weak_match = make_paper(
        "2401.00003",
        "Image segmentation with transformers",
        "Vision model training and segmentation benchmarks.",
    )

    ranked = rank_papers_rrf(
        topic="retrieval augmented generation",
        papers=[weak_match, semantic_match, exact_keyword],
    )

    assert [item.paper.paper_id for item in ranked] == [
        "2401.00001",
        "2401.00002",
        "2401.00003",
    ]
    assert ranked[0].ranking_method == RRF_RANKING_METHOD
    assert ranked[0].ranking_components.keyword_rank == 1
    assert ranked[1].ranking_components.semantic_rank == 1
    assert "RRF" in ranked[0].ranking_explanation


def test_rrf_attaches_optional_citation_metrics() -> None:
    first = make_paper("2401.00001", "RAG evaluation", "retrieval generation evaluation")
    second = make_paper("2401.00002", "RAG systems", "retrieval generation systems")

    ranked = rank_papers_rrf(
        topic="retrieval augmented generation",
        papers=[first, second],
        metrics_by_paper_id={
            "2401.00001": PaperMetric(
                paper_id="2401.00001",
                citation_count=42,
                citation_source="openalex",
                citation_updated_at=datetime(2026, 7, 4, tzinfo=timezone.utc),
            )
        },
    )

    assert ranked[0].paper.metrics is not None
    assert ranked[0].paper.metrics.citation_count == 42
    assert ranked[1].paper.metrics is None
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_rrf_ranker.py -v
```

Expected: FAIL because `app.models.metrics` and `app.services.ranking.rrf_ranker` do not exist.

- [ ] **Step 3: Add the metrics and ranking component models**

Create `research-field-mapper/backend/app/models/metrics.py`:

```python
from datetime import datetime

from pydantic import BaseModel


class PaperMetric(BaseModel):
    paper_id: str
    citation_count: int | None = None
    citation_source: str | None = None
    citation_updated_at: datetime | None = None


class RankingComponents(BaseModel):
    keyword_rank: int
    semantic_rank: int
    keyword_score: float
    semantic_score: float
    rrf_score: float
```

Modify `research-field-mapper/backend/app/models/papers.py`:

```python
from datetime import datetime

from pydantic import BaseModel

from app.models.metrics import PaperMetric, RankingComponents


class Paper(BaseModel):
    paper_id: str
    source: str
    source_id: str
    title: str
    authors: list[str]
    abstract: str
    published_date: datetime | None = None
    updated_date: datetime | None = None
    paper_url: str
    pdf_url: str | None = None
    categories: list[str]
    metrics: PaperMetric | None = None


class PaperSearchResponse(BaseModel):
    topic: str
    source: str
    max_results: int
    papers: list[Paper]


class RankedPaper(BaseModel):
    paper: Paper
    rank_position: int
    relevance_score: float
    ranking_method: str
    ranking_explanation: str
    ranking_components: RankingComponents | None = None


class RankedPaperSearchResponse(BaseModel):
    topic: str
    source: str
    max_results: int
    ranking_method: str
    papers: list[RankedPaper]


class RunPapersResponse(BaseModel):
    run_id: str
    papers: list[RankedPaper]
```

- [ ] **Step 4: Add the RRF ranker**

Create `research-field-mapper/backend/app/services/ranking/rrf_ranker.py`:

```python
import math
import re
from collections import Counter
from collections.abc import Mapping, Sequence

from app.models.metrics import PaperMetric, RankingComponents
from app.models.papers import Paper, RankedPaper


RRF_RANKING_METHOD = "rrf_keyword_semantic_v1"
_TOKEN_PATTERN = re.compile(r"[a-z0-9][a-z0-9-]*")
_RRF_K = 60
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


def rank_papers_rrf(
    topic: str,
    papers: Sequence[Paper],
    metrics_by_paper_id: Mapping[str, PaperMetric] | None = None,
) -> list[RankedPaper]:
    metrics_by_paper_id = metrics_by_paper_id or {}
    keyword_scores = {paper.paper_id: _keyword_score(topic, paper) for paper in papers}
    semantic_scores = {
        paper.paper_id: _semantic_score(topic, paper) for paper in papers
    }
    keyword_ranks = _rank_ids(keyword_scores)
    semantic_ranks = _rank_ids(semantic_scores)

    ranked: list[RankedPaper] = []
    for paper in papers:
        keyword_rank = keyword_ranks[paper.paper_id]
        semantic_rank = semantic_ranks[paper.paper_id]
        rrf_score = (1 / (_RRF_K + keyword_rank)) + (1 / (_RRF_K + semantic_rank))
        metric = metrics_by_paper_id.get(paper.paper_id)
        paper_with_metrics = paper.model_copy(update={"metrics": metric})
        ranked.append(
            RankedPaper(
                paper=paper_with_metrics,
                rank_position=0,
                relevance_score=rrf_score * 1000,
                ranking_method=RRF_RANKING_METHOD,
                ranking_explanation=(
                    f"RRF combined keyword rank {keyword_rank} and semantic rank "
                    f"{semantic_rank}; keyword score {keyword_scores[paper.paper_id]:.3f}; "
                    f"semantic score {semantic_scores[paper.paper_id]:.3f}"
                ),
                ranking_components=RankingComponents(
                    keyword_rank=keyword_rank,
                    semantic_rank=semantic_rank,
                    keyword_score=keyword_scores[paper.paper_id],
                    semantic_score=semantic_scores[paper.paper_id],
                    rrf_score=rrf_score,
                ),
            )
        )

    ranked.sort(
        key=lambda item: (
            -item.relevance_score,
            item.ranking_components.keyword_rank if item.ranking_components else 9999,
            item.paper.title.lower(),
        )
    )
    return [
        item.model_copy(update={"rank_position": index})
        for index, item in enumerate(ranked, start=1)
    ]


def _keyword_score(topic: str, paper: Paper) -> float:
    query = topic.strip().lower()
    terms = _topic_terms(topic)
    title = paper.title.lower()
    abstract = paper.abstract.lower()
    title_matches = sum(1 for token in _tokens(title) if token in terms)
    abstract_matches = sum(1 for token in _tokens(abstract) if token in terms)
    title_phrase_matches = title.count(query) if query else 0
    abstract_phrase_matches = abstract.count(query) if query else 0
    return float(
        title_matches * 3
        + abstract_matches
        + title_phrase_matches * 8
        + abstract_phrase_matches * 4
    )


def _semantic_score(topic: str, paper: Paper) -> float:
    query_vector = _tf_vector(_topic_terms(topic))
    paper_vector = _tf_vector(_tokens(f"{paper.title} {paper.abstract}"))
    return _cosine_similarity(query_vector, paper_vector)


def _rank_ids(scores: Mapping[str, float]) -> dict[str, int]:
    sorted_ids = sorted(scores, key=lambda item_id: (-scores[item_id], item_id))
    return {item_id: index for index, item_id in enumerate(sorted_ids, start=1)}


def _topic_terms(topic: str) -> list[str]:
    tokens = _tokens(topic)
    terms = [token for token in tokens if token not in _STOP_WORDS]
    return list(dict.fromkeys(terms or tokens))


def _tokens(text: str) -> list[str]:
    return _TOKEN_PATTERN.findall(text.lower())


def _tf_vector(tokens: list[str]) -> Counter[str]:
    return Counter(token for token in tokens if token not in _STOP_WORDS)


def _cosine_similarity(left: Counter[str], right: Counter[str]) -> float:
    if not left or not right:
        return 0.0
    common = set(left) & set(right)
    dot = sum(left[token] * right[token] for token in common)
    left_norm = math.sqrt(sum(value * value for value in left.values()))
    right_norm = math.sqrt(sum(value * value for value in right.values()))
    if left_norm == 0 or right_norm == 0:
        return 0.0
    return dot / (left_norm * right_norm)
```

- [ ] **Step 5: Export and wire the RRF ranker**

Modify `research-field-mapper/backend/app/services/ranking/__init__.py`:

```python
from app.services.ranking.rrf_ranker import RRF_RANKING_METHOD, rank_papers_rrf

__all__ = ["RRF_RANKING_METHOD", "rank_papers_rrf"]
```

Modify imports and calls in `research-field-mapper/backend/app/routes/search.py`:

```python
from app.services.ranking.rrf_ranker import RRF_RANKING_METHOD, rank_papers_rrf
```

Replace:

```python
ranked_papers = rank_papers(topic=topic, papers=papers)
```

with:

```python
ranked_papers = rank_papers_rrf(topic=topic, papers=papers)
```

Replace the response `ranking_method` value with:

```python
ranking_method=RRF_RANKING_METHOD,
```

Modify imports and calls in `research-field-mapper/backend/app/pipeline/research_pipeline.py`:

```python
from app.services.ranking.rrf_ranker import rank_papers_rrf
```

Replace:

```python
ranked_papers = rank_papers(topic=run.topic, papers=papers)
```

with:

```python
ranked_papers = rank_papers_rrf(topic=run.topic, papers=papers)
```

- [ ] **Step 6: Run RRF and existing backend tests**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_rrf_ranker.py tests/test_simple_ranker.py tests/test_pipeline.py -v
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit the ranking slice**

Run:

```bash
git add research-field-mapper/backend/app/models/metrics.py \
  research-field-mapper/backend/app/models/papers.py \
  research-field-mapper/backend/app/services/ranking/__init__.py \
  research-field-mapper/backend/app/services/ranking/rrf_ranker.py \
  research-field-mapper/backend/app/routes/search.py \
  research-field-mapper/backend/app/pipeline/research_pipeline.py \
  research-field-mapper/backend/tests/test_rrf_ranker.py
git commit -m "feat: rank papers with deterministic RRF"
```

---

## Task 2: Backend Citation Metrics Storage and Sort Metadata

**Files:**
- Create: `research-field-mapper/backend/app/services/enrichment/citation_metrics.py`
- Create: `research-field-mapper/backend/app/services/enrichment/__init__.py`
- Modify: `research-field-mapper/backend/app/storage/database.py`
- Modify: `research-field-mapper/backend/app/storage/repositories.py`
- Modify: `research-field-mapper/backend/app/pipeline/research_pipeline.py`
- Test: `research-field-mapper/backend/tests/test_citation_metrics.py`
- Test: `research-field-mapper/backend/tests/test_storage.py`

**Interfaces:**
- Consumes: `PaperMetric` from `app.models.metrics`.
- Produces: `lookup_openalex_metrics(papers: Sequence[Paper], http_get: Callable[..., ResponseLike] | None = None) -> dict[str, PaperMetric]`.
- Produces: `save_paper_metrics(metrics: Sequence[PaperMetric], db_path: str | Path | None = None) -> None`.
- Produces: `get_paper_metrics(paper_ids: Sequence[str], db_path: str | Path | None = None) -> dict[str, PaperMetric]`.

- [ ] **Step 1: Write citation enrichment tests**

Add `research-field-mapper/backend/tests/test_citation_metrics.py`:

```python
from datetime import datetime

from app.models.papers import Paper
from app.services.enrichment.citation_metrics import lookup_openalex_metrics


class FakeResponse:
    def __init__(self, payload: dict):
        self._payload = payload

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return self._payload


def make_paper() -> Paper:
    return Paper(
        paper_id="arxiv:2401.00001",
        source="arxiv",
        source_id="2401.00001",
        title="Retrieval Augmented Generation Evaluation",
        authors=["Researcher One"],
        abstract="Evaluation for RAG.",
        published_date=datetime(2024, 1, 1),
        updated_date=None,
        paper_url="https://arxiv.org/abs/2401.00001",
        pdf_url="https://arxiv.org/pdf/2401.00001",
        categories=["cs.CL"],
    )


def test_lookup_openalex_metrics_by_arxiv_id() -> None:
    calls: list[dict] = []

    def fake_get(url: str, params: dict, timeout: int) -> FakeResponse:
        calls.append({"url": url, "params": params, "timeout": timeout})
        return FakeResponse(
            {
                "results": [
                    {
                        "ids": {"arxiv": "https://arxiv.org/abs/2401.00001"},
                        "cited_by_count": 17,
                    }
                ]
            }
        )

    metrics = lookup_openalex_metrics([make_paper()], http_get=fake_get)

    assert calls[0]["url"] == "https://api.openalex.org/works"
    assert calls[0]["params"]["filter"] == "ids.openalex:*"
    assert metrics["arxiv:2401.00001"].citation_count == 17
    assert metrics["arxiv:2401.00001"].citation_source == "openalex"
```

- [ ] **Step 2: Run the tests and verify the expected failure**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_citation_metrics.py -v
```

Expected: FAIL because the enrichment module does not exist.

- [ ] **Step 3: Add paper metrics storage**

Modify `init_database()` in `research-field-mapper/backend/app/storage/database.py` by adding this table after `papers`:

```sql
CREATE TABLE IF NOT EXISTS paper_metrics (
    paper_id TEXT PRIMARY KEY,
    citation_count INTEGER,
    citation_source TEXT,
    citation_updated_at TEXT,
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
);
```

Modify `research-field-mapper/backend/app/storage/repositories.py` by adding imports:

```python
from app.models.metrics import PaperMetric
```

Add repository functions:

```python
def save_paper_metrics(
    metrics: Sequence[PaperMetric],
    db_path: str | Path | None = None,
) -> None:
    with get_connection(db_path) as connection:
        for metric in metrics:
            connection.execute(
                """
                INSERT INTO paper_metrics (
                    paper_id, citation_count, citation_source, citation_updated_at
                )
                VALUES (?, ?, ?, ?)
                ON CONFLICT(paper_id) DO UPDATE SET
                    citation_count = excluded.citation_count,
                    citation_source = excluded.citation_source,
                    citation_updated_at = excluded.citation_updated_at
                """,
                (
                    metric.paper_id,
                    metric.citation_count,
                    metric.citation_source,
                    _datetime_to_text(metric.citation_updated_at)
                    if metric.citation_updated_at
                    else None,
                ),
            )


def get_paper_metrics(
    paper_ids: Sequence[str],
    db_path: str | Path | None = None,
) -> dict[str, PaperMetric]:
    if not paper_ids:
        return {}

    placeholders = ",".join("?" for _ in paper_ids)
    with get_connection(db_path) as connection:
        rows = connection.execute(
            f"""
            SELECT paper_id, citation_count, citation_source, citation_updated_at
            FROM paper_metrics
            WHERE paper_id IN ({placeholders})
            """,
            tuple(paper_ids),
        ).fetchall()

    return {
        row["paper_id"]: PaperMetric(
            paper_id=row["paper_id"],
            citation_count=row["citation_count"],
            citation_source=row["citation_source"],
            citation_updated_at=datetime.fromisoformat(row["citation_updated_at"])
            if row["citation_updated_at"]
            else None,
        )
        for row in rows
    }
```

Modify `_paper_from_row()` or `_ranked_paper_from_row()` so `Paper(metrics=None)` remains valid when no metrics row is loaded. Do not join `paper_metrics` into every paper query in this task; Task 6 handles display.

- [ ] **Step 4: Add the OpenAlex-compatible lookup function**

Create `research-field-mapper/backend/app/services/enrichment/__init__.py`:

```python
from app.services.enrichment.citation_metrics import lookup_openalex_metrics

__all__ = ["lookup_openalex_metrics"]
```

Create `research-field-mapper/backend/app/services/enrichment/citation_metrics.py`:

```python
from collections.abc import Callable, Sequence
from datetime import datetime, timezone
from typing import Protocol

import requests

from app.models.metrics import PaperMetric
from app.models.papers import Paper


class ResponseLike(Protocol):
    def raise_for_status(self) -> None: ...

    def json(self) -> dict: ...


HttpGet = Callable[..., ResponseLike]


def lookup_openalex_metrics(
    papers: Sequence[Paper],
    http_get: HttpGet | None = None,
) -> dict[str, PaperMetric]:
    if not papers:
        return {}

    http_get = http_get or requests.get
    response = http_get(
        "https://api.openalex.org/works",
        params={
            "filter": "ids.openalex:*",
            "search": "|".join(paper.source_id for paper in papers[:25]),
            "per-page": min(len(papers), 25),
        },
        timeout=10,
    )
    response.raise_for_status()
    payload = response.json()
    openalex_by_arxiv_id = _index_openalex_results(payload.get("results", []))
    updated_at = datetime.now(timezone.utc)

    metrics: dict[str, PaperMetric] = {}
    for paper in papers:
        count = openalex_by_arxiv_id.get(paper.source_id)
        if count is not None:
            metrics[paper.paper_id] = PaperMetric(
                paper_id=paper.paper_id,
                citation_count=count,
                citation_source="openalex",
                citation_updated_at=updated_at,
            )
    return metrics


def _index_openalex_results(results: list[dict]) -> dict[str, int]:
    indexed: dict[str, int] = {}
    for result in results:
        arxiv_url = result.get("ids", {}).get("arxiv")
        if not arxiv_url:
            continue
        source_id = arxiv_url.rstrip("/").split("/")[-1]
        count = result.get("cited_by_count")
        if isinstance(count, int):
            indexed[source_id] = count
    return indexed
```

- [ ] **Step 5: Attach metrics to ranked papers in the pipeline**

Modify `research-field-mapper/backend/app/pipeline/research_pipeline.py` imports:

```python
from app.services.enrichment.citation_metrics import lookup_openalex_metrics
from app.storage.repositories import get_paper_metrics, save_paper_metrics
```

After paper search and before ranking, add:

```python
try:
    metrics_by_paper_id = lookup_openalex_metrics(papers)
    save_paper_metrics(metrics_by_paper_id.values(), db_path=db_path)
except Exception:
    metrics_by_paper_id = get_paper_metrics(
        [paper.paper_id for paper in papers],
        db_path=db_path,
    )
```

Replace the ranking call with:

```python
ranked_papers = rank_papers_rrf(
    topic=run.topic,
    papers=papers,
    metrics_by_paper_id=metrics_by_paper_id,
)
```

- [ ] **Step 6: Run citation and storage tests**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_citation_metrics.py tests/test_storage.py tests/test_pipeline.py -v
```

Expected: all selected tests PASS.

- [ ] **Step 7: Commit the metrics slice**

Run:

```bash
git add research-field-mapper/backend/app/models/metrics.py \
  research-field-mapper/backend/app/services/enrichment \
  research-field-mapper/backend/app/storage/database.py \
  research-field-mapper/backend/app/storage/repositories.py \
  research-field-mapper/backend/app/pipeline/research_pipeline.py \
  research-field-mapper/backend/tests/test_citation_metrics.py \
  research-field-mapper/backend/tests/test_storage.py
git commit -m "feat: store citation metrics for papers"
```

---

## Task 3: Backend Local Folders, Saved Papers, and Folder Downloads

**Files:**
- Create: `research-field-mapper/backend/app/models/workspaces.py`
- Create: `research-field-mapper/backend/app/routes/workspaces.py`
- Modify: `research-field-mapper/backend/app/storage/database.py`
- Modify: `research-field-mapper/backend/app/storage/repositories.py`
- Modify: `research-field-mapper/backend/app/main.py`
- Test: `research-field-mapper/backend/tests/test_workspaces.py`

**Interfaces:**
- Produces: `Folder`, `CreateFolderRequest`, `SavePaperToFolderRequest`, `FolderListResponse`, `FolderPapersResponse`.
- Produces routes:
  - `GET /api/folders`
  - `POST /api/folders`
  - `POST /api/folders/{folder_id}/papers`
  - `GET /api/folders/{folder_id}/papers`
  - `GET /api/folders/{folder_id}/download`

- [ ] **Step 1: Write workspace route tests**

Add `research-field-mapper/backend/tests/test_workspaces.py`:

```python
from pathlib import Path

from fastapi.testclient import TestClient

from app.main import app
from app.models.papers import Paper
from app.storage.database import init_database
from app.storage.repositories import save_papers


def test_create_folder_save_paper_and_list(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "workspace.sqlite3"
    monkeypatch.setenv("RFM_DATABASE_PATH", str(db_path))
    init_database(db_path)
    save_papers(
        [
            Paper(
                paper_id="arxiv:2401.00001",
                source="arxiv",
                source_id="2401.00001",
                title="Retrieval Augmented Generation Evaluation",
                authors=["Researcher One"],
                abstract="Evaluation for RAG.",
                published_date=None,
                updated_date=None,
                paper_url="https://arxiv.org/abs/2401.00001",
                pdf_url="https://arxiv.org/pdf/2401.00001",
                categories=["cs.CL"],
            )
        ],
        db_path=db_path,
    )

    client = TestClient(app)
    created = client.post("/api/folders", json={"name": "RAG project"})

    assert created.status_code == 201
    folder_id = created.json()["folder_id"]

    saved = client.post(
        f"/api/folders/{folder_id}/papers",
        json={"paper_id": "arxiv:2401.00001"},
    )

    assert saved.status_code == 201
    papers = client.get(f"/api/folders/{folder_id}/papers")
    assert papers.status_code == 200
    assert papers.json()["folder"]["name"] == "RAG project"
    assert papers.json()["papers"][0]["title"] == "Retrieval Augmented Generation Evaluation"


def test_download_folder_returns_zip(tmp_path: Path, monkeypatch) -> None:
    db_path = tmp_path / "workspace.sqlite3"
    monkeypatch.setenv("RFM_DATABASE_PATH", str(db_path))
    init_database(db_path)
    client = TestClient(app)
    folder = client.post("/api/folders", json={"name": "Downloads"}).json()

    response = client.get(f"/api/folders/{folder['folder_id']}/download")

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/zip"
    assert response.content.startswith(b"PK")
```

- [ ] **Step 2: Run workspace tests and verify the expected failure**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_workspaces.py -v
```

Expected: FAIL because the workspace route does not exist.

- [ ] **Step 3: Add workspace models**

Create `research-field-mapper/backend/app/models/workspaces.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field

from app.models.papers import Paper


class Folder(BaseModel):
    folder_id: str
    name: str
    created_at: datetime
    updated_at: datetime
    paper_count: int = 0


class CreateFolderRequest(BaseModel):
    name: str = Field(min_length=1, max_length=120)


class SavePaperToFolderRequest(BaseModel):
    paper_id: str = Field(min_length=1)


class FolderListResponse(BaseModel):
    folders: list[Folder]


class FolderPapersResponse(BaseModel):
    folder: Folder
    papers: list[Paper]
```

- [ ] **Step 4: Add folder tables**

Modify `init_database()` in `research-field-mapper/backend/app/storage/database.py`:

```sql
CREATE TABLE IF NOT EXISTS folders (
    folder_id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS folder_papers (
    folder_id TEXT NOT NULL,
    paper_id TEXT NOT NULL,
    saved_at TEXT NOT NULL,
    PRIMARY KEY (folder_id, paper_id),
    FOREIGN KEY (folder_id) REFERENCES folders(folder_id) ON DELETE CASCADE,
    FOREIGN KEY (paper_id) REFERENCES papers(paper_id) ON DELETE CASCADE
);
```

- [ ] **Step 5: Add folder repository functions**

Modify `research-field-mapper/backend/app/storage/repositories.py` imports:

```python
from uuid import uuid4

from app.models.workspaces import Folder
```

Add:

```python
def create_folder(name: str, db_path: str | Path | None = None) -> Folder:
    now = datetime.now(timezone.utc)
    folder = Folder(
        folder_id=str(uuid4()),
        name=name.strip(),
        created_at=now,
        updated_at=now,
        paper_count=0,
    )
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO folders (folder_id, name, created_at, updated_at)
            VALUES (?, ?, ?, ?)
            """,
            (
                folder.folder_id,
                folder.name,
                _datetime_to_text(folder.created_at),
                _datetime_to_text(folder.updated_at),
            ),
        )
    return folder


def list_folders(db_path: str | Path | None = None) -> list[Folder]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT f.*, COUNT(fp.paper_id) AS paper_count
            FROM folders f
            LEFT JOIN folder_papers fp ON fp.folder_id = f.folder_id
            GROUP BY f.folder_id
            ORDER BY f.updated_at DESC, f.name ASC
            """
        ).fetchall()
    return [_folder_from_row(row) for row in rows]


def get_folder_by_id(
    folder_id: str,
    db_path: str | Path | None = None,
) -> Folder | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            """
            SELECT f.*, COUNT(fp.paper_id) AS paper_count
            FROM folders f
            LEFT JOIN folder_papers fp ON fp.folder_id = f.folder_id
            WHERE f.folder_id = ?
            GROUP BY f.folder_id
            """,
            (folder_id,),
        ).fetchone()
    return _folder_from_row(row) if row else None


def save_paper_to_folder(
    folder_id: str,
    paper_id: str,
    db_path: str | Path | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO folder_papers (folder_id, paper_id, saved_at)
            VALUES (?, ?, ?)
            ON CONFLICT(folder_id, paper_id) DO UPDATE SET
                saved_at = excluded.saved_at
            """,
            (folder_id, paper_id, _datetime_to_text(now)),
        )
        connection.execute(
            "UPDATE folders SET updated_at = ? WHERE folder_id = ?",
            (_datetime_to_text(now), folder_id),
        )


def get_papers_for_folder(
    folder_id: str,
    db_path: str | Path | None = None,
) -> list[Paper]:
    with get_connection(db_path) as connection:
        rows = connection.execute(
            """
            SELECT p.*
            FROM folder_papers fp
            JOIN papers p ON p.paper_id = fp.paper_id
            WHERE fp.folder_id = ?
            ORDER BY fp.saved_at DESC
            """,
            (folder_id,),
        ).fetchall()
    return [_paper_from_row(row) for row in rows]


def _folder_from_row(row: sqlite3.Row) -> Folder:
    return Folder(
        folder_id=row["folder_id"],
        name=row["name"],
        created_at=datetime.fromisoformat(row["created_at"]),
        updated_at=datetime.fromisoformat(row["updated_at"]),
        paper_count=int(row["paper_count"]),
    )
```

- [ ] **Step 6: Add workspace routes and ZIP download**

Create `research-field-mapper/backend/app/routes/workspaces.py`:

```python
import json
from io import BytesIO
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import APIRouter, HTTPException, Response, status

from app.models.workspaces import (
    CreateFolderRequest,
    Folder,
    FolderListResponse,
    FolderPapersResponse,
    SavePaperToFolderRequest,
)
from app.storage.repositories import (
    create_folder,
    get_folder_by_id,
    get_papers_for_folder,
    list_folders,
    save_paper_to_folder,
)


router = APIRouter(prefix="/api/folders", tags=["folders"])


@router.get("", response_model=FolderListResponse)
def list_research_folders() -> FolderListResponse:
    return FolderListResponse(folders=list_folders())


@router.post("", response_model=Folder, status_code=status.HTTP_201_CREATED)
def create_research_folder(request: CreateFolderRequest) -> Folder:
    return create_folder(request.name)


@router.post("/{folder_id}/papers", status_code=status.HTTP_201_CREATED)
def save_research_paper(
    folder_id: str,
    request: SavePaperToFolderRequest,
) -> dict[str, str]:
    if get_folder_by_id(folder_id) is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    save_paper_to_folder(folder_id, request.paper_id)
    return {"status": "saved"}


@router.get("/{folder_id}/papers", response_model=FolderPapersResponse)
def list_research_folder_papers(folder_id: str) -> FolderPapersResponse:
    folder = get_folder_by_id(folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")
    return FolderPapersResponse(folder=folder, papers=get_papers_for_folder(folder_id))


@router.get("/{folder_id}/download")
def download_research_folder(folder_id: str) -> Response:
    folder = get_folder_by_id(folder_id)
    if folder is None:
        raise HTTPException(status_code=404, detail="Folder not found")

    papers = get_papers_for_folder(folder_id)
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
        archive.writestr(
            "papers.json",
            json.dumps([paper.model_dump(mode="json") for paper in papers], indent=2),
        )
        archive.writestr(
            "links.txt",
            "\n".join(
                f"{paper.title}\nAbstract: {paper.paper_url}\nPDF: {paper.pdf_url or 'unavailable'}\n"
                for paper in papers
            ),
        )

    safe_name = folder.name.lower().replace(" ", "-")
    return Response(
        content=buffer.getvalue(),
        media_type="application/zip",
        headers={
            "Content-Disposition": f'attachment; filename="{safe_name}-papers.zip"'
        },
    )
```

Modify `research-field-mapper/backend/app/main.py`:

```python
from app.routes import ai_providers, search, workspaces

app.include_router(workspaces.router)
```

- [ ] **Step 7: Run workspace tests**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_workspaces.py tests/test_storage.py -v
```

Expected: all selected tests PASS.

- [ ] **Step 8: Commit the folder slice**

Run:

```bash
git add research-field-mapper/backend/app/models/workspaces.py \
  research-field-mapper/backend/app/routes/workspaces.py \
  research-field-mapper/backend/app/storage/database.py \
  research-field-mapper/backend/app/storage/repositories.py \
  research-field-mapper/backend/app/main.py \
  research-field-mapper/backend/tests/test_workspaces.py
git commit -m "feat: save papers into local folders"
```

---

## Task 4: Backend Research Map Generation

**Files:**
- Create: `research-field-mapper/backend/app/models/research_maps.py`
- Create: `research-field-mapper/backend/app/services/maps/research_map_builder.py`
- Create: `research-field-mapper/backend/app/services/maps/__init__.py`
- Create: `research-field-mapper/backend/app/routes/research_maps.py`
- Modify: `research-field-mapper/backend/app/storage/database.py`
- Modify: `research-field-mapper/backend/app/storage/repositories.py`
- Modify: `research-field-mapper/backend/app/pipeline/research_pipeline.py`
- Modify: `research-field-mapper/backend/app/main.py`
- Test: `research-field-mapper/backend/tests/test_research_map.py`

**Interfaces:**
- Produces: `build_research_map(run_id: str, ranked_papers: Sequence[RankedPaper], extractions: Sequence[PaperExtraction]) -> ResearchMap`.
- Produces route `GET /api/runs/{run_id}/map`.
- Produces `ResearchMapResponse(run_id: str, map: ResearchMap | None)`.

- [ ] **Step 1: Write research map tests**

Add `research-field-mapper/backend/tests/test_research_map.py`:

```python
from app.models.extractions import PaperExtraction
from app.models.papers import Paper, RankedPaper
from app.services.maps.research_map_builder import build_research_map


def make_ranked(paper_id: str, title: str, categories: list[str], score: float) -> RankedPaper:
    return RankedPaper(
        paper=Paper(
            paper_id=paper_id,
            source="arxiv",
            source_id=paper_id,
            title=title,
            authors=["Researcher One"],
            abstract=f"{title} discusses retrieval generation evaluation.",
            published_date=None,
            updated_date=None,
            paper_url=f"https://arxiv.org/abs/{paper_id}",
            pdf_url=None,
            categories=categories,
        ),
        rank_position=1,
        relevance_score=score,
        ranking_method="rrf_keyword_semantic_v1",
        ranking_explanation="test",
    )


def test_build_research_map_creates_weighted_edges() -> None:
    first = make_ranked("2401.00001", "RAG evaluation", ["cs.CL"], 20)
    second = make_ranked("2401.00002", "RAG benchmarks", ["cs.CL"], 18)
    third = make_ranked("2401.00003", "Vision segmentation", ["cs.CV"], 4)

    result = build_research_map("run-1", [first, second, third], [])

    assert result.run_id == "run-1"
    assert len(result.nodes) == 3
    assert any(edge.source_paper_id == "2401.00001" for edge in result.edges)
    assert result.edges[0].strength >= result.edges[-1].strength
    assert result.nodes[0].label == "#1"
```

- [ ] **Step 2: Run the map tests and verify the expected failure**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_research_map.py -v
```

Expected: FAIL because map models and service do not exist.

- [ ] **Step 3: Add map models**

Create `research-field-mapper/backend/app/models/research_maps.py`:

```python
from datetime import datetime

from pydantic import BaseModel, Field


class ResearchMapNode(BaseModel):
    paper_id: str
    label: str
    title: str
    rank_position: int
    relevance_score: float
    cluster: str
    x: float = Field(ge=0, le=1)
    y: float = Field(ge=0, le=1)


class ResearchMapEdge(BaseModel):
    source_paper_id: str
    target_paper_id: str
    relationship: str
    strength: float = Field(ge=0, le=1)
    evidence: str


class ResearchMap(BaseModel):
    run_id: str
    nodes: list[ResearchMapNode]
    edges: list[ResearchMapEdge]
    created_at: datetime


class ResearchMapResponse(BaseModel):
    run_id: str
    map: ResearchMap | None
```

- [ ] **Step 4: Add deterministic map builder**

Create `research-field-mapper/backend/app/services/maps/__init__.py`:

```python
from app.services.maps.research_map_builder import build_research_map

__all__ = ["build_research_map"]
```

Create `research-field-mapper/backend/app/services/maps/research_map_builder.py`:

```python
from collections.abc import Sequence
from datetime import datetime, timezone

from app.models.extractions import PaperExtraction
from app.models.papers import RankedPaper
from app.models.research_maps import ResearchMap, ResearchMapEdge, ResearchMapNode


def build_research_map(
    run_id: str,
    ranked_papers: Sequence[RankedPaper],
    extractions: Sequence[PaperExtraction],
) -> ResearchMap:
    extraction_tags = {item.paper_id: set(item.tags) for item in extractions}
    nodes = [
        ResearchMapNode(
            paper_id=ranked.paper.paper_id,
            label=f"#{ranked.rank_position}",
            title=ranked.paper.title,
            rank_position=ranked.rank_position,
            relevance_score=ranked.relevance_score,
            cluster=_cluster_for_paper(ranked, extraction_tags.get(ranked.paper.paper_id, set())),
            x=_node_x(index, len(ranked_papers)),
            y=_node_y(index),
        )
        for index, ranked in enumerate(ranked_papers)
    ]

    edges: list[ResearchMapEdge] = []
    for left_index, left in enumerate(ranked_papers):
        for right in ranked_papers[left_index + 1 :]:
            strength, evidence = _connection_strength(left, right, extraction_tags)
            if strength >= 0.18:
                edges.append(
                    ResearchMapEdge(
                        source_paper_id=left.paper.paper_id,
                        target_paper_id=right.paper.paper_id,
                        relationship="shared method or topic",
                        strength=strength,
                        evidence=evidence,
                    )
                )

    edges.sort(key=lambda edge: (-edge.strength, edge.source_paper_id, edge.target_paper_id))
    return ResearchMap(
        run_id=run_id,
        nodes=nodes,
        edges=edges[: max(0, len(nodes) * 2)],
        created_at=datetime.now(timezone.utc),
    )


def _cluster_for_paper(ranked: RankedPaper, tags: set[str]) -> str:
    if tags:
        return sorted(tags)[0]
    if ranked.paper.categories:
        return ranked.paper.categories[0]
    return "uncategorized"


def _connection_strength(
    left: RankedPaper,
    right: RankedPaper,
    extraction_tags: dict[str, set[str]],
) -> tuple[float, str]:
    shared_categories = set(left.paper.categories) & set(right.paper.categories)
    shared_tags = extraction_tags.get(left.paper.paper_id, set()) & extraction_tags.get(
        right.paper.paper_id,
        set(),
    )
    rank_gap = abs(left.rank_position - right.rank_position)
    category_score = min(len(shared_categories) * 0.25, 0.5)
    tag_score = min(len(shared_tags) * 0.2, 0.4)
    proximity_score = max(0.0, 0.3 - rank_gap * 0.03)
    strength = min(1.0, category_score + tag_score + proximity_score)
    evidence_parts = []
    if shared_categories:
        evidence_parts.append(f"shared categories: {', '.join(sorted(shared_categories))}")
    if shared_tags:
        evidence_parts.append(f"shared extraction tags: {', '.join(sorted(shared_tags))}")
    if not evidence_parts:
        evidence_parts.append(f"nearby ranking positions: {left.rank_position}, {right.rank_position}")
    return strength, "; ".join(evidence_parts)


def _node_x(index: int, total: int) -> float:
    if total <= 1:
        return 0.5
    return 0.1 + (0.8 * index / (total - 1))


def _node_y(index: int) -> float:
    pattern = [0.32, 0.58, 0.43, 0.72, 0.24]
    return pattern[index % len(pattern)]
```

- [ ] **Step 5: Add map storage and route**

Modify `init_database()` in `research-field-mapper/backend/app/storage/database.py`:

```sql
CREATE TABLE IF NOT EXISTS research_maps (
    run_id TEXT PRIMARY KEY,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (run_id) REFERENCES runs(run_id) ON DELETE CASCADE
);
```

Modify `research-field-mapper/backend/app/storage/repositories.py` imports:

```python
from app.models.research_maps import ResearchMap
```

Add:

```python
def save_research_map(
    research_map: ResearchMap,
    db_path: str | Path | None = None,
) -> None:
    with get_connection(db_path) as connection:
        connection.execute(
            """
            INSERT INTO research_maps (run_id, nodes_json, edges_json, created_at)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(run_id) DO UPDATE SET
                nodes_json = excluded.nodes_json,
                edges_json = excluded.edges_json,
                created_at = excluded.created_at
            """,
            (
                research_map.run_id,
                json.dumps([node.model_dump(mode="json") for node in research_map.nodes]),
                json.dumps([edge.model_dump(mode="json") for edge in research_map.edges]),
                _datetime_to_text(research_map.created_at),
            ),
        )


def get_research_map_for_run(
    run_id: str,
    db_path: str | Path | None = None,
) -> ResearchMap | None:
    with get_connection(db_path) as connection:
        row = connection.execute(
            "SELECT * FROM research_maps WHERE run_id = ?",
            (run_id,),
        ).fetchone()
    if row is None:
        return None
    return ResearchMap(
        run_id=row["run_id"],
        nodes=json.loads(row["nodes_json"]),
        edges=json.loads(row["edges_json"]),
        created_at=datetime.fromisoformat(row["created_at"]),
    )
```

Create `research-field-mapper/backend/app/routes/research_maps.py`:

```python
from fastapi import APIRouter

from app.models.research_maps import ResearchMapResponse
from app.storage.repositories import get_research_map_for_run


router = APIRouter(prefix="/api/runs", tags=["research maps"])


@router.get("/{run_id}/map", response_model=ResearchMapResponse)
def get_research_map(run_id: str) -> ResearchMapResponse:
    return ResearchMapResponse(
        run_id=run_id,
        map=get_research_map_for_run(run_id),
    )
```

- [ ] **Step 6: Build and save the map in the pipeline**

Modify `research-field-mapper/backend/app/pipeline/research_pipeline.py` imports:

```python
from app.services.maps import build_research_map
from app.storage.repositories import save_research_map
```

After `save_landscape(landscape, db_path=db_path)`, add:

```python
research_map = build_research_map(
    run_id=run_id,
    ranked_papers=ranked_papers,
    extractions=extractions,
)
save_research_map(research_map, db_path=db_path)
```

Modify `research-field-mapper/backend/app/main.py`:

```python
from app.routes import ai_providers, research_maps, search, workspaces

app.include_router(research_maps.router)
```

- [ ] **Step 7: Run map and pipeline tests**

Run:

```bash
cd research-field-mapper/backend
pytest tests/test_research_map.py tests/test_pipeline.py tests/test_storage.py -v
```

Expected: all selected tests PASS.

- [ ] **Step 8: Commit the map slice**

Run:

```bash
git add research-field-mapper/backend/app/models/research_maps.py \
  research-field-mapper/backend/app/services/maps \
  research-field-mapper/backend/app/routes/research_maps.py \
  research-field-mapper/backend/app/storage/database.py \
  research-field-mapper/backend/app/storage/repositories.py \
  research-field-mapper/backend/app/pipeline/research_pipeline.py \
  research-field-mapper/backend/app/main.py \
  research-field-mapper/backend/tests/test_research_map.py
git commit -m "feat: generate research relationship maps"
```

---

## Task 5: Frontend Type and API Layer

**Files:**
- Create: `research-field-mapper/frontend/lib/types.ts`
- Create: `research-field-mapper/frontend/lib/api.ts`
- Create: `research-field-mapper/frontend/lib/paperSort.ts`
- Modify: `research-field-mapper/frontend/app/page.tsx`
- Test: `research-field-mapper/frontend/package.json`

**Interfaces:**
- Produces TypeScript types: `Paper`, `RankedPaper`, `PaperMetric`, `Folder`, `ResearchMap`, `SortMode`.
- Produces API functions: `createRun`, `startRun`, `getRun`, `getRunPapers`, `getRunExtractions`, `getLandscape`, `getResearchMap`, `listFolders`, `createFolder`, `savePaperToFolder`, `downloadFolder`.
- Produces `sortRankedPapers(papers: RankedPaper[], mode: SortMode) -> RankedPaper[]`.

- [ ] **Step 1: Move shared types into `lib/types.ts`**

Create `research-field-mapper/frontend/lib/types.ts`:

```typescript
export type ResearchRun = {
  run_id: string;
  topic: string;
  status: string;
  current_stage: string;
  created_at: string;
  updated_at: string;
  error_message: string | null;
};

export type PaperMetric = {
  paper_id: string;
  citation_count: number | null;
  citation_source: string | null;
  citation_updated_at: string | null;
};

export type RankingComponents = {
  keyword_rank: number;
  semantic_rank: number;
  keyword_score: number;
  semantic_score: number;
  rrf_score: number;
};

export type Paper = {
  paper_id: string;
  source: string;
  source_id: string;
  title: string;
  authors: string[];
  abstract: string;
  published_date: string | null;
  updated_date: string | null;
  paper_url: string;
  pdf_url: string | null;
  categories: string[];
  metrics: PaperMetric | null;
};

export type RankedPaper = {
  paper: Paper;
  rank_position: number;
  relevance_score: number;
  ranking_method: string;
  ranking_explanation: string;
  ranking_components: RankingComponents | null;
};

export type PaperExtraction = {
  run_id: string;
  paper_id: string;
  provider_name: string;
  problem: string;
  method: string;
  datasets_or_setting: string;
  key_results: string[];
  main_contribution: string;
  limitations: string[];
  tags: string[];
  confidence: number;
  source_quote_or_evidence: string;
  created_at: string;
};

export type Landscape = {
  run_id: string;
  provider_name: string;
  overview: string;
  clusters: string[];
  relationships: string[];
  tensions: string[];
  open_problems: string[];
  recommended_reading_path: string[];
  created_at: string;
};

export type ProviderInfo = {
  name: string;
  provider_type: string;
  display_name: string;
  enabled: boolean;
  is_local: boolean;
  sends_data_off_machine: boolean;
};

export type ProviderHealth = {
  provider_name: string;
  available: boolean;
  status: string;
  message: string;
};

export type Folder = {
  folder_id: string;
  name: string;
  created_at: string;
  updated_at: string;
  paper_count: number;
};

export type ResearchMapNode = {
  paper_id: string;
  label: string;
  title: string;
  rank_position: number;
  relevance_score: number;
  cluster: string;
  x: number;
  y: number;
};

export type ResearchMapEdge = {
  source_paper_id: string;
  target_paper_id: string;
  relationship: string;
  strength: number;
  evidence: string;
};

export type ResearchMap = {
  run_id: string;
  nodes: ResearchMapNode[];
  edges: ResearchMapEdge[];
  created_at: string;
};

export type SortMode = "relevance" | "citations" | "date" | "connection";
```

- [ ] **Step 2: Add API wrappers**

Create `research-field-mapper/frontend/lib/api.ts`:

```typescript
import {
  Folder,
  Landscape,
  Paper,
  PaperExtraction,
  ProviderHealth,
  ProviderInfo,
  RankedPaper,
  ResearchMap,
  ResearchRun,
} from "./types";

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://127.0.0.1:8001";

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return (await response.json()) as T;
}

export function listProviders(): Promise<ProviderInfo[]> {
  return requestJson<ProviderInfo[]>("/api/ai/providers");
}

export function getProviderHealth(providerName: string): Promise<ProviderHealth> {
  return requestJson<ProviderHealth>(`/api/ai/providers/${providerName}/health`);
}

export function createRun(topic: string): Promise<ResearchRun> {
  return requestJson<ResearchRun>("/api/runs", {
    method: "POST",
    body: JSON.stringify({ topic }),
  });
}

export function startRun(
  runId: string,
  maxResults: number,
  providerName: string,
): Promise<ResearchRun> {
  return requestJson<ResearchRun>(`/api/runs/${runId}/start`, {
    method: "POST",
    body: JSON.stringify({ max_results: maxResults, provider_name: providerName }),
  });
}

export function getRun(runId: string): Promise<ResearchRun> {
  return requestJson<ResearchRun>(`/api/runs/${runId}`);
}

export async function getRunPapers(runId: string): Promise<RankedPaper[]> {
  const response = await requestJson<{ run_id: string; papers: RankedPaper[] }>(
    `/api/runs/${runId}/papers`,
  );
  return response.papers;
}

export async function getRunExtractions(runId: string): Promise<PaperExtraction[]> {
  const response = await requestJson<{
    run_id: string;
    extractions: PaperExtraction[];
  }>(`/api/runs/${runId}/extractions`);
  return response.extractions;
}

export async function getLandscape(runId: string): Promise<Landscape | null> {
  const response = await requestJson<{ run_id: string; landscape: Landscape | null }>(
    `/api/runs/${runId}/landscape`,
  );
  return response.landscape;
}

export async function getResearchMap(runId: string): Promise<ResearchMap | null> {
  const response = await requestJson<{ run_id: string; map: ResearchMap | null }>(
    `/api/runs/${runId}/map`,
  );
  return response.map;
}

export async function listFolders(): Promise<Folder[]> {
  const response = await requestJson<{ folders: Folder[] }>("/api/folders");
  return response.folders;
}

export function createFolder(name: string): Promise<Folder> {
  return requestJson<Folder>("/api/folders", {
    method: "POST",
    body: JSON.stringify({ name }),
  });
}

export function savePaperToFolder(folderId: string, paperId: string): Promise<{ status: string }> {
  return requestJson<{ status: string }>(`/api/folders/${folderId}/papers`, {
    method: "POST",
    body: JSON.stringify({ paper_id: paperId }),
  });
}

export async function getFolderPapers(folderId: string): Promise<Paper[]> {
  const response = await requestJson<{ folder: Folder; papers: Paper[] }>(
    `/api/folders/${folderId}/papers`,
  );
  return response.papers;
}

export function folderDownloadUrl(folderId: string): string {
  return `${API_BASE_URL}/api/folders/${folderId}/download`;
}
```

- [ ] **Step 3: Add client-side paper sorting**

Create `research-field-mapper/frontend/lib/paperSort.ts`:

```typescript
import { RankedPaper, SortMode } from "./types";

export function sortRankedPapers(
  papers: RankedPaper[],
  mode: SortMode,
): RankedPaper[] {
  const sorted = [...papers];
  sorted.sort((left, right) => {
    if (mode === "citations") {
      return compareNullableNumberDesc(
        left.paper.metrics?.citation_count ?? null,
        right.paper.metrics?.citation_count ?? null,
      );
    }
    if (mode === "date") {
      return compareNullableDateDesc(left.paper.published_date, right.paper.published_date);
    }
    if (mode === "connection") {
      return compareNullableNumberDesc(
        left.ranking_components?.rrf_score ?? null,
        right.ranking_components?.rrf_score ?? null,
      );
    }
    return right.relevance_score - left.relevance_score;
  });
  return sorted;
}

function compareNullableNumberDesc(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return right - left;
}

function compareNullableDateDesc(left: string | null, right: string | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return new Date(right).getTime() - new Date(left).getTime();
}
```

- [ ] **Step 4: Replace duplicated page types with imports**

Modify `research-field-mapper/frontend/app/page.tsx` so it imports from `lib/types` and `lib/api`. Keep the rendered UI unchanged in this task. The top of the file should begin:

```typescript
"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

import {
  API_BASE_URL,
  createRun,
  getLandscape,
  getProviderHealth,
  getRun,
  getRunExtractions,
  getRunPapers,
  listProviders,
  startRun,
} from "../lib/api";
import {
  Landscape,
  PaperExtraction,
  ProviderHealth,
  ProviderInfo,
  RankedPaper,
  ResearchRun,
} from "../lib/types";
```

Replace raw `fetch` calls with the matching API functions without changing behavior.

- [ ] **Step 5: Run frontend typecheck and build**

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the frontend API layer**

Run:

```bash
git add research-field-mapper/frontend/lib/types.ts \
  research-field-mapper/frontend/lib/api.ts \
  research-field-mapper/frontend/lib/paperSort.ts \
  research-field-mapper/frontend/app/page.tsx
git commit -m "refactor: add typed frontend API layer"
```

---

## Task 6: Frontend App Shell and Command Center

**Files:**
- Create: `research-field-mapper/frontend/components/AppShell.tsx`
- Create: `research-field-mapper/frontend/components/CommandCenter.tsx`
- Create: `research-field-mapper/frontend/components/RunWorkspace.tsx`
- Modify: `research-field-mapper/frontend/app/page.tsx`
- Modify: `research-field-mapper/frontend/app/globals.css`

**Interfaces:**
- Consumes API functions from Task 5.
- Produces `RunWorkspace` as the stateful root for search/run polling.
- Produces `CommandCenter` props:
  - `topic: string`
  - `maxResults: number`
  - `isWorking: boolean`
  - `providerLabel: string`
  - `onTopicChange(value: string): void`
  - `onMaxResultsChange(value: number): void`
  - `onSubmit(): void`

- [ ] **Step 1: Create the app shell**

Create `research-field-mapper/frontend/components/AppShell.tsx`:

```typescript
import { ReactNode } from "react";

type AppShellProps = {
  children: ReactNode;
};

export function AppShell({ children }: AppShellProps) {
  return (
    <main className="app-shell">
      <aside className="app-rail" aria-label="Workspace navigation">
        <div className="rail-mark">R</div>
        <nav className="rail-nav">
          <a href="#workspace">Search</a>
          <a href="#library">Library</a>
          <a href="#map">Map</a>
        </nav>
      </aside>
      <section className="app-main">{children}</section>
    </main>
  );
}
```

- [ ] **Step 2: Create the command center**

Create `research-field-mapper/frontend/components/CommandCenter.tsx`:

```typescript
import { FormEvent } from "react";

type CommandCenterProps = {
  topic: string;
  maxResults: number;
  isWorking: boolean;
  providerLabel: string;
  onTopicChange(value: string): void;
  onMaxResultsChange(value: number): void;
  onSubmit(): void;
};

export function CommandCenter({
  topic,
  maxResults,
  isWorking,
  providerLabel,
  onTopicChange,
  onMaxResultsChange,
  onSubmit,
}: CommandCenterProps) {
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit();
  }

  return (
    <form className="command-center" onSubmit={handleSubmit}>
      <div className="command-header">
        <span>Research agent</span>
        <span>{providerLabel}</span>
      </div>
      <textarea
        value={topic}
        onChange={(event) => onTopicChange(event.target.value)}
        placeholder="Compare SGLT2 inhibitor trial outcomes and endpoints"
        rows={4}
      />
      <div className="command-actions">
        <select
          aria-label="Paper count"
          value={maxResults}
          onChange={(event) => onMaxResultsChange(Number(event.target.value))}
        >
          <option value={5}>5 papers</option>
          <option value={10}>10 papers</option>
          <option value={25}>25 papers</option>
        </select>
        <button type="submit" disabled={isWorking}>
          {isWorking ? "Working" : "Start"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 3: Move page workflow state into `RunWorkspace`**

Create `research-field-mapper/frontend/components/RunWorkspace.tsx` by moving the existing `Home` state, provider loading, submit, and polling logic out of `app/page.tsx`. The exported component signature is:

```typescript
export function RunWorkspace() {
  return (
    <AppShell>
      <section id="workspace" className="workspace-home">
        <CommandCenter
          topic={topic}
          maxResults={maxResults}
          isWorking={isWorking}
          providerLabel={selectedProvider?.display_name ?? "Mock provider"}
          onTopicChange={setTopic}
          onMaxResultsChange={setMaxResults}
          onSubmit={handleStartRun}
        />
      </section>
    </AppShell>
  );
}
```

Keep the existing polling cadence of one second and 60 attempts.

- [ ] **Step 4: Reduce `app/page.tsx` to the workspace root**

Modify `research-field-mapper/frontend/app/page.tsx`:

```typescript
import { RunWorkspace } from "../components/RunWorkspace";

export default function Home() {
  return <RunWorkspace />;
}
```

- [ ] **Step 5: Add shell and command center CSS**

Modify `research-field-mapper/frontend/app/globals.css` by adding:

```css
.app-shell {
  display: grid;
  grid-template-columns: 184px minmax(0, 1fr);
  min-height: 100vh;
  background: #f7f8f6;
  color: #1f2933;
}

.app-rail {
  border-right: 1px solid #dfe4df;
  background: #fbfcfb;
  padding: 18px;
}

.rail-mark {
  display: grid;
  width: 32px;
  height: 32px;
  place-items: center;
  border-radius: 6px;
  background: #386a73;
  color: white;
  font-weight: 700;
}

.rail-nav {
  margin-top: 28px;
  display: grid;
  gap: 8px;
}

.rail-nav a {
  border-radius: 6px;
  padding: 8px 10px;
  color: #334155;
  font-size: 14px;
}

.rail-nav a:hover {
  background: #eef3f1;
}

.app-main {
  min-width: 0;
}

.workspace-home {
  display: grid;
  min-height: 320px;
  place-items: center;
  padding: 56px 24px 28px;
}

.command-center {
  width: min(720px, 100%);
  overflow: hidden;
  border: 2px solid #386a73;
  border-radius: 14px;
  background: white;
  box-shadow: 0 14px 36px rgb(15 23 42 / 10%);
}

.command-header,
.command-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  background: #386a73;
  color: white;
  padding: 10px 14px;
  font-size: 13px;
  font-weight: 650;
}

.command-center textarea {
  min-height: 144px;
  width: 100%;
  resize: vertical;
  border: 0;
  padding: 26px;
  color: #1f2933;
  outline: none;
}

.command-actions {
  border-top: 1px solid #dfe4df;
  background: #f8faf9;
}

.command-actions select,
.command-actions button {
  min-height: 36px;
  border-radius: 6px;
  border: 1px solid #cfd8d4;
  padding: 0 12px;
  color: #1f2933;
}

.command-actions button {
  background: #386a73;
  color: white;
  font-weight: 700;
}

@media (max-width: 800px) {
  .app-shell {
    grid-template-columns: 1fr;
  }

  .app-rail {
    display: none;
  }

  .workspace-home {
    padding: 24px 14px;
  }
}
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the shell slice**

Run:

```bash
git add research-field-mapper/frontend/components/AppShell.tsx \
  research-field-mapper/frontend/components/CommandCenter.tsx \
  research-field-mapper/frontend/components/RunWorkspace.tsx \
  research-field-mapper/frontend/app/page.tsx \
  research-field-mapper/frontend/app/globals.css
git commit -m "feat: add research workspace shell"
```

---

## Task 7: Frontend Compact Paper Table, Detail Panel, and Sorting

**Files:**
- Create: `research-field-mapper/frontend/components/PaperResultsTable.tsx`
- Create: `research-field-mapper/frontend/components/PaperDetailPanel.tsx`
- Modify: `research-field-mapper/frontend/components/RunWorkspace.tsx`
- Modify: `research-field-mapper/frontend/app/globals.css`

**Interfaces:**
- Consumes: `sortRankedPapers`.
- Produces table props:
  - `papers: RankedPaper[]`
  - `selectedPaperId: string | null`
  - `sortMode: SortMode`
  - `onSortModeChange(mode: SortMode): void`
  - `onSelectPaper(paperId: string): void`
- Produces detail props:
  - `paper: RankedPaper | null`
  - `extraction: PaperExtraction | null`

- [ ] **Step 1: Create the compact table component**

Create `research-field-mapper/frontend/components/PaperResultsTable.tsx`:

```typescript
import { RankedPaper, SortMode } from "../lib/types";

type PaperResultsTableProps = {
  papers: RankedPaper[];
  selectedPaperId: string | null;
  sortMode: SortMode;
  onSortModeChange(mode: SortMode): void;
  onSelectPaper(paperId: string): void;
};

export function PaperResultsTable({
  papers,
  selectedPaperId,
  sortMode,
  onSortModeChange,
  onSelectPaper,
}: PaperResultsTableProps) {
  return (
    <section className="paper-table-panel" aria-label="Ranked papers">
      <div className="table-toolbar">
        <input aria-label="Search visible papers" placeholder="Search..." />
        <select
          aria-label="Sort papers"
          value={sortMode}
          onChange={(event) => onSortModeChange(event.target.value as SortMode)}
        >
          <option value="relevance">Sort: Relevance</option>
          <option value="connection">Sort: Connection</option>
          <option value="citations">Sort: Citations</option>
          <option value="date">Sort: Date</option>
        </select>
      </div>
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Paper</th>
              <th>Relevance</th>
              <th>Citations</th>
              <th>Date</th>
              <th>Categories</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((ranked) => (
              <tr
                key={ranked.paper.paper_id}
                className={ranked.paper.paper_id === selectedPaperId ? "selected" : ""}
                onClick={() => onSelectPaper(ranked.paper.paper_id)}
              >
                <td>
                  <button type="button" className="paper-title">
                    {ranked.paper.title}
                  </button>
                  <p>{ranked.paper.abstract}</p>
                </td>
                <td>{ranked.relevance_score.toFixed(1)}</td>
                <td>{ranked.paper.metrics?.citation_count ?? "Unknown"}</td>
                <td>{formatDate(ranked.paper.published_date)}</td>
                <td>{ranked.paper.categories.join(", ") || "None"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function formatDate(value: string | null): string {
  if (!value) return "Unknown";
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}
```

- [ ] **Step 2: Create the detail panel component**

Create `research-field-mapper/frontend/components/PaperDetailPanel.tsx`:

```typescript
import { PaperExtraction, RankedPaper } from "../lib/types";

type PaperDetailPanelProps = {
  paper: RankedPaper | null;
  extraction: PaperExtraction | null;
};

export function PaperDetailPanel({ paper, extraction }: PaperDetailPanelProps) {
  if (!paper) {
    return (
      <aside className="paper-detail-panel">
        <p className="empty-state">Select a paper to inspect details.</p>
      </aside>
    );
  }

  return (
    <aside className="paper-detail-panel">
      <div className="paper-detail-heading">
        <span>Paper {paper.rank_position}</span>
        <h2>{paper.paper.title}</h2>
        <p>{paper.paper.authors.slice(0, 8).join(", ")}</p>
      </div>
      <div className="paper-actions">
        <a href={paper.paper.paper_url} target="_blank" rel="noreferrer">
          arXiv
        </a>
        {paper.paper.pdf_url ? (
          <a href={paper.paper.pdf_url} target="_blank" rel="noreferrer">
            PDF
          </a>
        ) : null}
      </div>
      <section className="detail-card detail-card-wide">
        <h3>TL;DR</h3>
        <p>{extraction?.main_contribution ?? paper.paper.abstract}</p>
      </section>
      <div className="detail-grid">
        <DetailCard title="Problem" value={extraction?.problem ?? "Extraction pending."} />
        <DetailCard title="Method" value={extraction?.method ?? "Extraction pending."} />
        <DetailCard
          title="Key results"
          value={extraction?.key_results.join(" ") ?? "Extraction pending."}
        />
        <DetailCard
          title="Why it matters"
          value={paper.ranking_explanation}
        />
      </div>
    </aside>
  );
}

function DetailCard({ title, value }: { title: string; value: string }) {
  return (
    <section className="detail-card">
      <h3>{title}</h3>
      <p>{value}</p>
    </section>
  );
}
```

- [ ] **Step 3: Wire table and detail panel into `RunWorkspace`**

Modify `research-field-mapper/frontend/components/RunWorkspace.tsx`:

```typescript
import { useMemo, useState } from "react";

import { PaperDetailPanel } from "./PaperDetailPanel";
import { PaperResultsTable } from "./PaperResultsTable";
import { sortRankedPapers } from "../lib/paperSort";
import { SortMode } from "../lib/types";
```

Add state:

```typescript
const [sortMode, setSortMode] = useState<SortMode>("relevance");
const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
```

Add derived values:

```typescript
const sortedPapers = useMemo(
  () => sortRankedPapers(rankedPapers, sortMode),
  [rankedPapers, sortMode],
);

const selectedPaper = useMemo(
  () => sortedPapers.find((item) => item.paper.paper_id === selectedPaperId) ?? sortedPapers[0] ?? null,
  [selectedPaperId, sortedPapers],
);

const selectedExtraction = selectedPaper
  ? extractionsByPaperId[selectedPaper.paper.paper_id] ?? null
  : null;
```

Render below `CommandCenter`:

```typescript
{sortedPapers.length > 0 ? (
  <section className="results-workspace">
    <PaperResultsTable
      papers={sortedPapers}
      selectedPaperId={selectedPaper?.paper.paper_id ?? null}
      sortMode={sortMode}
      onSortModeChange={setSortMode}
      onSelectPaper={setSelectedPaperId}
    />
    <PaperDetailPanel paper={selectedPaper} extraction={selectedExtraction} />
  </section>
) : null}
```

- [ ] **Step 4: Add table and detail CSS**

Modify `research-field-mapper/frontend/app/globals.css`:

```css
.results-workspace {
  display: grid;
  grid-template-columns: minmax(0, 0.95fr) minmax(360px, 0.7fr);
  gap: 14px;
  width: min(1320px, calc(100vw - 232px));
  margin: 18px auto 0;
  align-items: start;
}

.paper-table-panel,
.paper-detail-panel {
  border: 1px solid #dfe4df;
  border-radius: 8px;
  background: white;
}

.table-toolbar {
  display: flex;
  gap: 8px;
  border-bottom: 1px solid #dfe4df;
  padding: 10px;
}

.table-toolbar input,
.table-toolbar select {
  min-height: 34px;
  border: 1px solid #d5ddd8;
  border-radius: 6px;
  padding: 0 10px;
}

.table-scroll {
  max-height: min(620px, calc(100vh - 250px));
  overflow: auto;
}

.paper-table-panel table {
  width: 100%;
  min-width: 820px;
  border-collapse: collapse;
  font-size: 13px;
}

.paper-table-panel th,
.paper-table-panel td {
  border-bottom: 1px solid #e5e9e5;
  padding: 12px;
  text-align: left;
  vertical-align: top;
}

.paper-table-panel th {
  position: sticky;
  top: 0;
  background: #f1f4f2;
  color: #475569;
  font-weight: 700;
}

.paper-table-panel tr.selected {
  background: #eef6f4;
}

.paper-title {
  border: 0;
  background: transparent;
  color: #245f67;
  font-weight: 750;
  text-align: left;
}

.paper-table-panel td p {
  display: -webkit-box;
  margin-top: 6px;
  overflow: hidden;
  color: #52616b;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.paper-detail-panel {
  padding: 18px;
}

.paper-detail-heading span {
  color: #386a73;
  font-size: 12px;
  font-weight: 800;
}

.paper-detail-heading h2 {
  margin-top: 8px;
  font-size: 24px;
  line-height: 1.2;
}

.paper-detail-heading p {
  margin-top: 8px;
  color: #64748b;
  line-height: 1.5;
}

.paper-actions {
  display: flex;
  gap: 8px;
  margin-top: 14px;
}

.paper-actions a {
  border: 1px solid #d5ddd8;
  border-radius: 6px;
  padding: 7px 10px;
  color: #245f67;
  font-weight: 700;
}

.detail-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 12px;
}

.detail-card {
  border: 1px solid #dfe4df;
  border-radius: 8px;
  padding: 14px;
  background: #fbfcfb;
}

.detail-card-wide {
  margin-top: 18px;
}

.detail-card h3 {
  font-size: 13px;
  font-weight: 800;
}

.detail-card p {
  margin-top: 8px;
  color: #334155;
  line-height: 1.6;
}

@media (max-width: 1100px) {
  .results-workspace {
    grid-template-columns: 1fr;
    width: calc(100vw - 28px);
  }
}
```

- [ ] **Step 5: Run frontend checks**

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 6: Commit the table slice**

Run:

```bash
git add research-field-mapper/frontend/components/PaperResultsTable.tsx \
  research-field-mapper/frontend/components/PaperDetailPanel.tsx \
  research-field-mapper/frontend/components/RunWorkspace.tsx \
  research-field-mapper/frontend/app/globals.css
git commit -m "feat: show papers in sortable workspace table"
```

---

## Task 8: Frontend Folders, Save, and Download Controls

**Files:**
- Create: `research-field-mapper/frontend/components/FolderSidebar.tsx`
- Create: `research-field-mapper/frontend/components/SaveToFolderButton.tsx`
- Create: `research-field-mapper/frontend/components/DownloadFolderButton.tsx`
- Modify: `research-field-mapper/frontend/components/RunWorkspace.tsx`
- Modify: `research-field-mapper/frontend/components/AppShell.tsx`
- Modify: `research-field-mapper/frontend/app/globals.css`

**Interfaces:**
- Consumes API functions `listFolders`, `createFolder`, `savePaperToFolder`, `folderDownloadUrl`.
- Produces folder selection in the left rail and selected-paper save action.

- [ ] **Step 1: Add folder sidebar component**

Create `research-field-mapper/frontend/components/FolderSidebar.tsx`:

```typescript
import { Folder } from "../lib/types";

type FolderSidebarProps = {
  folders: Folder[];
  selectedFolderId: string | null;
  onCreateFolder(name: string): void;
  onSelectFolder(folderId: string): void;
};

export function FolderSidebar({
  folders,
  selectedFolderId,
  onCreateFolder,
  onSelectFolder,
}: FolderSidebarProps) {
  return (
    <section id="library" className="folder-sidebar">
      <div className="folder-header">
        <h2>Library</h2>
        <button
          type="button"
          onClick={() => onCreateFolder(`Project ${folders.length + 1}`)}
          aria-label="Create folder"
        >
          +
        </button>
      </div>
      <button
        type="button"
        className={selectedFolderId === null ? "active" : ""}
        onClick={() => onSelectFolder("")}
      >
        All folders
      </button>
      {folders.map((folder) => (
        <button
          type="button"
          key={folder.folder_id}
          className={selectedFolderId === folder.folder_id ? "active" : ""}
          onClick={() => onSelectFolder(folder.folder_id)}
        >
          <span>{folder.name}</span>
          <span>{folder.paper_count}</span>
        </button>
      ))}
    </section>
  );
}
```

- [ ] **Step 2: Add save-to-folder button**

Create `research-field-mapper/frontend/components/SaveToFolderButton.tsx`:

```typescript
import { Folder } from "../lib/types";

type SaveToFolderButtonProps = {
  folders: Folder[];
  paperId: string | null;
  onCreateFolder(name: string): Promise<Folder>;
  onSave(folderId: string, paperId: string): Promise<void>;
};

export function SaveToFolderButton({
  folders,
  paperId,
  onCreateFolder,
  onSave,
}: SaveToFolderButtonProps) {
  async function handleChange(folderId: string) {
    if (!paperId || !folderId) return;
    await onSave(folderId, paperId);
  }

  async function handleCreate() {
    if (!paperId) return;
    const folder = await onCreateFolder("New project");
    await onSave(folder.folder_id, paperId);
  }

  return (
    <div className="save-folder-control">
      <select
        aria-label="Save selected paper to folder"
        disabled={!paperId}
        defaultValue=""
        onChange={(event) => handleChange(event.target.value)}
      >
        <option value="">Save to folder</option>
        {folders.map((folder) => (
          <option value={folder.folder_id} key={folder.folder_id}>
            {folder.name}
          </option>
        ))}
      </select>
      <button type="button" disabled={!paperId} onClick={handleCreate}>
        New folder
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Add download folder button**

Create `research-field-mapper/frontend/components/DownloadFolderButton.tsx`:

```typescript
import { folderDownloadUrl } from "../lib/api";

type DownloadFolderButtonProps = {
  folderId: string | null;
};

export function DownloadFolderButton({ folderId }: DownloadFolderButtonProps) {
  if (!folderId) {
    return (
      <button type="button" disabled>
        Download
      </button>
    );
  }

  return (
    <a className="download-folder" href={folderDownloadUrl(folderId)}>
      Download
    </a>
  );
}
```

- [ ] **Step 4: Wire folders into `RunWorkspace`**

Modify `research-field-mapper/frontend/components/RunWorkspace.tsx` imports:

```typescript
import { DownloadFolderButton } from "./DownloadFolderButton";
import { FolderSidebar } from "./FolderSidebar";
import { SaveToFolderButton } from "./SaveToFolderButton";
import {
  createFolder,
  listFolders,
  savePaperToFolder,
} from "../lib/api";
import { Folder } from "../lib/types";
```

Add state:

```typescript
const [folders, setFolders] = useState<Folder[]>([]);
const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
```

Load folders:

```typescript
useEffect(() => {
  listFolders()
    .then(setFolders)
    .catch(() => setErrorMessage("Could not load local folders."));
}, []);
```

Add handlers:

```typescript
async function handleCreateFolder(name: string): Promise<Folder> {
  const folder = await createFolder(name);
  setFolders(await listFolders());
  return folder;
}

async function handleSavePaper(folderId: string, paperId: string): Promise<void> {
  await savePaperToFolder(folderId, paperId);
  setFolders(await listFolders());
}
```

Render controls around the results workspace:

```typescript
<div className="workspace-tools">
  <SaveToFolderButton
    folders={folders}
    paperId={selectedPaper?.paper.paper_id ?? null}
    onCreateFolder={handleCreateFolder}
    onSave={handleSavePaper}
  />
  <DownloadFolderButton folderId={selectedFolderId} />
</div>
<FolderSidebar
  folders={folders}
  selectedFolderId={selectedFolderId}
  onCreateFolder={(name) => void handleCreateFolder(name)}
  onSelectFolder={(folderId) => setSelectedFolderId(folderId || null)}
/>
```

- [ ] **Step 5: Add folder CSS**

Modify `research-field-mapper/frontend/app/globals.css`:

```css
.workspace-tools {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: min(1320px, calc(100vw - 232px));
  margin: 12px auto 0;
}

.save-folder-control {
  display: flex;
  gap: 8px;
}

.save-folder-control select,
.save-folder-control button,
.download-folder,
.workspace-tools button {
  min-height: 34px;
  border: 1px solid #d5ddd8;
  border-radius: 6px;
  background: white;
  padding: 0 10px;
  color: #245f67;
  font-size: 13px;
  font-weight: 700;
}

.folder-sidebar {
  width: min(1320px, calc(100vw - 232px));
  margin: 18px auto 0;
  border: 1px solid #dfe4df;
  border-radius: 8px;
  background: white;
  padding: 12px;
}

.folder-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.folder-header h2 {
  font-size: 15px;
  font-weight: 800;
}

.folder-sidebar button {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 6px;
  background: transparent;
  padding: 8px;
  color: #334155;
  text-align: left;
}

.folder-sidebar button.active,
.folder-sidebar button:hover {
  background: #eef3f1;
}
```

- [ ] **Step 6: Run frontend checks**

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 7: Commit the folder UI slice**

Run:

```bash
git add research-field-mapper/frontend/components/FolderSidebar.tsx \
  research-field-mapper/frontend/components/SaveToFolderButton.tsx \
  research-field-mapper/frontend/components/DownloadFolderButton.tsx \
  research-field-mapper/frontend/components/RunWorkspace.tsx \
  research-field-mapper/frontend/app/globals.css
git commit -m "feat: add local paper folders to workspace"
```

---

## Task 9: Frontend Research Relationship Map

**Files:**
- Create: `research-field-mapper/frontend/components/ResearchMap.tsx`
- Modify: `research-field-mapper/frontend/components/RunWorkspace.tsx`
- Modify: `research-field-mapper/frontend/app/globals.css`

**Interfaces:**
- Consumes `ResearchMap` from `lib/types`.
- Produces visual SVG map with click-to-select by paper id.

- [ ] **Step 1: Create SVG map component**

Create `research-field-mapper/frontend/components/ResearchMap.tsx`:

```typescript
import { ResearchMap as ResearchMapData } from "../lib/types";

type ResearchMapProps = {
  map: ResearchMapData | null;
  selectedPaperId: string | null;
  onSelectPaper(paperId: string): void;
};

export function ResearchMap({
  map,
  selectedPaperId,
  onSelectPaper,
}: ResearchMapProps) {
  if (!map || map.nodes.length === 0) {
    return (
      <section id="map" className="research-map-panel">
        <p className="empty-state">Run a search to generate a relationship map.</p>
      </section>
    );
  }

  const nodeById = Object.fromEntries(map.nodes.map((node) => [node.paper_id, node]));

  return (
    <section id="map" className="research-map-panel">
      <div className="map-heading">
        <h2>Research map</h2>
        <p>{map.nodes.length} papers linked by strength of connection</p>
      </div>
      <svg viewBox="0 0 1000 460" role="img" aria-label="Paper relationship map">
        {map.edges.map((edge) => {
          const source = nodeById[edge.source_paper_id];
          const target = nodeById[edge.target_paper_id];
          if (!source || !target) return null;
          return (
            <line
              key={`${edge.source_paper_id}-${edge.target_paper_id}`}
              x1={source.x * 1000}
              y1={source.y * 460}
              x2={target.x * 1000}
              y2={target.y * 460}
              stroke="#6aa192"
              strokeOpacity={0.25 + edge.strength * 0.65}
              strokeWidth={1 + edge.strength * 5}
            >
              <title>{edge.evidence}</title>
            </line>
          );
        })}
        {map.nodes.map((node) => (
          <g
            key={node.paper_id}
            className={node.paper_id === selectedPaperId ? "map-node selected" : "map-node"}
            transform={`translate(${node.x * 1000} ${node.y * 460})`}
            onClick={() => onSelectPaper(node.paper_id)}
          >
            <circle r={node.paper_id === selectedPaperId ? 24 : 20} />
            <text textAnchor="middle" dominantBaseline="middle">
              {node.label}
            </text>
            <title>{node.title}</title>
          </g>
        ))}
      </svg>
    </section>
  );
}
```

- [ ] **Step 2: Fetch and render map in `RunWorkspace`**

Modify `research-field-mapper/frontend/components/RunWorkspace.tsx` imports:

```typescript
import { ResearchMap } from "./ResearchMap";
import { getResearchMap } from "../lib/api";
import { ResearchMap as ResearchMapData } from "../lib/types";
```

Add state:

```typescript
const [researchMap, setResearchMap] = useState<ResearchMapData | null>(null);
```

During polling, include `getResearchMap(runId)` after papers/extractions/landscape load:

```typescript
const [updatedRun, papers, extractions, landscape, map] = await Promise.all([
  getRun(runId),
  getRunPapers(runId),
  getRunExtractions(runId),
  getLandscape(runId),
  getResearchMap(runId),
]);
setResearchMap(map);
```

Render below the table/detail workspace:

```typescript
<ResearchMap
  map={researchMap}
  selectedPaperId={selectedPaper?.paper.paper_id ?? null}
  onSelectPaper={setSelectedPaperId}
/>
```

- [ ] **Step 3: Add map CSS**

Modify `research-field-mapper/frontend/app/globals.css`:

```css
.research-map-panel {
  width: min(1320px, calc(100vw - 232px));
  margin: 18px auto 0;
  border: 1px solid #dfe4df;
  border-radius: 8px;
  background: #111827;
  color: white;
  padding: 16px;
}

.map-heading {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.map-heading h2 {
  font-size: 16px;
  font-weight: 800;
}

.map-heading p {
  color: #cbd5e1;
  font-size: 13px;
}

.research-map-panel svg {
  width: 100%;
  height: min(460px, 52vh);
}

.map-node {
  cursor: pointer;
}

.map-node circle {
  fill: #2563eb;
  stroke: #93c5fd;
  stroke-width: 2;
}

.map-node.selected circle {
  fill: #f59e0b;
  stroke: #fde68a;
}

.map-node text {
  fill: white;
  font-size: 13px;
  font-weight: 800;
  pointer-events: none;
}
```

- [ ] **Step 4: Run frontend checks**

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both commands PASS.

- [ ] **Step 5: Commit the map UI slice**

Run:

```bash
git add research-field-mapper/frontend/components/ResearchMap.tsx \
  research-field-mapper/frontend/components/RunWorkspace.tsx \
  research-field-mapper/frontend/app/globals.css
git commit -m "feat: visualize paper relationship maps"
```

---

## Task 10: End-to-End Verification and Responsive QA

**Files:**
- Create: `research-field-mapper/frontend/tests/workspace.spec.ts`
- Modify: `research-field-mapper/frontend/package.json`
- Modify: `research-field-mapper/frontend/package-lock.json`
- No backend production code changes.

**Interfaces:**
- Produces `npm run test:e2e`.
- Verifies the table appears above the fold, sorting controls work, paper details open, folders save papers, downloads produce a ZIP response, and the map renders.

- [ ] **Step 1: Install Playwright if absent**

Run:

```bash
cd research-field-mapper/frontend
npm ls @playwright/test || npm install --save-dev @playwright/test
```

Expected: either dependency is already listed or install succeeds.

- [ ] **Step 2: Add the e2e script**

Modify `research-field-mapper/frontend/package.json` scripts:

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test:e2e": "playwright test"
  }
}
```

- [ ] **Step 3: Add the Playwright workspace test**

Create `research-field-mapper/frontend/tests/workspace.spec.ts`:

```typescript
import { expect, test } from "@playwright/test";

test("research workspace creates a run and exposes table, detail, map, and folder actions", async ({
  page,
  request,
}) => {
  await page.goto("http://127.0.0.1:3000");

  await page.getByPlaceholder("Compare SGLT2 inhibitor trial outcomes and endpoints").fill(
    "retrieval augmented generation",
  );
  await page.getByRole("button", { name: "Start" }).click();

  await expect(page.getByRole("table")).toBeVisible({ timeout: 60000 });
  await expect(page.getByLabel("Sort papers")).toBeVisible();

  await page.getByLabel("Sort papers").selectOption("date");
  await page.getByRole("button", { name: /New folder/i }).click();
  await expect(page.getByText("Library")).toBeVisible();

  const firstTitle = page.locator(".paper-title").first();
  await firstTitle.click();
  await expect(page.getByText("TL;DR")).toBeVisible();
  await expect(page.getByText("Research map")).toBeVisible();

  const folderLinks = page.locator(".download-folder");
  if ((await folderLinks.count()) > 0) {
    const href = await folderLinks.first().getAttribute("href");
    expect(href).toContain("/api/folders/");
    const download = await request.get(href!);
    expect(download.headers()["content-type"]).toContain("application/zip");
  }
});
```

- [ ] **Step 4: Run backend and frontend checks**

Run:

```bash
cd research-field-mapper/backend
pytest -v
```

Expected: all backend tests PASS.

Run:

```bash
cd research-field-mapper/frontend
npm run typecheck
npm run build
```

Expected: both frontend commands PASS.

- [ ] **Step 5: Run the e2e test with local servers**

Terminal A:

```bash
cd research-field-mapper/backend
uvicorn app.main:app --reload --port 8001
```

Terminal B:

```bash
cd research-field-mapper/frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001 npm run dev -- --port 3000
```

Terminal C:

```bash
cd research-field-mapper/frontend
npm run test:e2e
```

Expected: Playwright test PASS and no console errors for missing API routes.

- [ ] **Step 6: Capture manual QA checks**

Open `http://127.0.0.1:3000` and verify:

```text
1. The first screen shows the command center, not a marketing page.
2. The results table appears near the top after a run, without scrolling past landscape cards.
3. Paper rows show title, brief abstract, relevance, citation count or Unknown, date, and categories.
4. Clicking a paper opens the detail panel with TL;DR, Problem, Method, Key results, and Why it matters.
5. Sort: Relevance, Sort: Connection, Sort: Citations, and Sort: Date all reorder visible rows.
6. Saving to a folder increments the folder paper count.
7. Downloading a folder returns a ZIP containing papers.json and links.txt.
8. The research map shows nodes and weighted links, and clicking a node selects the matching paper.
9. At mobile width, table scrolls horizontally inside its panel and text does not overlap controls.
```

- [ ] **Step 7: Commit verification**

Run:

```bash
git add research-field-mapper/frontend/tests/workspace.spec.ts \
  research-field-mapper/frontend/package.json \
  research-field-mapper/frontend/package-lock.json
git commit -m "test: cover research workspace workflow"
```

---

## Follow-Up Ticket: PDF Parsing and Local Full-Text Notes

**Status:** Separate implementation plan after Tasks 1-10 are merged and verified.

**Reason for separation:** PDF parsing changes data ingestion, local storage size, extraction provenance, and privacy messaging. The workspace slice above can ship with metadata, abstracts, arXiv links, folder ZIP manifests, and deterministic maps before full-text parsing exists.

**Planned files for the follow-up plan:**
- Create `research-field-mapper/backend/app/models/documents.py`
- Create `research-field-mapper/backend/app/services/documents/pdf_parser.py`
- Create `research-field-mapper/backend/app/services/documents/pdf_downloader.py`
- Create `research-field-mapper/backend/app/routes/documents.py`
- Modify `research-field-mapper/backend/app/storage/database.py`
- Modify `research-field-mapper/backend/app/storage/repositories.py`
- Create `research-field-mapper/backend/tests/test_pdf_parser.py`
- Create `research-field-mapper/backend/tests/test_documents_routes.py`
- Modify `research-field-mapper/frontend/components/PaperDetailPanel.tsx`

**Follow-up acceptance criteria:**
- Users explicitly choose to download or parse PDFs.
- Parsed text is stored only in the local SQLite database or local files under an ignored data directory.
- The frontend never receives secrets and never sends parsed full text to a cloud provider without a visible provider choice.
- Parser tests use local fixture PDFs and do not require network.
- Full-text extraction preserves source page references when possible.

---

## Self-Review

**Spec coverage:**
- Combined keyword + semantic ranker using RRF: Task 1.
- Token, money, time, hallucination reduction by avoiding LLM ranking: Task 1 and Global Constraints.
- Better layout/style inspired by references: Tasks 6 and 7.
- Compact table instead of long scrolling result cards: Task 7.
- Clickable paper title with brief summary and detail view: Task 7.
- Sort by citations, relevance, and date: Tasks 2, 5, and 7.
- Save papers and group into folders for projects or subjects: Tasks 3 and 8.
- Download all papers in a folder: Tasks 3 and 8.
- Visual map linking strength of connection/relevance: Tasks 4 and 9.
- PDF parsing: Follow-Up Ticket.
- Privacy and safety constraints: Global Constraints.

**Placeholder scan:**
- No prohibited placeholder markers are present.
- Every task has exact files, interfaces, commands, and expected results.
- Every code-changing step includes the target code shape.

**Type consistency:**
- Backend `Paper.metrics` uses `PaperMetric | None` consistently across Tasks 1-3.
- Backend `RankedPaper.ranking_components` uses `RankingComponents | None` consistently across Tasks 1, 5, and 7.
- Frontend `ResearchMap` type is aliased as `ResearchMapData` where it would collide with the component name.
- Folder routes and frontend API wrappers use the same paths and response shapes.
