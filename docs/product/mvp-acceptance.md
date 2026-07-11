# MVP acceptance test

The MVP is accepted only when a researcher can complete this deterministic fixture-backed scenario without opaque or unreviewable steps.

1. Create a research project with a topic, one research question, and one objective.
2. Search a configured paper source; inspect query normalization, retrieval-stage reasons, and reranking explanation; save two sources.
3. Verify each extracted matrix value links to a source passage and exposes extraction confidence and verification state.
4. Add a notebook fixture; inspect extracted cells, imports, execution order, output artifacts, and at least one detected risk.
5. Link a notebook cell or code symbol to the objective and confirm the proposed relationship in the graph.
6. Create an experiment with code revision, dataset version, configuration, environment, seed, and command; capture a completed run and metric.
7. Register a figure from the run and navigate its complete provenance chain: artifact → cell/script → function → run → commit → configuration → dataset → claim.
8. Create a claim supported by a source and figure; view its evidence, limitations, confidence, verification date, and any contradiction status.
9. Change linked code or data; verify the figure and affected claim are marked stale with an explanation and a non-destructive regeneration action.
10. Run a reproducibility audit and receive actionable findings for missing or stale provenance, environment, data, and claim evidence.
11. Create a Linear-linked Git branch and PR draft using the research-aware template; no push, merge, external upload, destructive command, or claim mutation occurs without explicit approval.

Automated coverage must include the graph/provenance and audit decisions exercised above; the end-to-end test uses local fixtures and mock provider/source adapters.
