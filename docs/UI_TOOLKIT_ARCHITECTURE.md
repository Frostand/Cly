# UI toolkit architecture

The toolkit is layered so feature screens do not depend directly on vendor behavior unnecessarily.

1. `src/features/cly/design-system/` owns motion and design tokens.
2. `components/primitives.tsx` owns Cly buttons, status, dialog, segmented tabs, and feedback.
3. `components/design-system.tsx` owns route-neutral headers, metadata, disclosure, and layout vocabulary.
4. `components/toolkit.tsx` isolates Radix, resizable-panels, TanStack, xterm, and persistence contracts.
5. `screens/` and `agent-sessions/` compose those shared layers.

Dream's existing Base UI/shadcn source remains intact outside Cly. Cly does not import default library styling except xterm and React Flow structural CSS; all visible styling is in `cly.css`.

Persistent UI keys:

- `cly:split:<layout-id>` for panel percentages
- `cly:table:<table-id>:columns` for column visibility

Fixture terminals are read-only xterm instances fed deterministic lines. Production PTY ownership remains in Dream's terminal infrastructure.
