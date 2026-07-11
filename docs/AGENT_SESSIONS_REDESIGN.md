# Agent Sessions redesign

Agent Sessions is now a two-mode research-agent workspace built inside the existing Cly Electron, React, TypeScript, and Zustand architecture.

## What changed

- **Overview** retains session monitoring, history, approvals, presets, progress, outputs, and contextual detail in a denser command-center layout.
- **Chat** adds a full-height Orchestrator conversation and a resizable, persistent workbench.
- Every session has an explicit **Open chat** action. Selecting a row only changes the Overview inspector.
- New sessions capture the goal, Orchestrator provider/model/reasoning, agent-team preset, context pack, approval policy, branch/worktree preference, and budget.
- Delegated agents are modeled as full independent sessions, not reduced-capability stubs.
- The fixture runtime simulates streaming, delegation, terminal output, browser research, live edits, diffs, approvals, failure-ready states, completion, and background progress.

No production model calls, browser automation, PTY subscriptions, file writes, authentication, or billing were introduced.

## Dream infrastructure retained

Cly continues to use Dream's Electron shell, secure preload boundary, project shell, Zustand state model, command palette, persisted UI conventions, terminal/process interfaces, browser boundary, tab concepts, file/diff infrastructure, test stack, and packaging pipeline. Agent Sessions supplies fixture adapters where direct reuse would incorrectly activate production processes or an Electron webview.

## Main feature boundary

`src/features/cly/agent-sessions/` contains domain types, fixtures, service contracts, Overview, Chat, shared configuration flows, workbench surfaces, and tests. The feature is mounted at the existing single `agents` destination.

See [AGENT_SESSIONS_OVERVIEW_MODE.md](./AGENT_SESSIONS_OVERVIEW_MODE.md), [AGENT_SESSIONS_CHAT_MODE.md](./AGENT_SESSIONS_CHAT_MODE.md), and [AGENT_WORKBENCH.md](./AGENT_WORKBENCH.md).
