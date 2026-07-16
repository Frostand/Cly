# Agent workbench

The inline Chat workbench is resizable, collapsible, maximizable, keyboard reachable, and persisted per session. It is an optional projection: conversation, composer, plan/progress, approvals, context, and compact test/diff inspection remain usable when the workbench is hidden.

Implemented tab surfaces:

- **Browser:** secure fixture adapter with navigation, address input, article/paper content, source capture, citation capture, and external-open boundary.
- **Terminal:** read-only fake PTY stream with process, cwd, status, clear, restart, and find controls.
- **Code Diff:** changed-file navigation, unified/split state, risk and research links, approve/request-revision state, and agent trace actions.
- **Agents:** tiled live sessions and topology views with model, reasoning, context access, task, permissions, worktree, transcript, usage, status, progress, steering, and configuration.
- **Live Files:** read-only file observation with changed ranges, follow-agent, auto-scroll, diff overlay, edit timeline, and corresponding-diff navigation.

Tabs can be opened, selected, closed, dragged/reordered, duplicated, pinned, unpinned, and moved through their tab menus. Agent-only and inline modes work in the prototype. Detach, reattach, and external-editor controls are explicitly labeled prototype intents; native window creation and deep-link execution remain CLY-78 service capabilities. Cly Core, not either renderer, owns canonical tab and session state.
