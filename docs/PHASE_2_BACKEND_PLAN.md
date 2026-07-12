# Phase 2 Backend Plan

## Recommended order

The authentication, credential, context-approval, repository-permission,
execution, imported-content, and provenance gates in
[Local service security model](LOCAL_SERVICE_SECURITY_MODEL.md) apply to every
slice below. An external research execution adapter cannot ship until its
applicable P0 gates pass.

1. **Project-scoped repository and migration**: persist the UI domain model in normalized SQLite tables with provenance events.
2. **Source import**: safe file/URL/BibTeX ingestion, hashes, metadata edits, duplicate detection, and extraction jobs.
3. **Claim/evidence graph**: source, experiment, run, notebook, code, artifact, decision, and contradiction relationships.
4. **Static notebook and code scanners**: parse `.ipynb`, file/module metadata, imports, paths, outputs, issues, and inferred purposes without executing code.
5. **Experiment/run manifests**: capture command, environment, Git state, config, data versions, metrics, and outputs through approved local processes.
6. **Artifact provenance**: hashes, regeneration recipes, staleness propagation, and version comparison.
7. **Deterministic reproducibility checks**: environment, seed, data, path, Git, command, notebook, artifact, and claim-consistency rules.
8. **Context engine**: graph-backed packs, token estimates, compression, redaction, exact manifest previews, and stale/redundant warnings.
9. **Local agent router**: wrap signed-in Codex/Claude/local tools first; add optional API providers only after credential-store support.
10. **Planner and agent workflows**: derive rule-based next steps, then layer agent review and approved execution.
11. **Official integrations**: GitHub, Hugging Face, Zotero/BibTeX, MLflow/W&B/DVC, Drive, and writing exports based on validated demand.

## Vertical slices

Each step should replace one mock service without changing components. A slice is complete only when it persists across restart, records provenance, handles errors/offline state, has fixture-compatible contract tests, and does not leak secrets or paths.

## Explicitly later

Real notebook execution, broad experiment orchestration, cloud backend, billing, managed credits, team collaboration, and NotebookLM automation remain later-phase work.
