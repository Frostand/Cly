# Workbench tab architecture

`WorkbenchTab` provides a common shell with an ID, type, title, pin state, and discriminated fixture state. Each tab type owns its visual and interaction language.

Backend-facing contracts live in `agent-sessions/services.ts`:

- `AgentRuntimeService`
- `AgentOrchestratorService`
- `AgentTranscriptService`
- `SessionService`
- `WorkbenchTabService`
- `BrowserService`
- `TerminalService`
- `DiffService`
- `LiveFileService`
- `ApprovalService`
- `ContextService`
- `LayoutPersistenceService`

Future integrations should implement those interfaces using Dream's process sessions, browser sessions/WebContentsView boundary, Git diff services, file watchers, chat providers, and persisted Electron state. Tests must continue to inject fake streams rather than real subscriptions.
