# Cly Architecture

## Direction

Cly is a standalone research platform. Its durable core is independent of any editor implementation; the desktop application, embedded code workspace, IDE extensions, notebooks, CLI, and GitHub integration are clients of that core.

## Layers

1. **Research core:** typed research objects, relationships, provenance events, policies, and validation rules.
2. **Local Cly service:** project-scoped storage, file and Git observation, experiment/run capture, artifact indexing, context retrieval, and permission-gated agent execution.
3. **Clients:** desktop research application, optional embedded code workspace, VS Code-compatible extension, Jupyter integration, CLI, and GitHub adapter.
4. **Research experience:** sources, graph, objectives, decisions, experiments, claims, provenance, audits, and agent control.

## Local-first storage

SQLite and Drizzle remain the source of truth for application metadata. The research graph is represented relationally with object and relationship tables; a graph database is deliberately excluded from the MVP. Large datasets and generated artifacts remain outside the database and are referenced by metadata and content hashes.

Provider credentials belong in the operating-system credential store. They must not be written to SQLite, project files, logs, Git history, or agent context.

## Integration boundary

The research core must depend only on small adapters for persistence, project identity, Git state, execution, and external tools. The current code workspace is a transitional client; no product capability may require a specific IDE fork or upstream synchronization.

## Data flow

```text
Desktop app / IDE extension / Jupyter / CLI
  -> local Cly service
  -> research repository and adapters
  -> SQLite / Drizzle + project artifacts
  -> provenance event
```

Every mutation must carry a project identifier, validate its payload, create or update a research object, and record sufficient provenance to explain the change.
