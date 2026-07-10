# Extension Points

## Stable-enough seams

- `electron/api/app.js`: compose project-scoped Hono route modules.
- `electron/db/schema.ts` and `electron/drizzle/`: add normalized tables and migrations.
- `src/components/ide/workspace/side-nav.tsx`: register research navigation without replacing the workspace.
- `src/components/ide/workspace/right-panel.tsx`: render research feature panels.
- `electron/api/project-git-service.js`: read Git state for provenance through an adapter.
- `electron/api/chat/schema.js` and provider streams: wrap agent runs with Cly provenance rather than rewriting protocols.

## Missing extension systems

Dream does not expose a general plugin API, VS Code extension host, notebook kernel API, research-object registry, or provider-neutral agent contract. Cly should create internal typed interfaces only when a shipped feature needs them; it should not build a marketplace framework during the MVP.

## Compatibility-sensitive internals

The renderer currently expects `window.dream`, `dream-theme`, and related persisted keys. Renaming these immediately would invalidate user preferences and touch a broad surface. Cly retains them temporarily as compatibility identifiers while user-visible identity, application data directories, and releases are independent. A future migration must read legacy keys once, write `cly-*` keys, and preserve rollback behavior.

