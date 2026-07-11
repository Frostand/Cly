# Dream Technical Assessment for Cly

Assessment date: 2026-07-10. Assessed upstream baseline: Dream `v0.5.0` / commit `5578425`.

## Executive conclusion

Dream is a viable foundation for Cly. It is an MIT-licensed Electron application with a React/Vite renderer, local SQLite persistence, a token-protected loopback API, integrated Git and terminal services, and provider-specific agent adapters. Cly should reuse the workspace shell and execution infrastructure, extend persistence/API/navigation through narrow modules, and replace product identity, release/update ownership, and several security-sensitive defaults.

## Platform inventory

| Area | Evidence | Finding | Cly action |
|---|---|---|---|
| License | `LICENSE`, `README.md` | MIT permits commercial modification and distribution with notice preservation. | Reuse; preserve license and `NOTICE.md`. |
| Desktop | `electron/main.js`, `package.json` | Electron desktop targets macOS, Windows, and Linux. There is no supported standalone browser product. | Reuse desktop shell. |
| Renderer | `src/main.tsx`, `vite.config.ts` | React 19 and Vite 8 renderer with Tailwind/shadcn-style components. | Reuse and extend feature-by-feature. |
| Editor | `src/components/ide/project-workspace.tsx` | File navigation/diffs and external-editor launching; not an embedded Monaco/VS Code extension host. | Extend; do not assume VS Code extension compatibility. |
| Git | `electron/api/project-git-*` | Hono routes call `git` and `gh` through argument-array subprocess helpers. | Reuse behind project-scoped adapters. |
| Terminal | `electron/process-sessions.js`, `electron/preload.js` | `node-pty` sessions exposed through explicit IPC methods. | Reuse with approval and audit controls. |
| Agents | `electron/api/chat/*` | Separate Codex, Claude, OpenCode, and Cursor implementations share UI message concepts but no single stable provider interface. | Extend through a Cly routing/audit facade. |
| Storage | `electron/persisted-state.js`, `electron/db/schema.ts` | Node built-in SQLite plus Drizzle migrations; projects, chats, messages, and JSON config. | Extend with relational research tables. |
| API | `electron/api/app.js`, `electron/preload.js` | Loopback Hono API uses a per-process session token passed by preload. | Reuse, add project-scoped research routes. |
| Updates | `electron/updater.js`, `package.json` | electron-updater supports generic/GitHub metadata and previously used Dream-specific environment variables. | Replace with opt-in Cly feed and Cly release coordinates. |
| Tests | inherited `package.json` | No inherited test command or general CI; lint/typecheck/build pass. | Replace gap with Vitest/RTL/Playwright and required CI. |
| Packaging | `package.json`, `.github/workflows/package-installers.yml` | electron-builder supports macOS, Windows, Linux; signing workflow expects platform secrets. | Reuse after Cly identity and signing configuration. |
| Notebooks | repository search | No native `.ipynb` semantic model or notebook runtime was found. | Add later behind research feature modules. |

## Reuse / extend / replace map

### Reuse unchanged where possible

- Window lifecycle and renderer-server startup
- Workspace layout primitives and shared UI components
- Project discovery and Git status/branch operations
- Terminal PTY lifecycle
- Browser session panel
- Existing agent protocol implementations
- SQLite migration runner

### Extend behind Cly-owned interfaces

- Database schema and persistence repositories
- Hono API composition
- Workspace side navigation and right-panel view registry
- Agent invocation for provenance, budgets, and source grounding
- Git workflow service for research-object impact tracking
- Project initialization for research metadata

### Replace or harden

- Product identity, data directory, release owner, updater feed, and telemetry headers
- Credential persistence where it does not use the OS credential store
- Renderer/preload compatibility names through a staged migration
- Broad execution approval modes before handling sensitive research projects
- Electron `sandbox: false` after native-module compatibility testing
- Release signing/notarization ownership and secrets

## Upgrade constraint

The safest fork strategy is additive. Upstream merges must remain dedicated pull requests, while Cly changes should cluster in `src/features/research`, `electron/api/research`, relational migrations, and small registration seams. See `docs/upstream-sync.md`.

