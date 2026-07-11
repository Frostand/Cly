# Agent UI model

The shared model lives in `src/features/cly/agent-sessions/types.ts`.

Core entities are:

- `AgentSession`
- `AgentIdentity`
- `AgentPermissions`
- `AgentTask`
- `AgentMessage`
- `AgentApproval`
- `WorkbenchTab`
- `LiveFileEdit`
- `AgentSessionsViewState`

The existing Cly Zustand store owns mode, selected sessions, Overview filter/sort/search, session creation, drafts, transcripts, agent configuration, approval state, workbench tabs, split layout, and runtime controls. No competing global state library was added.

URL state uses `/agent-sessions?mode=overview` and `/agent-sessions?mode=chat&session=<id>`. Invalid session links safely return to Overview.

Local persistence records the last valid mode and selection, Overview settings, tab state/order, active/pinned tabs, collapsed/maximized state, split width, and drafts.
