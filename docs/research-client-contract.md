# Research core and client contract

The canonical transport-neutral client boundary is `src/features/research/contracts`. It is shared by the desktop app, focused code workspace, VS Code-compatible extensions, Jupyter integrations, CLI/MCP tools, and GitHub integrations. Adapters translate their native protocol into this contract; the research core never imports editor, Electron, React, or workspace state.

Every mutation is project-scoped and carries authorization plus provenance. Authorization names the actor, client kind, and allowlisted capabilities. Provenance names the operation, origin, occurrence time, and optional source URI/content hash. Credentials and raw editor state are deliberately absent.

Attachments are discriminated records for code locations, commits, notebooks, runs, and artifacts. URIs identify external content; hashes and revisions make identity reproducible without copying large files into the research database.

All operations return `ResearchResult<T>`. Failures use stable machine-readable codes, a safe human message, and an explicit `retryable` flag. Clients should request permission again only for `permission-denied`, resolve conflicts before retrying `conflict`, retry `unavailable` with bounded backoff when `retryable` is true, and never expose secrets in `message` or `details`. `operationId` supports idempotency and audit correlation.

The boundary test scans contract imports to prevent dependencies on editor/UI infrastructure and exercises every attachment category, permissions, provenance, and failure behavior.
