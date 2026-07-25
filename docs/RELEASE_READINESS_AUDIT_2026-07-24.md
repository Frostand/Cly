# Cly release-readiness audit — 2026-07-24

This document records the frozen pre-fix baseline and the verified post-fix result for the open-source beta release pass. Findings are included only when source inspection, a focused test, or an isolated first-install Electron run produced concrete evidence. Baseline Electron artifacts live under `artifacts/release-audit/rc-fresh-before-3/`; the final clean-user report is `artifacts/release-audit/rc-fresh-final-2/report.json`.

## Release decision at baseline

Not ready. The core research loop, persistence, local analysis, evidence linking, context approvals, audits, backups, and live Cly Dev provider chat have real implementations. However, visible production routes still contain fabricated research state, multiple advertised workflows are deliberately unavailable, startup can fail without a window, and several Electron/IPC boundaries are too permissive.

## Release decision after remediation

Ready for the scoped local beta distribution flow. Every confirmed item in the ledger below is fixed or the unsupported production surface was removed. Final verification completed on 2026-07-24:

- 755 Vitest tests passed across 131 files.
- 33 Playwright end-to-end tests passed, including the blank-to-reviewed research workflow, provider/model discovery, session recovery, Electron restart, keyboard navigation, obligations, preregistration, provenance, and every production route.
- A disposable first-install Electron profile crawled 20 production routes with zero console problems, failed responses, serious/critical Axe violations, or unfinished/Preview UI matches.
- The final packaged `Cly.app` passed the content gate (7,329 ASAR entries, 26 unpacked files; no tests, mocks, source maps, or private artifacts) and runtime smoke (native startup, renderer, database hydration, preload isolation, provider detection).
- Lint, typecheck, capability manifest, production-license inventory, and diff-integrity checks passed.

The live npm advisory service remains the one unverified external check, as documented under Audit limitation. Public Apple signing/notarization is intentionally outside this beta scope.

## Verified issue ledger

| ID | Sev. | Area | Confirmed defect | Acceptance check | Final status |
| --- | --- | --- | --- | --- | --- |
| SEC-001 | P0 | Electron | Embedded webviews have no explicit permission deny policy or navigation scheme allowlist. | Tests prove camera, microphone, geolocation, notifications, MIDI, USB, serial, Bluetooth, clipboard-read, and unknown schemes are denied unless a narrowly defined Cly policy allows them. | Fixed |
| SEC-002 | P0 | Electron IPC | Browser actions trust a renderer-supplied `webContentsId`, so an arbitrary Electron web contents can be targeted for screenshot, storage clearing, or DevTools. | Browser actions accept only a guest registered to the sending window and project/tab; forged IDs are rejected. | Fixed |
| SEC-003 | P0 | Electron IPC | Workspace snapshot/detach/reattach IPC trusts arbitrary session IDs and does not bind workspace callers to their own session. | Agent windows can address owned sessions; detached workspace windows can address only their bound session; cross-session calls fail. | Fixed |
| SEC-004 | P0 | Credentials | Cly reads, refreshes, and rewrites Claude OAuth credentials to show usage, and places the serialized credential value in a `security ... -w <secret>` process argument. | Cly never owns or mutates provider OAuth secrets; usage uses provider-supported non-secret APIs/CLI output or degrades honestly. No secret appears in argv or logs. | Fixed |
| SEC-005 | P1 | Release | Tagged release quality gates omit the repository privacy check and installed-app security/runtime smoke. | Release jobs run privacy, license, capability, test, packaged-content, and installed-app smoke gates. | Fixed |
| SEC-006 | P0 | Provider process | Cursor places the full prompt in argv and launches with `shell: true`; Codex also uses `shell: true` with renderer-controlled arguments. On Windows this creates command-injection risk and all platforms expose prompt text to process inspection. | Provider executables are resolved and spawned directly with `shell: false`; prompts use stdin or a restricted temporary file; renderer-controlled model/path values are validated. | Fixed |
| SEC-007 | P1 | Provider logging | Claude stream error logging prints rich provider errors that can contain prompt excerpts. | Provider failures log only scrubbed code/message metadata and a sentinel prompt never appears in captured logs. | Fixed |
| BUG-001 | P1 | Git | Pull-request creation calls `runGhCommand(repoInfo.repoRoot, ...)` where `repoInfo` is undefined. | Focused test reaches `gh pr create` with the resolved repository root and no `ReferenceError`. | Fixed |
| START-001 | P0 | Startup | Server/database startup occurs before any window and the `whenReady` chain has no recovery catch; a failure can leave no UI. | A forced startup failure shows a branded recovery window within two seconds with Retry, diagnostics, and Quit. | Fixed |
| START-002 | P1 | Startup | The renderer loader is removed on the first React effect instead of repository/API readiness. | Delayed hydration keeps a branded loading state visible; failure offers Retry; success transitions once without blank frames. | Fixed |
| BRAND-001 | P1 | Branding | The development Electron bundle is renamed but keeps Electron's bundle icon; macOS has no explicit checked-in `.icns` source. | Dev and packaged builds show the Cly icon in Dock, switcher, window identity, installer, and app metadata. | Fixed |
| BRAND-002 | P2 | Branding | Startup and shared UI retain Dream-named loading identifiers and a Dream-logo component. | All visible loading/identity surfaces use Cly assets and names, include reduced-motion behavior, and contain no Dream product identity. | Fixed |
| FIRST-001 | P0 | First run | A clean install seeds `~/Research/cly`; New local project invents same-day paths instead of selecting/creating a real folder. Impact Review then returns 400 and exposes the expanded absolute path. | Fresh install presents onboarding, cancellation creates nothing, a selected canonical folder persists, and Impact Review gives a safe empty state until a repository is linked. | Fixed |
| TRUTH-001 | P0 | Production UI | Objectives, literature themes, and machine/repository/test panels render invented live values in unrelated production projects. | A blank unrelated project contains no fixture terms or positive readiness claims; automated fixtures never enter production bundles. | Fixed |
| CAP-001 | P0 | Agents | Research Agent Sessions advertise start/control/workbench while execution and browser/terminal/diff/live-file surfaces are unavailable or fixture-backed. | A production session can start, stream, stop, resume, approve, and recover through a selected detected provider; workbench data is real and restart-safe. | Fixed |
| CAP-002 | P1 | Local ingestion | Folder, URL, BibTeX, archive, deduplication, notebook import, code scan, and NotebookLM bundle actions are unavailable or fake. | Each shipped action uses explicit approval, records provenance, persists/reloads, handles duplicates/failures, and has production E2E coverage. | Fixed — supported ingestion is durable; fake/unsupported imports were removed. |
| CAP-003 | P1 | Research decisions | Decision creation/supersession, planner mutations, and reproducibility dispositions are unavailable; an empty-state button bypasses the capability gate. | CRUD/history/dispositions persist and reload, planner changes are durable, and all failure paths are handled. | Fixed |
| CAP-004 | P1 | Integrations | Integration configuration is a visible Preview route with disabled credentials/approval flows. | Supported integrations have explicit local credential ownership boundaries, testable connect/disconnect, approval, error, and restart behavior; unsupported providers are not advertised as controls. | Fixed — only detected local provider integrations are shown. |
| CAP-005 | P1 | Claims/reports | Claim secondary actions, comparison reports, audit comparison, provenance comparison, and several exports only notify or preview without producing durable output. | Every enabled control produces a repository mutation, file, native dialog, external open, or explicit view transition; no success toast is emitted for a no-op. | Fixed |
| UI-001 | P1 | Sources | Real source enrichment is disabled under the wrong capability while fake merge is enabled. | Enrichment persists and reloads; merge is either reversible and durable or absent/disabled with correct copy. | Fixed |
| UI-002 | P1 | Menus | Electron exposes unhandled commands (`new-project`, `open-project`, imports, close, question/hypothesis, focus search) and action-named commands that only navigate. | A shared exhaustive command registry guarantees every enabled menu command performs its declared action. | Fixed |
| UI-003 | P1 | Settings | Disabled toggles present unenforced privacy and behavior promises as settings. | Preferences are persisted and enforced with boundary tests, or immutable policies render as information rather than controls. | Fixed |
| UI-004 | P2 | Code Linker | Files/Objectives/Claims selectors render the same list; several code actions are no-ops. | Each remaining selector changes grouping/filtering according to its label and each enabled action has observable output. | Fixed — the incomplete production route was removed. |
| A11Y-001 | P1 | Keyboard | Experiment output and provenance artifact cards attach click handlers to non-focusable panels. | Cards are semantic controls with names, visible focus, and Enter/Space activation. | Fixed |
| A11Y-002 | P2 | Navigation | The Research/Dev switcher uses incomplete ARIA tab semantics without arrow-key or tabpanel behavior. | It implements the complete tabs pattern or becomes a labelled button group. | Fixed |
| TEST-001 | P1 | Coverage | Major route/visual sweeps omit Objectives, Costs, Data Obligations, Impact Review, Reviewer Capsules, and Dev; lists drift independently. | One canonical route manifest drives navigation, smoke, accessibility, and visual matrices and fails CI on omissions. | Fixed |
| PROVIDER-001 | P0 | Claude | Claude chat does not receive the request abort signal, so Stop may not stop provider/tool work. | A long Claude operation stops the underlying work and emits no later tool activity. | Fixed |
| PROVIDER-002 | P1 | Cursor | Installed Cursor is treated as authenticated/model-ready; login hardcodes `agent` even when only `cursor-agent` exists. | Installed/logged-out is distinct from connected; the detected executable handles login and chat. | Fixed |
| PROVIDER-003 | P1 | Processes | Codex/Cursor cancellation has no bounded escalation or cross-platform process-tree cleanup. | A child that ignores graceful termination is killed with its descendants after a short bound on macOS/Linux/Windows. | Fixed |
| PROVIDER-004 | P2 | Offline | OpenCode/network model discovery lacks consistent timeouts and cached last-good fallback. | Offline refresh settles within 10–15 seconds, explains the source/state, offers Retry, and can use a labelled last-good catalog. | Fixed |
| PROVIDER-005 | P1 | Cancellation | Codex/Cursor stdout handlers can process provider/tool events after Stop while graceful process termination is pending. | Abort detaches or gates all event handlers immediately; no tool/write event is processed after cancellation. | Fixed |
| PROVIDER-006 | P1 | Discovery | Claude/OpenCode authentication and Codex model fetch still have paths outside a single end-to-end deadline. | Every provider refresh—including auth, version, CLI, and network discovery—settles within its documented bound. | Fixed |
| DEV-001 | P1 | First run | Cly Dev hides Open Folder until an AI provider is connected, unnecessarily blocking local files/Git/terminal. | Users with no provider can open a folder and use local workspace tools; only chat is gated. | Fixed |
| PACKAGE-001 | P1 | Packaging | `electron/**/*` packages tests, mocks, and development files (251 test files observed); the app is about 601 MB. | ASAR contains no tests/mocks/source maps and packaged provider/native/runtime smoke remains green. | Fixed |
| PACKAGE-002 | P1 | Permissions | Packaged macOS metadata requests camera, microphone/audio capture, and Bluetooth although core Cly does not use them. | Unused permission descriptions/entitlements are absent and normal use produces no unexpected OS permission prompts. | Fixed |
| PACKAGE-003 | P1 | Release | CI packages installers but does not launch the unpacked/installed product. | Each platform build launches with isolated user data, migrates the DB, loads renderer, checks native modules/provider detection, and exits cleanly. | Fixed |
| DOCS-001 | P2 | Docs | README omits Cursor from the AI harness setup table and overstates some auth/readiness behavior. | Provider docs match runtime detection, executable names, authentication, model source, and failure states. | Fixed |
| PRIVACY-001 | P2 | Repository | Ignored `.DS_Store` metadata and large historical screenshots/videos are present locally; privacy scan covers tracked text/path leaks but not all untracked metadata. | Personal metadata is removed, ignore rules prevent recurrence, and privacy tooling documents binary/untracked coverage. | Fixed |

## Confirmed non-issues

- Every declared renderer route resolves to a component.
- The isolated 22-route Electron baseline produced no serious or critical axe violations.
- Core research state, context revisions/approvals, numeric CSV/TSV analysis, claims, experiments, sources, evidence links, audit creation, and backups have production implementations.
- Automated fixture execution is isolated to the test runtime and excluded from production bundles.
- External literature transmission requires an explicit project-scoped approval.
- The packaged macOS app already has Cly bundle name, identifier, and a generated Cly icon; the remaining icon defect is deterministic asset/dev-bundle handling.

## Audit limitation

The npm advisory lookup could not be completed: the sandbox blocked sending the dependency inventory to npm without separate user authorization. The lockfile, production-license checker, and local source/package inspection remain in scope, but this document does not claim a live advisory-service result.
