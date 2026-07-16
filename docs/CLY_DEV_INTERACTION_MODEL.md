# Cly Dev interaction model

## Scope and hierarchy

This specification defines the task workspace contract consumed by CLY-78. The current UI is a fixture-backed, clickable prototype; detach, reattach, and external-editor controls record intent and do not claim that a native secondary window or editor was opened.

The canonical hierarchy is:

```text
project / feature
  task / session
    conversation
    plan / progress
      tool / approval events
    context
    workbench
```

Conversation is the durable center of a task. The workbench is optional: plan/progress, approval events, context, composer, retained test output, and diff summaries remain usable in agent-only, detached-workspace, and external-editor modes.

## Task identity contract

`ClyDevTaskIdentity` is the stable renderer contract:

```ts
export interface ClyDevTaskIdentity {
  project: { id: string; name: string };
  repository: { name: string; remote?: string };
  workspace: { branch: string; worktree?: string; commit?: string };
  machine: { id: string; name: string };
  provider: { id: string; model: string; reasoningLevel: "low" | "medium" | "high" };
  budget: { usedTokens: number; maxTokens: number; usedCostMinorUnits: number; maxCostMinorUnits: number };
  objective: { title: string; issueId?: string };
  researchImpact: { summary: string; objectIds: string[]; risk: "low" | "medium" | "high" };
}
```

Project, repository, branch/worktree, machine, provider/model/reasoning, token/cost budget, objective/issue, and research impact are always visible in an active task workspace. Each group has its own accessible name and a native, focusable disclosure that reveals the complete value and detail. Ellipsis and pointer-only `title` text are never the only visual access to identity.

## Workspace modes

| Mode | Agent window | Workspace ownership | Prototype behavior |
|---|---|---|---|
| Agent only | conversation, plan/progress, approvals, context, composer, inline test/diff inspection | no visible workbench | hides the workbench without reducing task capability |
| Inline workspace | complete agent surface plus resizable workbench | agent window | default supported baseline |
| Detached workspace | complete agent surface plus retained inline fallback | replaceable workspace window intent | mode and action are explicitly labeled prototype intent before activation |
| External editor | complete agent surface plus retained inline inspection | external-editor deep-link intent | mode and action are explicitly labeled prototype intent; selection never implies an editor opened |

Mode is task/session state, not renderer-local state. Changing mode cannot pause or stop work. Closing or losing a replaceable workspace window returns authority to the agent window’s inline fallback.

## Primary flows

| Flow | Entry and sequence | Completion / focus contract |
|---|---|---|
| Start | Agent Sessions → New session → identify objective, provider, context, approval policy, branch, budget → Start session | Chat opens; identity and loading/streaming state are announced; focus reaches the composer in normal Tab order |
| Approve or reject | pending approval event in conversation → inspect effect, estimate, output, and object → Approve or Reject | event state changes in place; because the action unmounts, focus moves to the resulting approved/rejected status at the same event; status is live-announced once |
| Inspect test or diff | Task tools → Inspect tests or Inspect diff | retained evidence opens inside the agent pane in every mode; Close or Escape restores focus to the exact Inspect tests/diff trigger |
| Switch project/session | project switcher or session selector → select target | Core snapshot replaces all identity and task data atomically; focus stays on the switcher and the new identity is visible |
| Detach | Inline workspace → Detach workspace (prototype) | mode becomes detached; a restrained status announces intent; agent surface remains complete |
| Reattach | Detached workspace → Reattach workspace (prototype) | mode becomes inline; the persisted workbench layout is restored |
| Restart/resume | close/reload → restore last valid task, mode, layout, and draft → resume interrupted task when requested | stale or invalid session IDs return to Overview; interrupted state says that a saved checkpoint is resumable |

## Core and window authority

Cly Core is canonical for session identity, event history, plan/progress, approvals, context references, tool results, budget, workspace-mode intent, workbench tab definitions/order/pins, active tab, durable tab state, and layout revisions. A renderer submits idempotent intents and renders revised Core snapshots; renderers never synchronize whole local stores with each other.

### Global, session, and window-local state

- Global project selection and the canonical session binding are Core state. A project switch replaces identity and task data atomically in every bound window.
- Active workbench tab, selected file/research object, tab order, pin state, and content revision are session-global. Changing one in either same-session agent/workspace window propagates through Core to the other.
- Agent split width/collapse/maximize and detached-window bounds are durable layouts keyed by session plus window role. Closing and reopening restores the latest accepted role-specific layout; invalid/offscreen detached bounds are clamped before display.
- Text selection, scroll position, focus, hover, open menu/dialog, conversation search, and expanded identity/inspection disclosure are window-local and never propagated.
- Agent window owns conversation, composer, plan/progress, approval controls, destructive confirmations, inline inspection, task-mode intent, and the inline fallback.
- Workspace window owns only replaceable workbench presentation. External editors own file presentation only; neither can approve, reject, confirm a destructive action, mutate budget, or claim canonical task state.

Every Core snapshot has a monotonically increasing `revision`. Every intent carries `intentId`, `sessionId`, `sourceWindowId`, and `baseRevision`. Core deduplicates `intentId`; rejects a stale destructive, approval, mode, tab-close, or selection-changing intent; and returns the latest snapshot plus a named stale-intent reason. Renderers may safely retry read/focus requests but never silently replay rejected mutations. Closing a replaceable workspace does not change session mode until Core accepts a close/fallback intent. If a workspace crashes or is unavailable, Core activates agent-only/inline fallback and preserves the last accepted tabs, selection, and layout for reopen.

### Dialog, notification, and destructive routing

- A non-destructive dialog belongs to its initiating window and restores focus to its connected trigger; if that trigger is gone, focus returns to the nearest owning toolbar.
- Stop, archive, discard, and other destructive confirmations are always instantiated by the canonical agent window. A workspace/external request only asks Core to activate that window and open one confirmation keyed by `sessionId + action + revision`.
- Core suppresses duplicate confirmation requests. A superseding revision invalidates the dialog; the agent window announces the stale request and returns focus to the session menu or initiating toolbar. Confirmation submits one revision-bound intent, closes on acknowledgement, and focuses the retained result/trigger. Cancel makes no state change.
- Core emits one session-scoped notification; windows suppress duplicates and route activation back to the canonical session.
- A workspace-only command routes to the workspace window when present and to the inline fallback otherwise. Global shortcuts are handled once by the shell. `Cmd/Ctrl+Shift+O` belongs only to Switch project. Agent Sessions Overview remains available through the Overview control, command palette, and native menu without that accelerator.

## External-editor safety contract for CLY-78

Renderer input is an intent containing a session, requested file, optional line/column, and base revision—not an executable URI or shell string. Core applies this sequence before invoking an editor adapter:

1. Decode the input exactly once; reject NUL/control characters, malformed percent escapes, empty paths, non-integer or non-positive line/column values, fragments, credentials, and query parameters.
2. Accept a native path or a `file:` URI only. Reject `http:`, `https:`, `command:`, `vscode:`, `vscode-insiders:`, editor-specific, and unknown schemes from renderers. Core alone constructs an allowlisted editor URI after validation.
3. Resolve relative paths against the session's canonical worktree, normalize separators and Unicode, and canonicalize with filesystem `realpath`. For a not-yet-created file, canonicalize the nearest existing parent before appending validated path segments.
4. Compare the canonical target against canonical repository/worktree root allowlists using path-component boundaries and platform case rules. Reject `..` traversal, alternate-volume/UNC escape, symlink/junction escape, and any target outside the session roots—even when the lexical path appears inside.
5. Encode the validated absolute file path per URI path segment. Encode line and column as separate positive integer adapter fields; never concatenate `path:line`, interpolate a shell command, or pass renderer-provided arguments. Native launches use an argument array with no shell.
6. On rejection, do not open an editor or fallback path. Return a typed `invalid-scheme`, `invalid-location`, `outside-root`, `symlink-escape`, `stale-revision`, or `unsupported-editor` result, retain agent-only inline inspection, and record an auditable event without exposing sensitive absolute roots in user copy.

Close/reopen must revalidate the target against the current worktree revision. A previously valid path never bypasses validation after branch/worktree or symlink changes.

## Task states

| State | Required presentation and allowed action |
|---|---|
| First run | plain orientation and one Start task action |
| Empty | “No sessions in this view” or a task prompt plus one New session action |
| Loading | named status; identity placeholders must not imply verified values |
| Streaming | restrained live updates; do not announce every token or terminal line |
| Awaiting approval | text status plus inline approval event; conversation and inspection remain usable |
| Offline (connection) | retained data remains readable; queued/blocked effects are stated truthfully |
| Reconnecting (connection) | one polite live update; repeated retry noise is suppressed |
| Failed | alert with retained evidence and retry/reassign path; delegated-agent failure is not mislabeled as whole-task failure |
| Canceled | retained conversation/evidence and explicit terminal state |
| Interrupted / resumable | saved checkpoint and Resume affordance; never shown as running |
| Unsupported | name the unavailable capability and preserve agent-only fallback where possible |

`ClyDevTaskState` owns first-run, empty, loading, streaming, awaiting-approval, failed, canceled, interrupted/resumable, and unsupported. `ClyDevConnectionState` separately owns connected, offline, and reconnecting. The renderer composes at most one connection phrase with one task phrase so offline interrupted work remains both truthful and resumable without duplicate announcements.

## Accessibility contract

- Landmarks: named Task identity region, Orchestrator conversation region, optional Session workbench region, named toolbars, tablist/tab/tabpanel semantics, and named live/status regions.
- Names: every identity group, icon control, mode, approval action, inspection surface, and resize separator has a unique accessible name.
- Focus: dialogs trap and restore focus; mode changes retain focus on the chosen radio; inspection close/Escape restores the exact trigger; approval/rejection focuses the retained result status; detached workspace focus returns to its initiating control when reattached or closed.
- Keyboard order: header → identity → workspace modes → task tools → transcript actions → composer → inline workbench. Arrow keys resize the separator; Enter/Space activate controls; Escape closes transient UI.
- Status uses text in addition to color. Reduced motion removes nonessential transitions. Text and controls meet 4.5:1 contrast where WCAG requires it.

## Responsive and native-window contract

The supported and configured native agent-window minimum is 1024×700. At that size the eight identity groups use four columns over two rows; complete identity is keyboard-disclosable, the composer and task tools remain present, and conversation/workbench respect practical minimums. At 200% text zoom the sidebar becomes an icon rail, identity becomes one keyboard-following horizontal row, and task controls wrap/scroll, so disclosure, primary task controls, status, and composer remain reachable; critical state is never `display: none`.

The CLY-78 workspace-only window recommendation remains 640×480 because it does not own task identity, conversation, or composer. Detached windows must restore onscreen, clamp persisted bounds to the active display, and fall back inline if a second window cannot be created.

## Prototype and evidence boundary

Component coverage lives in `src/features/cly/agent-sessions/agent-sessions-components.test.tsx`. Browser lifecycle, 1024×700 discoverability, mode/intent, reload restoration, session/state, and keyboard paths live in `tests/e2e/agent-sessions.spec.ts`. The actual unpackaged Electron main/preload/window lifecycle supplies route, process-restart, accessibility, keyboard-only, and overflow evidence in `tests/e2e/ui-review/electron-review.spec.ts`; its fixture renderer does not claim packaged-build or live-provider coverage. Exact tested source inputs are retained in `docs/CLY_DEV_TESTED_SOURCE_MANIFEST.sha256` and checked by `scripts/verify-cly74-tested-source-manifest.mjs`. Automated acceptance evidence is reported in `docs/CLY_DEV_USABILITY_REPORT.md`. A separate internal screenshot-based heuristic assessment records observations and limitations; it is not participant usability research or evidence of uncoached discoverability.
