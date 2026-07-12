# Cly application shell V2

## Structure

The shell remains `Titlebar + Sidebar + Workspace + contextual Inspector + ActivityDrawer`. V2 changes hierarchy, not architecture.

- The 44 px titlebar carries project identity, global command search, agent activity, one primary create action, contextual inspector control, and an overflow menu.
- The sidebar keeps the Workspace, Research, Integrity, and System groups. Counts are quiet text and the selected route uses a narrow rail plus a low-contrast surface.
- The workspace is a continuous surface with compact route headers and route-specific information patterns.
- The inspector is mounted only when an entity is selected and the current route can use it. Agent Sessions retains its own workbench instead of the global inspector.
- Activity remains a temporary drawer opened with `Cmd+J`.

## Inspector contract

The previous shell could reserve inspector width even with no selection. V2 derives effective state from `inspectorOpen && selectedId && activeScreen !== "agents"`.

- No selection: inspector is closed and no blank column is mounted.
- Selection: inspector opens with the selected object.
- Dismissal: selection clears and the workspace regains the width.
- The titlebar inspector action explains “Nothing selected” rather than opening an empty pane.

## Width behavior

- Large desktop: full sidebar and optional inspector.
- 1024 px desktop: route grids collapse or hide low-priority metadata; the workspace remains horizontally contained.
- Sidebar collapse preserves icon navigation and tooltips.
- Tables and canvases own their scroll/clip boundary instead of expanding the document.

## Action hierarchy

`New` is the persistent primary action. Fixture state remains directly available because this is a development prototype. Local status, notifications, settings, and secondary application actions moved into the titlebar overflow menu. Search remains the command-palette entry point.

## Persistence and shortcuts

Existing Zustand persistence and shortcut behavior are unchanged. The shell continues to support route shortcuts, `Cmd+K`, `Cmd+J`, `Cmd+Alt+I`, sidebar collapse, Escape dismissal, and restored fixture/theme preferences.
