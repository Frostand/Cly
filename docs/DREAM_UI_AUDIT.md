# Dream UI Audit for the Cly Research Shell

Audit date: 2026-07-11. Baseline: Cly `main` at Dream-derived version `0.5.0`.

## Conclusion

Dream is a strong desktop platform but its default renderer is an IDE/chat workspace. Cly retains the platform and component infrastructure while replacing the default renderer composition with a research-first shell. No Swift rewrite is warranted.

## Architecture inventory

| Area | Dream implementation | Classification | Cly decision |
|---|---|---|---|
| App entry | `src/main.tsx`, `src/app.tsx` | reuse with redesign | Keep React/Vite mount and theme provider; render `ClyAppShell`. |
| Electron main | `electron/main.js` | reuse unchanged | Retain lifecycle, secure navigation, theme, IPC, process managers, and renderer server. |
| Window chrome | `electron/main.js`, `src/components/ide/header/*` | reuse with redesign | Retain hidden inset macOS window and native controls; replace project-tab header with research command bar. |
| Application menu | `electron/app-menu.js` | replace | Cly menus now expose File, Research, Agents, View, Integrations, Window, and Help commands. |
| Renderer navigation | local component state and `src/components/ide/workspace/*` | replace | Cly uses typed `ScreenId` navigation and grouped research destinations. |
| State management | Zustand in `src/components/ide/ide-store.ts` | retain as backend infrastructure | Dream store remains for future adapters. Cly UI prototype uses a focused Zustand store and mock repository. |
| Persistence | `electron/persisted-state.js`, worker queue, SQLite | retain as backend infrastructure | No fixture domain data is written yet. Phase 2 will map Cly services to project-scoped persistence. |
| UI primitives | `src/components/ui/*`, Tailwind, lucide-react | reuse with redesign | Retain runtime and utility stack. Cly adds a restrained token layer and research-specific primitives. |
| Chat and agents | `src/components/ide/chat/*`, `electron/api/chat/*` | retain as backend infrastructure | Hidden from the main shell; future `AgentService` will wrap Dream providers with context/provenance controls. |
| Terminal/processes | `terminal-panel.tsx`, `electron/process-sessions.js` | reuse with redesign | Concept becomes the collapsed Activity drawer; raw terminal sessions remain available for Phase 2. |
| Browser panel | `browser-panel.tsx`, `electron/browser-sessions.js` | defer | Not a primary research destination. Retained for safe external workflows where needed later. |
| Git/changes | `changes-panel.tsx`, `electron/api/project-git-*` | retain as backend infrastructure | Hidden as IDE chrome; consumed later by provenance and reproducibility adapters. |
| File explorer | `file-explorer-panel.tsx` | defer | Raw file browsing is not top-level product navigation; Code Linker and source/project pickers replace the default surface. |
| Diff viewer | `diff-viewer.tsx`, `@pierre/diffs` | defer | Retained for code-review and artifact-version details. |
| Settings | `settings-dialog.tsx`, `src/lib/ui-store.ts` | reuse with redesign | Cly has a full Settings destination; legacy appearance/provider logic remains available for adapter work. |
| Internationalization | `next-intl`, `src/i18n/*` | defer | Existing catalogs remain but the prototype is English-first. |
| Testing | Vitest, RTL, Playwright | reuse unchanged | Expanded for Cly logic, components, workflows, responsive screenshots, and large fixtures. |
| Packaging | electron-builder scripts and `package.json` | reuse unchanged | Existing `package:dir` and `package:mac` paths remain authoritative. |
| Updater | `electron/updater.js` | reuse unchanged | Cly-owned release coordinates and opt-in feeds remain isolated from Dream. |
| Research panel vertical slice | `src/features/research/*` | retain as backend infrastructure | Earlier source/claim persistence foundation remains; the prototype service layer will replace fixtures incrementally. |

## Removed or hidden IDE-oriented surfaces

- Multi-chat columns, project tabs, chat history rail, file explorer, changes, embedded browser, and terminal are no longer the default composition.
- These files were not deleted. They remain useful implementation infrastructure and upstream-merge reference points.
- The main navigation now organizes research objects and integrity workflows rather than editor tools.

## Reuse boundary

Dream core changes are limited to renderer composition, Cly menus, and one preload menu-event subscription. Cly-owned UI code lives under `src/features/cly`. This keeps future upstream merges reviewable.

## Known inherited constraints

- Electron currently uses `sandbox: false` for native-module compatibility.
- The preload namespace remains `window.dream` for compatibility.
- The old IDE renderer remains compiled by TypeScript but is no longer imported by the main Cly bundle.
- Real project scanning, notebooks, agents, integrations, and research persistence remain Phase 2 service work.
