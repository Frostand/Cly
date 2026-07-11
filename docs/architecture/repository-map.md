# Repository architecture map

## Current topology

| Layer | Location | Current responsibility | Extension guidance |
| --- | --- | --- | --- |
| Renderer | `src/` | React 19 + Vite UI, Zustand IDE state, project/chats, terminal/browser/file/Git panels | Add research panels and feature-local UI here; do not add domain persistence to Zustand. |
| Desktop main | `electron/main.js` | Electron lifecycle, IPC, window, native capabilities | Keep IPC narrow and capability-specific. |
| Preload | `electron/preload.js` | Context-isolated `window.dream` bridge | Add only reviewed, typed, least-privilege capabilities. |
| Local API | `electron/api/` | Hono loopback API protected by per-session token | Place feature route registration and Zod validation in isolated research modules. |
| Persistence | `electron/db/schema.ts`, `electron/drizzle/` | SQLite/Drizzle schema and migrations for app state | Add versioned research tables via migrations; never place graph state in existing JSON metadata. |
| Process/Git | `electron/process-sessions.js`, `electron/api/project-git/` | Shell/PTY sessions, Git/worktree/PR actions | Research execution requires a separately gated runner, not the existing general shell path. |
| Packaging | `package.json`, `build/`, `.github/workflows/package-installers.yml` | Electron Builder releases and signing | Preserve release workflow; add quality gates separately. |

## Framework and extension points

Dream is a TypeScript Electron 41 desktop application: React 19 renderer, Vite 8 build, Hono local API, SQLite through Drizzle, and Zustand UI state. There is no plugin SDK, notebook engine, remote backend, test runner, or research-domain module today.

Preferred initial seams are a `research` route registrar under `electron/api/`, a dedicated repository/service layer backed by SQLite migrations, a typed renderer API client, and a research right-panel/navigation module. Provider adapters must sit behind a research provider contract rather than expand the current CLI-provider conditionals.

## Preserve and isolate

Do not directly reshape `electron/process-sessions.js`, `electron/preload.js`, the persisted IDE-state compatibility code, or general Git actions for MVP research behavior. Wrap them with purpose-specific adapters and approval policies. Keep upstream commits easy to merge by confining research changes to new directories and thin registration edits.
