# Product vision and MVP boundary

## Vision

Cly is a local-first research workspace and system of record. It connects sources, decisions, code, experiments, artifacts, and claims through a traceable research graph.

## MVP outcome

Demonstrate one verified chain: research topic → paper search and explainable reranking → saved source and literature matrix → objective → notebook or code → experiment → figure → claim → pull request → provenance and reproducibility check.

## Explicit MVP exclusions

Unrestricted autonomous agents, automatic merges, automatic scientific-conflict resolution, a full replacement for general-purpose IDEs, a plugin marketplace, institutional administration, and exhaustive source/provider integrations are out of scope.

## Product principles

- Persist provenance with every extracted or inferred fact; inferred graph edges remain unconfirmed until a user confirms them.
- Keep user control over model transmission, cost, tools, and sensitive actions.
- Keep the research core independent from any editor shell; external IDEs and notebooks are integration clients, not Cly-owned workspaces.
- Make Cly active in the work: watch repositories, connect commits and runs to research objects, and surface research context where code is edited.
- Prefer explainable recommendations and audit findings to opaque scores.
