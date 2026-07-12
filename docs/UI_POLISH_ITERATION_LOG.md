# Cly UI polish iteration log

Date: 2026-07-12

All observations below came from the real Electron `BrowserWindow`, controlled with Playwright by `scripts/ui-review/run-electron-review.mjs`. Screenshots are under `artifacts/ui-review/`.

## Iteration 1 — structural simplification

| Route | Observed issue and usability cost | Severity | Implemented fix | Verification | Before / after |
| --- | --- | --- | --- | --- | --- |
| App shell | Escape left the titlebar overflow open, allowing it to intercept later workbench clicks | High | Close overflow on Escape, outside click, and menu selection; added global details dismissal | Electron runner explicitly asserts the menu is closed | `iteration-1/application-menu-open.png` / `iteration-2/application-menu-open.png` |
| Agent Sessions | At 1440 px the row grid reduced “Audit primary claim evidence” to a clipped fragment while secondary metadata remained visible | High | Gave the primary object flexible width, reduced row height, moved low-priority metadata out of the row | Full title and objective scan cleanly at 1440 and 1024 px | `iteration-1/agent-sessions-overview-1440x900.png` / `iteration-2/agent-sessions-overview-1440x900.png` |
| Integrations | 3,277 visible characters and 21 panel nodes made a provider catalog read like documentation | High | Shortened copy; collapsed connection modes and routing preferences | Visible characters fell to 2,299; provider rows remain primary | `iteration-1/integrations-1440x900.png` / `iteration-2/integrations-1440x900.png` |
| Models & Agents | Eleven presets pushed the selected topology below the fold | High | Show six recommended presets by default with “Show all 11” disclosure | Topology is visible at 1440×900; 608 fewer visible characters | `iteration-1/models-agents-1440x900.png` / `iteration-2/models-agents-1440x900.png` |
| Sources | Five equal-weight action buttons remained visible without a selection | Medium | Moved source-specific actions into a disclosure row | Default surface ends with one compact “Source actions” row | `iteration-1/sources-1024x700.png` / `iteration-2/sources-1024x700.png` |
| Context | Ten 42 px rows delayed packs and budget work | Medium | Reduced context rows to 36 px and shortened copy | More context packs appear without reducing legibility | `iteration-1/context-1440x900.png` / `iteration-2/context-1440x900.png` |
| All routes | Route descriptions repeated product documentation | Medium | Rewrote route and empty-state descriptions to one task-oriented sentence | 16 of 17 route character counts fell; research content was preserved | Iteration route screenshots and `review-data.json` |

## Iteration 2 — interaction refinement

| Route | Observed issue and usability cost | Severity | Implemented fix | Verification | Before / after |
| --- | --- | --- | --- | --- | --- |
| Agent Chat | Branch, time, and usage competed with session, status, model, context, and agent count | Medium | Kept core state inline; moved branch, elapsed time, and usage into Session menu | Metadata is reachable and component-tested; chat header scans faster | `iteration-2/agent-sessions-chat-typed.png` / `iteration-3/agent-sessions-chat-typed.png` |
| Agent Chat | Inline model, reasoning, and plan selectors compressed the primary Send action | High | Moved configuration into a Composer options menu | Final typed-message screenshot keeps the Send action fully visible | `iteration-3/agent-sessions-chat-typed.png` / `final/agent-sessions-chat-typed.png` |
| Agent menus | Native details menus lacked consistent Escape behavior and explicit menu-item semantics | High | Global Escape closes the active details element; session actions use `menuitem` | Unit and Electron tests pass | `iteration-2/application-menu-open.png` / `iteration-3/application-menu-open.png` |
| Context | Six item actions were always visible even before the user chose an advanced operation | Medium | Moved preview/compress/restore/branch/archive/forget into “Item actions” disclosure | Full Context workflow opens and uses Compress successfully | `iteration-2/context-1440x900.png` / `iteration-3/context-1440x900.png` |
| Sources | The Year column was constrained to 8 px and displayed as “Ye” / “20” at 1024 px | High | Assigned a stable 70 px year column | “Year” and complete values remain visible | `iteration-2/sources-1024x700.png` / `iteration-3/sources-1024x700.png` |
| Integrations | Provider names such as Google Drive wrapped while lower-priority capability text had more room | Medium | Increased provider column; hide capability column first at narrow widths | No document overflow and provider identity remains readable | `iteration-2/integrations-1440x900.png` / `iteration-3/integrations-1440x900.png` |

## Iteration 3 — final visual polish

| Route | Observed issue and usability cost | Severity | Implemented fix | Verification | Before / after |
| --- | --- | --- | --- | --- | --- |
| Dialogs | Escape did not close New Session, leaving an overlay to intercept the next action | High | Added Escape dismissal, focus trapping, initial form focus, unique labels, and focus restoration to shared `Dialog` | Full final Electron workflow and dialog unit test pass | `iteration-3/agent-sessions-new-dialog.png` / `final/agent-sessions-new-dialog.png` |
| Responsive shell | Compositor captures could occur before the titlebar repainted after navigation | Low | Added a short deterministic settle before review screenshots | Final captures consistently contain complete shell chrome | Iteration 1 / final resolution screenshots |
| Accessibility | Secondary session metadata had no tested keyboard path | Medium | Session-menu metadata and menu items are keyboard reachable; accessibility snapshot checks landmarks, tabs, and composer | Electron accessibility test passes | `iteration-3/agent-sessions-chat-typed.png` / `final/agent-sessions-chat-typed.png` |

## Outcome

Three full review/fix/relaunch cycles plus a final end-to-end capture were completed. No route produced document-level horizontal overflow at 1440×900, and representative Overview, Sources, Graph, and Agent Sessions states were also verified at 1024×700, 1280×800, 1440×900, and 1728×1117.
