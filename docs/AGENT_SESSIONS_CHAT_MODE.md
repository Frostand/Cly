# Agent Sessions Chat Mode

Chat is the active working environment.

The compact header contains the mode switcher, session switcher, Orchestrator and connection state, model, reasoning, context pack, delegated-agent count, branch, elapsed time, usage, approvals, team configuration, pause, stop, and archive actions.

The main layout is:

```text
Orchestrator conversation | draggable divider | tabbed workbench
```

The conversation supports user, Orchestrator, reasoning, tool, delegation, agent-update, approval, warning/error-ready, artifact, research-link, and system message types. Tool output is collapsible; artifacts and research actions are actionable fixture controls.

The composer is always visible and scroll-safe. It persists drafts, supports Cmd/Ctrl+Enter, configurable Enter behavior, attachments, research-object mentions, slash commands, model/reasoning/agent-plan controls, context budget details, send, and stop-generation state.

Entering Chat without a valid session shows a focused new-session surface and recent-session picker rather than a blank workspace.
