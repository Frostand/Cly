# Cly Dev usability report

## Evaluation record

- Timestamp: 2026-07-16T02:57:20.125Z (2026-07-15 22:57 EDT)
- Build: CLY-74 working tree based on `09fd729`; final commit is recorded in the task report
- Evaluator: one Codex-familiar expert evaluator (Codex); no external participants
- Environment: macOS 26.5.1, Electron 41.7.2, Node 24.18.0, dark theme, 1024×700 native window
- Runtime boundary: unpackaged Electron using the real main, preload, menu, renderer-server, native-window, close, and relaunch lifecycle with the fixture-enabled renderer. This is production-like window behavior, not a packaged-build or live-provider claim.
- Method: the evaluator drove the exact protocol through Playwright's Electron controls without explanatory UI coaching. Times below are instrumented elapsed harness times, useful for regression comparison but not human-participant completion times. Misclick means an unintended activated control; locator retries do not count as user actions.

## Exact eight-scenario walkthrough

| Scenario | Result | Time | Misclicks | Observation |
|---|---:|---:|---:|---|
| 1. Start task | Pass | 944 ms | 0 | New session accepted title and objective and opened Chat directly. |
| 2. Recognize identity | Pass | 67 ms | 0 | All eight named groups were visible at 1024×700; the created objective appeared in Task identity. |
| 3. Send direction | Pass | 219 ms | 0 | `Cmd+Enter` submitted the direction and the transcript retained it. |
| 4. Approve an action | Pass | 86 ms | 0 | Session switch exposed the high-cost approval; Approve changed its text state in place. |
| 5. Inspect test and diff | Pass | 117 ms | 0 | Both evidence surfaces opened inside conversation without depending on the workbench. |
| 6. Switch session | Pass | 26 ms | 0 | Selector replaced objective and identity atomically. |
| 7. Detach / reattach prototype | Pass | 380 ms | 0 | Controls stated prototype intent, kept the agent surface usable, and restored inline workbench. |
| 8. Restart / resume | Pass | 2,070 ms | 0 | A full Electron process close/relaunch restored the interrupted task; Resume changed it to Running. |

All primary scenarios completed without coaching. The final screenshot is generated at `output/playwright/electron-cly-dev-expert-final.png`; the responsive Electron matrix is generated at `electron-cly-dev-chat-{1024x700,1280x800,1440x900,1728x1117}.png` in the same directory.

## Findings and repetitions

| Severity | Finding | Resolution and repeated evidence |
|---|---|---|
| P1 | Workbench action buttons were nested inside the tablist, causing a critical Axe ARIA violation. | Moved tab actions outside `role="tablist"`, added tab/tabpanel ownership and arrow-key focus behavior; Electron Axe scan repeated with zero serious or critical violations. |
| P1 | The first visual capture could occur during route transition. | Wait for Task identity before capture; repeated responsive screenshots show active Chat at all four target sizes. |
| P1 | Per-process E2E Chromium storage prevented a real relaunch from proving restoration. | Added an isolated, opt-in stable `CLY_E2E_SESSION_DATA_PATH`; repeated full-process restart restored Review OOD notebook and its Resume action. Normal launches retain per-process isolation. |
| P1 | The combined browser/Electron command reused an unrelated development server on the interactive port, so browser pages never loaded Cly. | Gave Playwright its own default port and assigned explicit non-overlapping renderer/API ports to both Electron tests; the exact combined command then starts only its intended servers. |
| P2 | Long visible identity values truncate at compact widths. | Full value and detail remain in semantic content and the fieldset title; no critical identity state is hidden. |

No blocking finding remains. Detach and external-editor actions are still deliberately non-functional prototype intents; they never claim a window or editor opened.

## Automated acceptance evidence

| Acceptance area | Evidence |
|---|---|
| Identity contract, labeled groups, four modes, truthful state banners | `agent-sessions-components.test.tsx` |
| 1024×700 discoverability, keyboard-only mode path, project/session switch, detach/reload/reattach, offline/error/empty | `agent-sessions.spec.ts` |
| Real Electron route matrix, native resize, semantic snapshot, zero serious/critical Axe findings | `electron-review.spec.ts` assembled-shell test |
| Exact eight scenarios and full-process restart/resume | `electron-review.spec.ts` expert-walkthrough test and attached JSON timings |

The interaction specification and tests define the prototype boundary. Passing automated checks demonstrate deterministic behavior and accessibility rules; they do not substitute for future participant research or packaged cross-platform validation.
