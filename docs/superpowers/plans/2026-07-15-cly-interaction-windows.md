# Cly Dev Interaction and Windowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define and validate the Codex-familiar Cly Dev task lifecycle, then implement synchronized agent and developer-workspace windows.

**Architecture:** One durable Cly Core session/event reducer is authoritative. The agent window and optional workspace window render role-specific projections and submit idempotent intents; they never synchronize full renderer-local stores. Inline workbench remains the complete baseline and the detachable window is replaceable.

**Tech Stack:** Electron BrowserWindow/IPC, secure preload, React, Zustand projections, TypeScript, Vitest, Playwright Electron E2E.

## Global Constraints

- The primary task works without opening an IDE window.
- Two-window behavior, focus, selection, close/reopen, and cross-window state rules are explicit.
- The agent window remains fully usable when the second window is closed.
- Durable state remains in Cly Core; the developer window is replaceable.
- Approvals and destructive confirmations are owned by the agent window.
- External editor paths must remain inside the active repository/worktree.
- CLY-78 begins only after CLY-74, CLY-75, and CLY-77 are complete.

---

### Task 1: CLY-74 — Codex-like interaction model and tested task workspace

**Files:**
- Create: `docs/CLY_DEV_INTERACTION_MODEL.md`
- Create: `docs/CLY_DEV_USABILITY_REPORT.md`
- Modify: `docs/AGENT_UI_MODEL.md`
- Modify: `docs/AGENT_WORKBENCH.md`
- Modify: `docs/KEYBOARD_SHORTCUTS.md`
- Modify: `docs/ACCESSIBILITY.md`
- Modify: `docs/PROGRESSIVE_DISCLOSURE.md`
- Modify: `docs/UI_MAP.md`
- Modify: `src/features/cly/agent-sessions/types.ts`
- Modify: `src/features/cly/agent-sessions/chat.tsx`
- Modify: `src/features/cly/agent-sessions/overview.tsx`
- Modify: `src/features/cly/agent-sessions/shared.tsx`
- Modify: `src/features/cly/agent-sessions/workbench.tsx`
- Modify: `src/features/cly/cly.css`
- Modify: `src/features/cly/agent-sessions/agent-sessions-components.test.tsx`
- Modify: `tests/e2e/agent-sessions.spec.ts`
- Modify: `tests/e2e/ui-review/electron-review.spec.ts`

**Interfaces:**
- Consumes: existing fixture-backed lifecycle and inline workbench.
- Produces: structured `ClyDevTaskIdentity`, explicit mode/window ownership specification, responsive/accessibility rules, annotated flows, tested prototype, and usability evidence consumed by CLY-78.

- [ ] **Step 1: Write failing identity/prototype tests**

Define the always-visible identity contract:

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

Component tests must assert these groups have accessible labels and remain discoverable at 1024×700 without hiding critical state. E2E must cover start task, approve, inspect diff/test, switch project/session, inline agent-only mode, workspace mode, simulated detach/reattach intent, restart restoration, offline/error/empty states, and keyboard-only completion.

- [ ] **Step 2: Run focused tests to verify RED**

Run:

```bash
pnpm vitest run src/features/cly/agent-sessions/agent-sessions-components.test.tsx
pnpm playwright test tests/e2e/agent-sessions.spec.ts
```

Expected: new identity/state/mode assertions fail before implementation. If app startup fails, fix only the concrete startup defect and record it in the task report.

- [ ] **Step 3: Write the implementation-ready interaction specification**

`docs/CLY_DEV_INTERACTION_MODEL.md` must include:

```text
Hierarchy: project/feature -> task/session -> conversation -> plan/progress -> tool/approval events -> context -> workbench
Always visible: project, repository, branch/worktree, machine, provider/model/reasoning, budget, objective/issue, research impact
Modes: agent-only; agent + inline workspace; agent + detached workspace; external-editor deep link
Flows: start, approve/reject, inspect diff/test, switch project/session, detach, reattach, restart/resume
Window authority: canonical session state in Core; intent ownership; dialog/notification/shortcut routing
States: first-run, empty, loading, streaming, awaiting approval, offline, reconnecting, failed, canceled, interrupted/resumable, unsupported
Accessibility: landmarks, names, live regions, focus transfer/return, keyboard order, reduced motion, contrast
Responsive: supported 1024×700 inline baseline; native window minimums and compact identity disclosure
```

Resolve the `Cmd/Ctrl+Shift+O` conflict by assigning exactly one action and updating every shortcut document and command label.

- [ ] **Step 4: Implement the clickable prototype changes**

Add a task-identity surface, explicit agent-only/workspace mode control, detach/reattach affordances labeled as prototype intents, and truthful empty/error/offline/interrupted states. The composer, conversation, plan/progress, approvals, and diff/test inspection must remain usable without the workbench or external IDE.

- [ ] **Step 5: Conduct and record the usability walkthrough**

Run the exact eight-scenario protocol in a production-like Electron build as a Codex-familiar expert evaluator: start task, recognize identity, send direction, approve an action, inspect test/diff, switch session, detach/reattach prototype, restart/resume. Record timestamp, build commit, environment, success/failure, time-on-task, misclicks, and observations. Fix blocking findings and repeat until all primary scenarios complete without explanatory coaching.

`docs/CLY_DEV_USABILITY_REPORT.md` must distinguish automated evidence from the expert walkthrough and must not claim external participants.

- [ ] **Step 6: Verify CLY-74**

Run:

```bash
pnpm vitest run src/features/cly/agent-sessions src/features/cly/components/app-shell-accessibility.test.tsx electron/preload.test.ts
pnpm playwright test tests/e2e/agent-sessions.spec.ts tests/e2e/ui-review/electron-review.spec.ts
pnpm typecheck
pnpm lint
```

Expected: all focused checks pass; the spec and usability report point to test evidence for every acceptance criterion.

- [ ] **Step 7: Commit CLY-74**

```bash
git add docs src/features/cly/agent-sessions src/features/cly/cly.css tests/e2e
git commit -m "Complete CLY-74 Cly Dev interaction model"
```

---

### Task 2: CLY-78 — Synchronized agent and developer-workspace windows

**Files:**
- Create: `electron/cly-dev-windows.js`
- Create: `electron/cly-dev-windows.test.ts`
- Create: `src/features/cly/agent-sessions/workspace-window.tsx`
- Create: `src/features/cly/agent-sessions/window-sync.ts`
- Create: `src/features/cly/agent-sessions/window-sync.test.ts`
- Create: `tests/e2e/cly-dev-windows.spec.ts`
- Modify: `electron/main.js`
- Modify: `electron/preload.cjs`
- Modify: `electron/preload.test.ts`
- Modify: `electron/app-menu.js`
- Modify: `electron/persisted-state.js`
- Modify: `electron/persisted-state.test.ts`
- Modify: `electron/editors.js`
- Modify: `electron/editors.test.ts`
- Modify: `src/types/ide.ts`
- Modify: `src/app.tsx`
- Modify: `src/features/cly/agent-sessions/chat.tsx`
- Modify: `src/features/cly/agent-sessions/workbench.tsx`

**Interfaces:**
- Consumes: CLY-74 window/interaction contract, CLY-75 canonical revised session snapshots, and CLY-77 live file/diff/terminal/test identities.
- Produces: role-aware window management, intent/snapshot synchronization, persisted/clamped layout, focus/command ownership, and validated VS Code/Cursor deep links.

- [ ] **Step 1: Add failing window-manager and synchronization tests**

Use these contracts:

```ts
export type ClyDevWindowRole = "agent" | "workspace";

export interface WorkspaceIntent {
  mutationId: string;
  sessionId: string;
  baseRevision: number;
  type: "select_file" | "select_diff" | "resolve_approval" | "set_workspace_mode";
  payload: Record<string, unknown>;
}

export interface WorkspaceSnapshot {
  sessionId: string;
  revision: number;
  selectedFileId: string | null;
  selectedDiffId: string | null;
  pendingApprovalIds: string[];
  workspaceMode: "inline" | "detached";
}
```

Assert idempotent `mutationId`, stale `baseRevision` rejection with current snapshot, monotonically increasing revisions, no propagation loop, agent-window ownership of approvals, sender/focused-window command routing, close/reopen behavior, and agent-only operation.

- [ ] **Step 2: Implement role-aware window manager and preload API**

Expose only validated methods:

```ts
getWindowRole(): Promise<ClyDevWindowRole>;
detachWorkspace(input: { sessionId: string }): Promise<void>;
reattachWorkspace(input: { sessionId: string }): Promise<void>;
focusAgentWindow(): Promise<void>;
focusWorkspaceWindow(): Promise<void>;
dispatchWorkspaceIntent(intent: WorkspaceIntent): Promise<{ accepted: boolean; snapshot: WorkspaceSnapshot }>;
onWorkspaceSnapshot(listener: (snapshot: WorkspaceSnapshot) => void): () => void;
```

Never expose BrowserWindow IDs or arbitrary IPC channels. Broadcast only to windows subscribed to the same session.

- [ ] **Step 3: Persist and clamp layout**

Persist `ClyDevWindowLayoutV1` with role, detached state, bounds, display ID, and maximized state. On restore, intersect with current display work areas and clamp missing-display bounds to the primary display. Closing the workspace window must change only presentation state.

- [ ] **Step 4: Implement role-specific renderer composition**

Select the agent or workspace root from `getWindowRole`. Reuse `AgentWorkbench`; do not fork tab behavior. Send intents to Core and replace local state only from revised snapshots. The agent window retains conversation, composer, plan/progress, approvals, context, and an inline-workbench fallback.

- [ ] **Step 5: Add validated external editor targeting**

Extend the editor contract:

```ts
openInEditor(input: { editor: "vscode" | "cursor"; projectPath: string; filePath?: string; line?: number; column?: number }): Promise<void>;
```

Resolve `filePath` under the registered repository/worktree, reject traversal/symlink escapes, and invoke `--goto absolutePath:line:column` only after validation.

- [ ] **Step 6: Add Electron E2E matrix**

Cover detach, synchronized identity, selection from either window, one approval update without loops, independent close/reopen, restart/layout restore, missing display recovery, agent-only use, external editor payload, focus restoration, landmarks/names, keyboard routing, and production minimum sizes.

- [ ] **Step 7: Verify CLY-78**

Run:

```bash
pnpm vitest run electron/cly-dev-windows.test.ts electron/editors.test.ts electron/preload.test.ts electron/persisted-state.test.ts src/features/cly/agent-sessions/window-sync.test.ts
pnpm playwright test tests/e2e/cly-dev-windows.spec.ts
pnpm typecheck
pnpm lint
pnpm test
```

- [ ] **Step 8: Commit CLY-78**

```bash
git add electron src/types/ide.ts src/app.tsx src/features/cly/agent-sessions tests/e2e/cly-dev-windows.spec.ts
git commit -m "Complete CLY-78 synchronized Cly Dev windows"
```
