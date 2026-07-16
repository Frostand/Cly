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

Project, repository, branch/worktree, machine, provider/model/reasoning, token/cost budget, objective/issue, and research impact are always visible in an active task workspace. Each group has its own accessible name. Values may visually truncate only when their complete supporting detail remains available through the group title and accessible text.

## Workspace modes

| Mode | Agent window | Workspace ownership | Prototype behavior |
|---|---|---|---|
| Agent only | conversation, plan/progress, approvals, context, composer, inline test/diff inspection | no visible workbench | hides the workbench without reducing task capability |
| Inline workspace | complete agent surface plus resizable workbench | agent window | default supported baseline |
| Detached workspace | complete agent surface plus retained inline fallback | replaceable workspace window intent | “Detach” and “Reattach” are explicitly labeled prototype intents |
| External editor | complete agent surface plus retained inline inspection | external-editor deep-link intent | records a deep-link intent; it never implies an editor opened |

Mode is task/session state, not renderer-local state. Changing mode cannot pause or stop work. Closing or losing a replaceable workspace window returns authority to the agent window’s inline fallback.

## Primary flows

| Flow | Entry and sequence | Completion / focus contract |
|---|---|---|
| Start | Agent Sessions → New session → identify objective, provider, context, approval policy, branch, budget → Start session | Chat opens; identity and loading/streaming state are announced; focus reaches the composer in normal Tab order |
| Approve or reject | pending approval event in conversation → inspect effect, estimate, output, and object → Approve or Reject | event state changes in place; focus remains on the chosen action; status is text and live-announced once |
| Inspect test or diff | Task tools → Inspect tests or Inspect diff | retained evidence opens inside the agent pane in every mode; Close inspection returns to the same task surface |
| Switch project/session | project switcher or session selector → select target | Core snapshot replaces all identity and task data atomically; focus stays on the switcher and the new identity is visible |
| Detach | Inline workspace → Detach workspace (prototype) | mode becomes detached; a restrained status announces intent; agent surface remains complete |
| Reattach | Detached workspace → Reattach workspace (prototype) | mode becomes inline; the persisted workbench layout is restored |
| Restart/resume | close/reload → restore last valid task, mode, layout, and draft → resume interrupted task when requested | stale or invalid session IDs return to Overview; interrupted state says that a saved checkpoint is resumable |

## Core and window authority

Cly Core is canonical for session identity, event history, plan/progress, approvals, context references, tool results, budget, and workspace-mode intent. A renderer submits idempotent intents and renders revised Core snapshots; renderers never synchronize whole local stores with each other.

- Agent window owns conversation, composer, plan/progress, approval controls, inline inspection, task-mode intent, and the inline fallback.
- Workspace window owns only the replaceable presentation of workbench tabs for its assigned session.
- External editors own file presentation after a deep link; they do not own task state, approvals, context, or budget.
- The initiating window owns a dialog until completion. A workspace-only command routes to the workspace window when present and to the inline fallback otherwise.
- Core emits one session-scoped notification; windows suppress duplicates and route activation back to the canonical session.
- Global shortcuts are handled once by the shell. `Cmd/Ctrl+Shift+O` belongs only to Switch project. Agent Sessions Overview remains available through the Overview control, command palette, and native menu without that accelerator.

## Task states

| State | Required presentation and allowed action |
|---|---|
| First run | plain orientation and one Start task action |
| Empty | “No sessions in this view” or a task prompt plus one New session action |
| Loading | named status; identity placeholders must not imply verified values |
| Streaming | restrained live updates; do not announce every token or terminal line |
| Awaiting approval | text status plus inline approval event; conversation and inspection remain usable |
| Offline | retained data remains readable; queued/blocked effects are stated truthfully |
| Reconnecting | one polite live update; repeated retry noise is suppressed |
| Failed | alert with retained evidence and retry/reassign path; delegated-agent failure is not mislabeled as whole-task failure |
| Canceled | retained conversation/evidence and explicit terminal state |
| Interrupted / resumable | saved checkpoint and Resume affordance; never shown as running |
| Unsupported | name the unavailable capability and preserve agent-only fallback where possible |

## Accessibility contract

- Landmarks: named Task identity region, Orchestrator conversation region, optional Session workbench region, named toolbars, tablist/tab/tabpanel semantics, and named live/status regions.
- Names: every identity group, icon control, mode, approval action, inspection surface, and resize separator has a unique accessible name.
- Focus: dialogs trap and restore focus; mode changes retain focus on the chosen radio; inspection close stays in the task tool sequence; detached workspace focus returns to its initiating control when reattached or closed.
- Keyboard order: header → identity → workspace modes → task tools → transcript actions → composer → inline workbench. Arrow keys resize the separator; Enter/Space activate controls; Escape closes transient UI.
- Status uses text in addition to color. Reduced motion removes nonessential transitions. Text and controls meet 4.5:1 contrast where WCAG requires it.

## Responsive and native-window contract

The supported inline baseline is 1024×700. At that size the eight identity groups use four columns over two rows; the composer and task tools remain present, and conversation/workbench respect practical minimums. At narrower content widths controls wrap before content is removed. At the native minimum (800×600), identity uses compact two-column disclosure and horizontal control scrolling as the last resort; critical state is never `display: none`.

Recommended native minimums for CLY-78 are 800×600 for the agent window and 640×480 for a workspace-only window. Detached windows must restore onscreen, clamp persisted bounds to the active display, and fall back inline if a second window cannot be created.

## Prototype and evidence boundary

Component coverage lives in `src/features/cly/agent-sessions/agent-sessions-components.test.tsx`. Browser lifecycle, 1024×700 discoverability, mode/intent, reload restoration, session/state, and keyboard paths live in `tests/e2e/agent-sessions.spec.ts`. The actual unpackaged Electron main/preload/window lifecycle supplies route, process-restart, accessibility, and overflow evidence in `tests/e2e/ui-review/electron-review.spec.ts`; its fixture renderer does not claim packaged-build or live-provider coverage. Automated results and the separate expert walkthrough are reported in `docs/CLY_DEV_USABILITY_REPORT.md`.
