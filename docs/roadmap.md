# Cly Roadmap

## Phase 0 — Standalone platform boundary

- Independent Cly identity, release path, and local service boundary
- CI, tests, repository governance, and security policy
- Research-core contracts and client integration contracts
- Migration plan for the current embedded code workspace

Exit criterion: Cly builds independently, research capabilities do not depend on an IDE fork, and changes are protected by automated checks.

## Phase 1 — Research core and desktop workspace

- Relational research-object graph
- Sources and claims
- Evidence relationships and provenance
- Research dashboard, objectives, decisions, and research graph

Exit criterion: a user can add a source, record a claim, connect them, restart Cly, and recover the relationship.

## Phase 2 — Literature intelligence

- Metadata import and normalization
- OpenAlex or arXiv retrieval
- Reading lists and literature matrix
- Grounded summaries and duplicate detection

## Phase 3 — Code, notebook, and repository integration

- Notebook cell extraction
- Code-symbol indexing
- Objective and method linking
- Scientific-risk annotations
- Git and filesystem observation through the local Cly service

## Phase 4 — Experiments and provenance

- Experiment definitions and run tracking
- Commit, configuration, dataset, and metric capture
- Figure/table lineage and staleness detection

## Phase 5 — External workflow integrations

- VS Code-compatible extension and deep links
- Jupyter extension and experiment SDK
- CLI, MCP/server interfaces, and GitHub integration

## Later phases

Focused code editing and artifact inspection may remain embedded as a convenience after the research core and integrations are validated. General IDE replacement is not a roadmap goal. The complete scope and acceptance scenario live in [product-plan.md](product-plan.md).
