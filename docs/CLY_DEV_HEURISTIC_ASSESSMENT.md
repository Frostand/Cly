# Cly Dev internal heuristic assessment

## Scope and limitations

- Review timestamp: 2026-07-16T04:20:50Z
- Build basis: the exact 486 tested product/source inputs retained in `docs/CLY_DEV_TESTED_SOURCE_MANIFEST.sha256` (manifest SHA-256 `ca7669914c015d10084abe8142c27dcefed043cf6f00313bc18c20b5453e78c7`, baseline `09fd7297fb11c7d7768f3c43de1b0cb8501fabe9`). Evidence documents and the manifest/verifier are excluded from its source scope to avoid self-reference; `node scripts/verify-cly74-tested-source-manifest.mjs` verifies the retained artifact.
- Evidence reviewed: generated Electron captures at 1024×700, 1280×800, 1440×900, 1728×1117, 1024×700 at 200% zoom with identity/composer focus, and the final keyboard-run state.
- Method: one internal Codex reviewer inspected static captures against the CLY-74 hierarchy, identity, truthful-prototype, responsive, and focus-visibility contracts.

This is a heuristic engineering assessment. It did not involve an external participant, an independently observed human interaction session, free exploration, think-aloud notes, or measured human timing/errors. Static screenshots cannot prove discoverability, focus order, screen-reader output, motion, or successful activation; those behaviors rely on the separately reported automated assertions.

## Contemporaneous observations

| Area | Observation | Disposition |
|---|---|---|
| Hierarchy | At 1024×700, task/session header, eight-part identity, workspace mode, task tools, conversation, composer, and optional workbench remain visually distinguishable. | No blocking hierarchy issue observed in the inspected capture. |
| Identity | The eight groups remain in the task header. Compact values truncate, but every group now advertises a disclosure; the 200% identity capture shows the complete project value as rendered text after keyboard activation. | Truncation is acceptable only with the disclosure and its automated keyboard coverage. |
| Prototype truthfulness | Detached and external-editor choices include “prototype intent” before selection, while the detach action itself includes “prototype.” | Boundary is visible without requiring activation. |
| 1024×700 composition | Primary mode controls and both inspection actions are visible; the composer is present at the bottom of the agent pane. The inline workbench reduces conversation width but does not replace the agent surface. | Matches the supported native baseline. |
| Larger sizes | 1280×800 and 1440×900 progressively expose more identity/workbench content. At 1728×1117, whitespace appears in sparse fixture panels but the primary task surface remains coherent. | Whitespace is a fixture-density issue, not a CLY-74 blocker. |
| 200% zoom | The focused identity disclosure is readable. The static focused-composer capture is not suitable proof that the composer is visible because Chromium's zoomed screenshot framing does not track the focused CSS viewport reliably. | Do not use that image as visual proof; rely on the explicit focus/reachability assertion and retain manual 200% browser review as follow-up. |
| Keyboard-run end state | The resumed agent-only session retains identity, task tools, transcript, status strip, and composer without a workbench. | Supports the intended agent-only fallback hierarchy. |

## Follow-up not claimed by CLY-74

- Conduct a real Codex-familiar participant walkthrough on an exact packaged build, with contemporaneous time, wrong-turn, hesitation, coaching, and activation notes.
- Repeat at 200% browser zoom with direct human observation and VoiceOver; measure contrast and reduced-motion behavior.
- After CLY-78 implements real detached/editor behavior, assess cross-window focus transfer, close/reopen restoration, display clamping, notification deduplication, and rejection/fallback for unsafe external-editor paths.
