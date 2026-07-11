# Delegated Agent model

A Delegated Agent is a full independent agent session. Its subordinate behavior comes from Orchestrator task routing and coordination—not reduced model capability.

Every Orchestrator and Delegated Agent exposes:

- identity and user-facing role;
- provider, model, and reasoning level;
- task and runtime state;
- explicit context pack and access mode;
- tools and file/network/command permissions;
- approval policy;
- repository branch or isolated worktree;
- transcript, outputs, usage, elapsed time, and reporting destination.

Supported context modes are full-project availability, explicit pack, inherited Orchestrator context, task-scoped context, isolated context, and additional pinned context. The UI never implies that every agent automatically receives the repository or full research history.
