# Security Remediation Log

This log maps confirmed findings to code changes and regression tests. It does
not claim that unlisted paths are free of vulnerabilities.

## SEC-001 — bind approvals to an execution request

- Added `requestId` to approval creation, durable scope, evaluation, and exact
  field comparison.
- Missing request IDs fail closed with `INVALID_APPROVAL_SCOPE`.
- Execution runtime and workbench command paths pass their authoritative
  request ID into the gate.
- Regression: approval issued for one request is denied for a second request
  even when project, session, tool call, arguments, and context are identical.

Files: `electron/api/cly-dev/runtime/approval-gate.js`,
`execution-runtime.js`, `workbench-service.js`, and associated tests.

## SEC-002 — remove shell interpretation from editor launch

- Removed `cmd.exe /c start` wrapping and `shell: true` launcher behavior.
- Rejected Windows `.cmd` and `.bat` editor shims.
- Spawned known editor executables directly with `shell: false`, canonical
  project `cwd`, and discrete arguments.
- Regression uses a metacharacter-bearing Windows path and verifies it remains
  one data argument, never a shell command.

Files: `electron/editors.js`, `electron/editors.test.ts`.

## SEC-003 — keep the loopback bearer token in main

- Removed the token from Chromium `additionalArguments`, preload exposure,
  renderer types, renderer startup, and the renderer fetch monkey patch.
- Removed the synchronous token-retrieval IPC path.
- Added a session request hook that strips any renderer-provided token header
  from every request and injects the true token only on exact renderer-origin
  `/api/*` requests.
- Regressions cover lookalike paths, wrong ports/external origins, spoofed
  headers, correct injection, and absence from `window.dream`.

Files: `electron/renderer-request-authorization.js`, `electron/main.js`,
`electron/preload.cjs`, `src/main.tsx`, `src/types/ide.ts`, removal of
`src/lib/api-session.ts`, and associated tests.

## SEC-004 — consistently authorize privileged IPC

- Added reusable helpers for registered top-level renderer, role, exact
  renderer navigation, and workspace-session binding.
- Protected workspace snapshots/intents, detach/reattach/focus, theme, window,
  external shell, provider login, default shell, clipboard, save dialog,
  editor discovery, browser updates, and updater IPC.
- Save dialogs now use the calling authorized window as owner.
- Regressions cover subframe rejection, wrong role, cross-session workspace
  access, and unauthorized updater calls.

Files: `electron/privileged-ipc.js`, `electron/main.js`, `electron/updater.js`,
and associated tests.

## SEC-005 — parse external URLs

- Replaced prefix matching with `URL` parsing.
- Allowed only credential-free HTTP(S) URLs.
- Rejected ASCII controls, C1 controls, and bidirectional display controls.
- Used the same normalized path for popup, navigation, and preload IPC flows.

Files: `electron/privileged-ipc.js`, `electron/main.js`, and tests.

## SEC-006 — patch reachable dependency lines

- Direct `@hono/node-server`: `^2.0.5` -> `^2.0.10` (resolved 2.0.12).
- Direct Hono: `^4.12.25` -> `^4.12.27`; global compatible override resolves
  all reachable Hono lines to 4.12.32.
- DOMPurify override: 3.4.12.
- Mermaid override: 11.16.0.
- Current brace-expansion 5.x override: 5.0.8.
- tar override: 7.5.21.
- Regenerated `pnpm-lock.yaml` through pnpm; production license policy passed.

The two remaining `pnpm audit --prod` advisories and the reason they were not
force-overridden are recorded in `SECURITY_AUDIT.md`.

## SEC-007 — minimize and verify packaged contents

- Excluded Electron TypeScript/test files and dependency TypeScript, source
  maps, tests, and mock directories from the production package.
- Removed node-pty build scripts, sources, and build editor configuration from
  the unpacked app after packaging.
- Removed default macOS privacy descriptions for audio capture, Bluetooth,
  camera, and microphone because Cly does not request those capabilities.
- Rebuilt the unsigned macOS arm64 app and passed
  `pnpm package:verify:contents` across 7,289 ASAR entries and 35 unpacked
  files.

Files: `package.json`, `scripts/prune-packaged-app.cjs`.

## Verification commands

```bash
pnpm exec vitest run \
  electron/api/cly-dev/runtime/execution-runtime.test.ts \
  electron/api/cly-dev/runtime/security-invariants.test.ts \
  electron/api/cly-dev/workbench-service.test.ts \
  electron/editors.test.ts \
  electron/privileged-ipc.test.ts \
  electron/renderer-request-authorization.test.ts \
  electron/preload.test.ts \
  electron/updater.test.ts
pnpm typecheck
pnpm lint
pnpm licenses:check
pnpm privacy:check
pnpm capabilities:check
pnpm companion-contract:check
pnpm test
pnpm audit --prod --json
pnpm package:dir
pnpm package:verify:contents
```

Loopback tests require permission to bind ephemeral `127.0.0.1` ports. The
packaging result is a local unsigned app directory, not a distributable signed
installer.
