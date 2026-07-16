# Progressive disclosure

Cly preserves capability through four layers:

1. Primary workspace: one dominant route purpose and one primary action.
2. Contextual tools: current mode, selected object, and up to four common quiet actions.
3. Contextual detail: inspector, disclosure, dialog, workbench tab, or popover.
4. Universal access: command palette, shortcuts, object search, and contextual menus.

Secondary actions must remain reachable before visible toolbar actions are removed. The global command palette owns route navigation, object creation, agent/session actions, audits, reports, panel toggles, integrations, and settings. Agent Chat keeps full technical tools in workbench tabs and exposes compact retained test/diff inspection in the agent pane so agent-only mode remains complete. Research routes keep object metadata in a selection-driven inspector.

At 1024px desktop width, the inspector overlays rather than reducing the primary surface below a usable size, low-priority summary metrics are hidden, and secondary toolbar actions may move into overflow. Cly Dev keeps all eight task-identity groups discoverable in a four-column wrap. Composer, task modes/tools, primary table columns, and split-pane minimums remain visible.
