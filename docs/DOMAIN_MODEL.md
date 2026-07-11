# Mock Domain Model

The prototype uses stable IDs and normalized arrays in `ClyRepositoryData`. Screens never own independent fixture JSON.

## Core records

`ResearchProject`, `Source`, `Claim`, `Experiment`, `ExperimentRun`, `NotebookArtifact`, `CodeArtifact`, `Artifact`, `AuditFinding`, `ReproducibilityAudit`, `Integration`, `NextStep`, `ResearchDecision`, `ContextItem`, `ContextPack`, `AgentPreset`, `AgentNode`, `AgentSession`, `GraphNode`, `GraphEdge`, `Report`, and `ActivityEvent`.

## Relationship rules

- Claims store supporting/contradicting source IDs and experiment/notebook/artifact IDs.
- Experiments link runs, claims, notebooks, data, code version, command, and environment.
- Artifacts link source data, generator, experiment, run, commit, claims, hash, and regeneration state.
- Decisions link evidence and affected object IDs and can point to a superseding decision.
- Context items point to linked research IDs and preserve representation, priority, pin, freshness, confidence, and token estimate.
- Graph edges preserve direction, relation, confidence, and approval state.

## Shared evidence example

`claim-01` → `exp-01` → `run-02` → `artifact-01`, with `src-01` supporting the claim and `src-04` weakening it. `decision-01` selects the canonical run. The same IDs appear in Overview, Claims, Experiments, Provenance, Context, Graph, Decisions, and the inspector.

## Mutation policy

All visible mutations go through the Cly store via mock service interfaces. Future implementations must keep the interface contracts and replace in-memory writes with project-scoped repositories and provenance events.
