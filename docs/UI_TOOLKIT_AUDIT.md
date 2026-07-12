# UI toolkit audit

Cly uses pnpm (`pnpm-lock.yaml`, `pnpm-workspace.yaml`). Renderer libraries are build-time dependencies because Vite bundles them into the Electron renderer.

| Requested tool | Existing/equivalent | Decision | Package | Real Cly use | Risk/migration |
|---|---|---|---|---|---|
| Radix primitives | Dream uses Base UI and editable shadcn source | Add only Cly-owned Dialog, Toggle Group, Tooltip, Dropdown | `@radix-ui/react-*` | shared Dialog, segmented views, title tooltip, graph menu | Dream legacy remains Base UI; do not mix inside one component |
| shadcn source | Already extensive under `src/components/ui` | Retain; do not reinitialize | `shadcn` | Dream infrastructure; Cly styling remains feature-owned | default shadcn visuals are not used as Cly design |
| Resizable panels | Manual pointer/grid split | Replace with shared persisted wrapper | `react-resizable-panels` | Agent Chat, Context | route-specific minimum widths required |
| TanStack Table | Fixed HTML tables | Add shared sortable keyboard table | `@tanstack/react-table` | Sources, Experiments, Runs | remaining comparison routes migrate incrementally |
| TanStack Virtual | Hand-written virtual window | Replace large-list path | `@tanstack/react-virtual` | Next Steps large fixture | dynamic row measurement remains future work |
| React Flow | Hand-positioned SVG/DOM graph | Replace real graph canvas | `@xyflow/react` | Research Object Graph | 2k/5k fixture needs clustering beyond current 60/120 render cap |
| xterm.js | Already installed and used by Dream | Retain/consolidate | existing xterm + fit/web-links | Agent terminal fixture now uses xterm | tests use fake lines, not PTY subscriptions |
| Motion | Already installed | Retain; add Cly tokens | existing `motion` | toast insertion/removal | reduced motion respected |
| Lucide | Already primary icon family | Retain | existing `lucide-react` | all Cly routes | material icon theme remains file-type infrastructure only |
| cmdk | Already installed, underused in Cly | Replace manual command list | existing `cmdk` | global command palette | preserve Electron shortcuts/focus |
| Playwright Electron | Already configured | Extend existing real-Electron review | existing `@playwright/test` | route/Agent workflows and screenshots | browser tests remain supplemental |
| Storybook | Missing | Add minimal Vite setup + a11y | Storybook 10 | Cly toolkit stories | story interaction coverage can expand |
| Accessibility | No automated axe pass | Add Electron axe helper | `@axe-core/playwright` | repo-local accessibility skill | color contrast also requires manual review |

No second icon, terminal, animation, browser automation, or lockfile was added.

`pnpm audit --prod` initially reported two moderate transitive issues and one low issue. Workspace overrides move `postcss` to 8.5.10 and `js-yaml` to the compatible 4.3.0 release. One low `@babel/core` advisory remains through `next-intl > next > styled-jsx`; the audit-requested patched 7.29.1 release is not published in the configured registry, and forcing Babel 8 across that dependency graph would be a higher compatibility risk.
