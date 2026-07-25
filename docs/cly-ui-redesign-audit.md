# Cly UI/UX redesign audit

Date: 2026-07-16
Branch: `redesign/cly-ui-ux-v2`
Baseline screenshots: `artifacts/ui-review/cly-ui-v2-before/`

## Product and technical baseline

Cly is an Electron desktop application built with React 19, TypeScript, Vite,
Zustand, Radix UI wrappers, TanStack Table/Virtual, React Flow, xterm, Hono,
SQLite, and Drizzle. The main renderer uses one Zustand-driven application
shell rather than URL routes. Research data is loaded through typed service and
API-client boundaries; project-scoped authorization and mutations remain in the
local service. The package manager is pnpm. Biome, TypeScript, Vitest,
Playwright Electron, axe, and electron-builder provide the existing quality
gates.

## Existing information architecture

- Global title bar: project switcher, command search, product/phase status,
  activity, local state, notifications, contextual creation, inspector, and
  settings.
- Product switcher: Research and Dev.
- Research navigation: Workspace, Research, Integrity, and System groups with
  22 destinations.
- Dev navigation: Development, Execution, Delivery, and System groups.
- Main workspace: shared page header, route-owned content, optional activity
  drawer, and selection-driven inspector.
- Complex work uses tables, continuous sections, split panes, timelines,
  graphs, and an agent chat/workbench.

## Primary user workflows

1. Understand project state and choose the next research action.
2. Prepare the exact context an agent receives, then start or resume a session.
3. Collect sources, compare literature, inspect notebooks/code, and connect
   evidence to claims.
4. Define, run, and compare experiments while tracing cost and provenance.
5. Audit claims, data obligations, reproducibility, and pull-request impact.
6. Record decisions, prioritize next steps, and build reviewer evidence
   packages.
7. Configure local harnesses, agent presets, integrations, privacy, and
   appearance without interrupting research work.

## Main UX problems

### P1 — global and contextual actions compete

The title bar always presents a purple **New** button even though routes such as
Claims, Experiments, Sources, and Decisions already expose a specific primary
action. On those screens the same workflow has two entry points with different
labels and behavior. On unrelated screens **New** opens the command palette,
so its outcome is not predictable.

### P1 — the title bar mixes too many responsibilities

Product, project phase, activity, local status, placeholder notifications,
creation, inspector, and settings all compete with command search. Research/Dev
is already controlled in the sidebar, phase is visible in the project overview,
and notifications currently only produce an informational toast. This makes
the shell feel busier than the work it contains.

### P1 — settings are not predictably reachable

System destinations are the last items in a long scrolling navigation column.
At 1440×900 the Settings destination is below the fold, while a second Settings
control appears in the title bar. Account/configuration destinations should be
stable but visually separate from project work.

### P2 — navigation is organized partly by implementation domain

“Research” contains graphs, execution, costs, sources, literature, notebooks,
code, and claims; “Integrity” contains both audits and downstream planning.
The groups are internally valid but do not fully describe the sequence users
follow from direction → work → evidence → review. Labels also vary between the
sidebar and page titles (for example Claims / Claim Audit Board and Sources /
Source Manager).

### P2 — density and hierarchy vary by route

The shared shell and mature routes are restrained, but secondary configuration
screens still use broad panels with large unused areas. Some legacy route CSS
is spread across multiple cascade layers (`components`, `v2`, `v3`, and `v4`),
which makes visual ownership harder to reason about and raises regression risk.

### P2 — narrow behavior is desktop-minimum behavior, not mobile navigation

The production main window currently enforces a 1024×700 minimum. CSS collapses
the sidebar below 620px, but the primary Electron window cannot reach that
state. The redesigned shell should remain robust at 1024px and treat smaller
renderer widths as graceful fallback rather than implying a separate mobile
product.

## Component inconsistencies

- Title-bar actions duplicate `PageHeader` actions and use a vague global label.
- The same Settings destination exists in two navigation regions.
- Placeholder utility buttons look equally important as real state and work.
- Some route-specific styles override the shared button/header/shell rules in
  later cascade layers.
- A few configuration panels use inline spacing where shared tokens already
  exist.

## Layout and responsive problems

- Long research navigation requires scrolling before system destinations are
  visible.
- At 1024px the title bar has limited room for project identity, search, and up
  to eight controls; search disappears before lower-value controls do.
- Table routes contain horizontal overflow locally, but their row content needs
  deliberate truncation and selection access at narrow widths.
- The inspector correctly becomes an overlay below 1180px, but its trigger is
  shown even when nothing is selected.

## Accessibility problems and risks

- Core semantics, focus rings, dialog behavior, table sorting, split
  separators, status text, and reduced motion are already implemented.
- Repeated creation controls increase keyboard traversal and make the primary
  action ambiguous.
- The title-bar inspector control is actionable with no selection and responds
  only with a toast; a disabled or absent control is more honest.
- Collapsed sidebar icon labels rely on native `title`; shared tooltips would be
  more consistent, but accessible names are present.
- Manual VoiceOver verification is still required for graph nodes, dense data
  tables, the command palette, and Agent Sessions.

## Backend and API constraints

- Research mutations are project-scoped and must continue through
  `projectServices`, the Zustand store, and typed local API routes.
- Authentication, local-service tokens, capability checks, approval gates, and
  provenance enforcement must remain server-side.
- The redesign does not require schema, API, migration, or authorization
  changes. UI controls that currently represent unavailable capabilities must
  remain disabled and explain why.
- The shell is state-routed rather than URL-routed, so browser deep links are not
  currently available to preserve or extend in this pass.

## Proposed information architecture

- Keep one global title bar with only project context, command search, live agent
  activity when relevant, local-state access, and the contextual inspector.
- Keep Research/Dev switching in the sidebar; remove duplicate product and
  phase badges from the title bar.
- Make every route own its one specific primary action. Remove global **New**.
- Keep project work in the scrolling navigation and move Settings to a stable
  footer position. Keep Integrations and Models & Agents under a clearly
  separated Configuration group.
- Rename groups around intent: **Project**, **Evidence**, **Review**, and
  **Configuration** while preserving every destination and test identifier.
- Keep the existing selection-driven inspector, split panes, tables, timelines,
  and graph patterns. Do not introduce a dashboard card grid.

## Screens and components in scope

- `ClyAppShell`, `Titlebar`, `Sidebar`, project switcher, navigation grouping,
  and responsive shell styles.
- Shared `WorkspaceHeader`, button, focus, status, and toolbar presentation where
  needed for consistency.
- Overview, Claims, Agent Sessions, and Settings as representative primary,
  table, empty-state, and configuration workflows.
- All major routes through shared shell changes and visual-regression capture.

## Features that must remain intact

- All 22 Research destinations and all Dev destinations.
- Research/Dev product switching, project switching, command palette, keyboard
  shortcuts, activity drawer, inspectors, fixture tooling, and theme palettes.
- Agent session creation/resume, context composition, evidence/claim links,
  experiments, costs, provenance, audits, decisions, next steps, integrations,
  models, settings, and reviewer capsule workflows.
- Existing project-scoped persistence, typed API contracts, permission checks,
  approvals, analytics behavior, and database migrations.

## Baseline verification

The real Electron app was captured at 1024×700, 1280×800, 1440×900, and
1728×1117 across 17 representative routes. The review runner reported no
console warnings/errors and no document-level horizontal overflow. High-value
baseline images include Overview, Agent Sessions, Claims, Settings, Sources,
Research Graph, and Reproducibility in the baseline artifact directory.
