# Cly Architecture

## Direction

Cly extends Dream rather than rewriting it. Dream's Electron shell, React renderer, project workspace, agent adapters, Git service, terminal sessions, and local SQLite persistence remain the platform layer. Cly-owned research capabilities live in focused feature modules and communicate through typed API boundaries.

## Layers

1. **Desktop shell:** Electron main process, secure preload bridge, windows, menus, updater, and packaging.
2. **Workspace platform:** projects, files, Git, terminals, browser sessions, and agent conversations inherited from Dream.
3. **Research domain:** typed research objects, directed relationships, provenance events, and validation rules.
4. **Research services:** project-scoped persistence and narrow HTTP/IPC operations. Services never accept arbitrary SQL or arbitrary filesystem paths.
5. **Research experience:** source, claim, experiment, provenance, and audit views embedded additively in the workspace.

## Local-first storage

SQLite and Drizzle remain the source of truth for application metadata. The research graph is represented relationally with object and relationship tables; a graph database is deliberately excluded from the MVP. Large datasets and generated artifacts remain outside the database and are referenced by metadata and content hashes.

Provider credentials belong in the operating-system credential store. They must not be written to SQLite, project files, logs, Git history, or agent context.

## Extension boundary

Cly changes Dream core only when product identity, security, or a missing extension seam requires it. Research modules should depend on small adapters for persistence, project identity, Git state, and agent execution. This keeps upstream merges reviewable and allows inherited services to be replaced independently if needed.

## Data flow

```text
Research panel
  -> typed research client
  -> project-scoped API route
  -> research repository
  -> SQLite / Drizzle
  -> provenance event
```

Every mutation must carry a project identifier, validate its payload, create or update a research object, and record sufficient provenance to explain the change.

