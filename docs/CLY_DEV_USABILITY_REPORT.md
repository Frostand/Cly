# Cly Dev acceptance and usability evidence

## Evidence classification

This report separates three different kinds of evidence:

1. **Automated acceptance coverage** exercises the fixture-backed lifecycle with Playwright locators and assertions. It proves deterministic behavior of the tested build, not human discoverability, time-on-task, error rate, or uncoached completion.
2. **Internal heuristic assessment** is a static review of generated screenshots against the interaction contract. Its observations live in `docs/CLY_DEV_HEURISTIC_ASSESSMENT.md`. It is not a participant study and does not measure usability.
3. **Participant usability research** was not conducted for CLY-74. There were no external participants and no independently observed human walkthrough. No participant completion time, misclick rate, hesitation, or coaching claim is made.

The exact tested product/source inputs are retained in `docs/CLY_DEV_TESTED_SOURCE_MANIFEST.sha256`, whose SHA-256 is `ca7669914c015d10084abe8142c27dcefed043cf6f00313bc18c20b5453e78c7`. The deterministic manifest records baseline `09fd7297fb11c7d7768f3c43de1b0cb8501fabe9` plus path and content SHA-256 for all 486 tracked source, Electron, E2E, public, dependency/workspace, build/test configuration, Electron preparation, capability-contract, package-hook, and accessibility-runner inputs used by the verified matrix. Evidence documents, generated output, the manifest, and its verifier are deliberately excluded so the artifact is reproducible without self-reference. `node scripts/verify-cly74-tested-source-manifest.mjs` verifies both scope and content. The matrix ran on macOS 26.5.1 with Node 24.18.0 and Electron 41.7.2.

## Automated eight-scenario lifecycle

`tests/e2e/ui-review/electron-review.spec.ts` runs the exact scenario sequence in an unpackaged Electron process using the real main, preload, menu, renderer server, native window, close, and relaunch lifecycle with a fixture-enabled renderer.

| Scenario | Automated assertion |
|---|---|
| Start task | A new fixture session accepts title/objective and opens Chat. |
| Recognize identity | All eight named identity groups are present at the configured 1024×700 native minimum. |
| Send direction | `Cmd+Enter` submits a direction and the transcript retains it. |
| Approve an action | Approve changes the event state and focus moves to the retained approved status. |
| Inspect test and diff | Both retained evidence surfaces open without the workbench; close returns focus to the exact trigger. |
| Switch session | The selector replaces objective and identity together. |
| Detach / reattach prototype | Truthfully labeled prototype intents preserve the complete agent surface and restore the inline workbench. |
| Restart / resume | A full Electron process close/relaunch restores the interrupted fixture and Resume changes it to Running. |

The test records harness elapsed time for regression diagnostics only. It intentionally does not synthesize a misclick count or call locator execution an expert walkthrough.

## Keyboard-only automated lifecycle

A separate Electron test begins at route entry and uses only keyboard input. It opens the task through the command palette, opens and dismisses test inspection with Escape, resolves an approval, detaches and reattaches the prototype workspace, dismisses the palette with Escape, closes and relaunches Electron, and resumes an interrupted task. Assertions cover focus return after inspection and approval resolution. Command-palette component coverage verifies that approval, tests, diff, agent-only, inline, detach, reattach, interrupted/resume, and destructive-review actions remain universally reachable.

This is keyboard-operability evidence. Because the command names and assertions are encoded in the test, it does not prove that a new user would discover or recall them.

## Responsive and accessibility evidence

- Electron reads the committed native minimum as 1024×700 before testing that size; no test-only minimum override is used.
- Native captures cover 1024×700, 1280×800, 1440×900, and 1728×1117. The generated images are intentionally not committed.
- At 1024×700, automated viewport assertions cover the eight identity groups, workspace-mode control, Inspect tests, Inspect diff, and composer.
- At 200% Electron zoom, keyboard focus reaches the project disclosure, task modes, inspection control, and composer; the disclosure exposes the complete project value as rendered text.
- The active-Chat Axe scan reports no serious or critical findings, and horizontal overflow stays within one pixel for the native size matrix.
- Focused accessibility automation complements but does not replace VoiceOver, contrast instrumentation, reduced-motion, or packaged cross-platform checks.

## Findings resolved during CLY-74

| Severity | Finding | Resolution and repeated evidence |
|---|---|---|
| P1 | Workbench actions were nested in a tablist. | Actions moved outside the tablist; tabs own panels and arrow-key focus; Electron Axe repeated clean. |
| P1 | Per-process test storage could not prove restart restoration. | An isolated opt-in E2E session-data path now survives a full process relaunch; normal launches keep per-process isolation. |
| P1 | The original 1024×700 capture lowered an 1180×720 app minimum only in tests. | The real main-window minimum is now 1024×700 and the test asserts it before resize. |
| P1 | Inspection and approval actions unmounted focused controls. | Inspection close/Escape restores its exact trigger; approval/rejection focuses the retained result status. |
| P1 | A scripted locator run was mislabeled as an expert walkthrough. | The test and this report now classify it only as automated lifecycle coverage; heuristic observations are separate and participant research is explicitly absent. |
| P2 | Compact identity depended on truncation and pointer-only title text. | Each group has a focusable disclosure with complete rendered value/detail; component, browser, and 200% Electron checks cover it. |
| P2 | Destructive controls executed directly and ownership was ambiguous. | Stop/archive open an agent-window-owned confirmation; the interaction contract defines Core routing, deduplication, stale handling, and focus behavior. |

## Remaining prototype boundary

Detach, reattach, and external-editor choices still record prototype intent. No native second window or editor is opened, and the UI says so before and after activation. CLY-78 must implement the specified Core revision protocol, cross-window selection/layout synchronization, canonical destructive routing, display clamping, and external-editor path confinement. A future participant study is still required before making claims about discoverability, time-on-task, misclicks, or uncoached completion.
