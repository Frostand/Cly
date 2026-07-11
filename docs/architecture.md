# Cly architecture

## Direction

Cly is a standalone research platform. Its research core and local service are independent of every editor, notebook, and repository client.

## Layers

1. **Research core** — typed objects, evidence relationships, provenance events, policies, and validation.
2. **Local Cly service** — project-scoped storage, repository observation, artifact indexing, context retrieval, and permission-gated execution adapters.
3. **Research application** — objectives, sources, graph, experiments, claims, decisions, audits, and agent control.
4. **Companion clients** — VS Code-compatible extension, Jupyter integration, GitHub adapter, CLI, SDK, and MCP interface.

## Boundary rules

- The core imports no editor, terminal, Electron, or provider-specific code.
- Integration clients communicate only through explicit local-service contracts.
- Repository observation is opt-in, scoped to a Cly project, and produces reviewable provenance events.
- Commands, remote transmissions, and material mutations require explicit approval policies.
- Credentials remain in the operating-system credential store, outside research records and agent context.

## Data flow

```text
External editor / notebook / CLI / GitHub
  → local Cly service
  → project-scoped research repository
  → research graph and provenance events
  → Cly research application
```
