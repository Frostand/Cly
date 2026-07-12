# Cly Roadmap

## Phase 0 — Foundation and assessment ✅

- Independent Cly identity and release path
- CI, tests, repository governance, and security policy
- Dream architecture, licensing, packaging, and upgrade assessment
- Reuse / extend / replace decision map
- UI shell prototype with full fixture-backed navigation

Exit criterion: Cly builds independently, changes are protected by automated checks, and upstream merges have a documented process.

## Phase 1 — Research core with real persistence

- Project-scoped relational persistence replacing mock services
- Source import (file, URL, BibTeX) with hashing and metadata
- Claim/evidence graph with supporting and contradicting relationships
- Experiment and run manifests
- Artifact provenance (hash, regeneration state, staleness detection)
- Context composer backed by real research objects
- Research graph with neighborhood queries

Exit criterion: a user can add a source, record a claim, connect them to an experiment and artifact, restart Cly, and recover the full relationship chain with provenance.

## Phase 2 — Literature and code intelligence

- Metadata import and normalization
- Semantic paper search (OpenAlex or arXiv)
- Reading lists and literature matrix with persistence
- Static notebook scanner (`.ipynb` parsing, cell extraction)
- Code-symbol indexing and objective/method linking

Exit criterion: a user can import papers, scan notebooks, and link code to research objects with the results persisting across restart.

## Phase 3 — External integrations

- VS Code / Cursor extension (send code to Cly, view active tasks, annotate claims)
- GitHub integration (commit tracking, branch-to-experiment linking)
- Jupyter extension (notebook metadata sync, experiment registration)
- CLI and Python SDK (`from cly import experiment`)
- MCP server for agent tool access

Exit criterion: a researcher can work in VS Code or Jupyter and have Cly track their experiments, claims, and provenance automatically.

## Phase 4 — Reproducibility and audits

- Deterministic reproducibility checks (environment, seed, data, git, command)
- Claim audit board with automated validation
- Figure/table lineage and staleness detection
- Decision log with supersession tracking
- Report and manuscript audit generation

Exit criterion: clicking a claim shows the full provenance chain and any broken or stale links are flagged automatically.

## Phase 5 — Agent orchestration

- Local signed-in agent routing (Codex, Claude, local tools)
- Context packs with token budgets and compression
- Agent task execution with approval workflows
- Multi-agent patterns (review, debate, hierarchical)
- Planner: rule-based next steps with agent suggestions

Exit criterion: an agent can execute a research task, record provenance of its changes, and the user can audit the result.

## Later phases

- Team collaboration
- Remote compute and cluster job tracking
- Institution-level research compliance
- Advanced multi-agent research orchestration

The complete scope and acceptance scenarios live in [product-plan.md](product-plan.md).
