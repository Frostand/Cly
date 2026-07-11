# Dream UI Audit for the Cly Research Shell

Audit date: 2026-07-11. Baseline: Cly at version `0.5.0`.

**Note:** Dream IDE is an implementation component providing the coding workspace (editor, terminal, git, notebooks). It is not the foundation of the product. The research core — graph, sources, claims, provenance, and agent orchestration — is independent of Dream and will remain so.

## Conclusion

Dream provides capable desktop infrastructure and UI primitives for the current implementation phase. Cly uses Dream for the coding workspace layer while keeping the research core independent. As the product matures, the coding workspace layer may be replaced or supplemented with other editor integrations.

## Architecture inventory

| Area | Implementation | Classification | Cly decision |
|---|---|---|---|
| App entry | `src/main.tsx`, `src/app.tsx` | reuse with redesign | Keep React/Vite mount; render `ClyAppShell`. |
| Electron main | `electron/main.js` | reuse unchanged | Retain lifecycle, secure navigation, theme, IPC. |
| Window chrome | `electron/main.js` | reuse with redesign | Retain hidden inset macOS window; replace IDE header with research command bar. |
| Application menu | `electron/app-menu.js` | replace | Cly menus expose File, Research, Agents, View, Integrations, Window, and Help. |
| Renderer navigation | Dream IDE workspace components | replace | Cly uses typed `ScreenId` navigation and grouped research destinations. |
| State management | Zustand stores | retain | Cly uses focused Zustand stores for research state; Dream stores remain for future adapters. |
| Persistence | SQLite, worker queue | retain as infrastructure | Phase 2 will map Cly services to project-scoped persistence. |
| UI primitives | Tailwind, lucide-react, shadcn-style | reuse | Cly adds research-specific tokens and primitives. |
| Chat and agents | Dream chat/providers | retain as infrastructure | Future `AgentService` will wrap providers with context/provenance controls. |
| Terminal/processes | Dream terminal sessions | reuse with redesign | Concept becomes Activity drawer; raw terminal available in coding workspace. |
| Git | Dream Git routes | retain as infrastructure | Consumed by provenance and reproducibility adapters. |
| Testing | Vitest, RTL, Playwright | reuse unchanged | Expanded for Cly logic, components, and workflows. |
| Packaging | electron-builder | reuse unchanged | Existing build paths remain. |
| Updater | electron-updater | reuse unchanged | Cly-owned release coordinates. |
| Research panel | `src/features/research/*` | retain as foundation | Earlier source/claim persistence foundation remains. |

## Cly-owned code

All research platform code lives under `src/features/cly/`:

- `domain/` — shared types and deterministic UI logic
- `fixtures/` — normalized fixture repository for development
- `services/` — typed service contracts and mock implementations
- `store/` — shared session state and cross-feature mutations
- `components/` — shell, navigation, primitives
- `screens/` — all research, integrity, agent, and settings workspaces

## Reuse boundary

Cly changes Dream infrastructure only for renderer composition and menus. Research code depends on typed service interfaces, not on Dream internals. This keeps the coding workspace replaceable and external editor integrations viable.
