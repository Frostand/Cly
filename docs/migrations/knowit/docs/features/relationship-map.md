# Visual Relationship Map Between Papers

**Branch:** `feature/relationship-map`

## What

An interactive visual graph showing relationships between papers in a run or folder — nodes are papers, edges show shared categories, shared citations, or extracted tensions/relationships.

## Why

A table shows papers linearly, but research papers form a network. A graph helps users see clusters (e.g., evaluation methods vs. new architectures), find central papers, and identify gaps.

## How to Implement

### Backend

1. **Relationship extraction** — enhance `landscape_synthesizer.py`
   - The landscape already has `relationships`, `tensions`, and `clusters`
   - Add pairwise paper relationships to the landscape output:
     ```json
     {
       "paper_relationships": [
         {"source": "paper_id_1", "target": "paper_id_2", "type": "builds_on|cites|contradicts|similar_method|shared_category", "description": "..."}
       ]
     }
     ```

2. **Similarity-based edges** as a fallback
   - Compute cosine similarity between paper embeddings (mock or real provider)
   - Papers with similarity > threshold get a `similar_method` edge
   - Papers sharing ≥2 categories get a `shared_category` edge

3. **Graph endpoint** — `GET /api/v1/runs/{id}/graph`
   - Returns nodes (papers with id, title, cluster) and edges (source, target, type)
   - Also works for folders: `GET /api/v1/folders/{id}/graph`

### Frontend

4. **Graph visualization**
   - Use a lightweight library: `d3-force` (3KB gzipped) or `@visx/network`
   - Nodes sized by relevance score or citation count
   - Node color by landscape cluster
   - Edges colored by relationship type
   - Hover: show paper title, click: open detail panel
   - Zoom and pan (D3 zoom behavior)
   - Legend showing relationship types

5. **Toggle between table and graph view**
   - Tab or toggle button: "Table | Graph"
   - Graph is full-width below the header

## When You Know It's Done

- [ ] Graph renders with nodes for each paper and edges for relationships
- [ ] Nodes are colored by landscape cluster
- [ ] Hovering a node shows the paper title
- [ ] Clicking a node opens the paper detail panel
- [ ] Zoom and pan work with mouse/trackpad
- [ ] Graph updates when a new run completes
- [ ] Works for both run results and folder contents
- [ ] Performance: 50 papers render without lag

## Expected Results

A research run on "retrieval augmented generation" shows two clear clusters: retrieval architecture papers on the left, evaluation/benchmark papers on the right, with a few bridge papers connecting both.

## Dependencies

- `feature/paper-detail-panel` (click → open detail)
- `feature/reciprocal-rank-fusion` (embeddings for similarity edges)

## Files to Touch

```
backend/app/services/synthesis/landscape_synthesizer.py  (add paper_relationships)
backend/app/routes/search.py                              (or new graph route)
frontend/app/components/RelationshipGraph.tsx             (new)
frontend/app/page.tsx                                     (toggle, graph state)
frontend/package.json                                     (add d3-force or visx)
```
