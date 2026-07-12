# Terminal UI architecture

Dream already owns the production xterm/PTY path in `src/components/ide/terminal-panel.tsx`. Cly reuses the same xterm packages through `ClyTerminal` for Agent workbench terminal tabs.

The Cly fixture is read-only, loads Fit and Web Links addons, responds to container resize, and disposes the terminal on unmount. Automated tests provide deterministic fake process lines. Do not start real provider subscriptions or shell processes in component tests.
