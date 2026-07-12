# Cly UI visual refactor completion report

Date: 2026-07-12

## Outcome

The full 17-route Cly shell now uses one visual system and route-appropriate workspace patterns. Existing React, TypeScript, Electron, fixtures, data models, service boundaries, routes, and product behaviors remain intact.

## Primary problems found

The audit counted 141 `Panel`, 102 `Badge`, 36 `Metric`, and 61 `Section` references in route modules. Shared styling gave lists, reports, matrices, settings, timelines, and graphs the same rounded bordered treatment. The inspector reserved empty space, topbar controls competed equally, metadata appeared as pills, and grid helpers turned provider/preset/pack/task collections into card catalogs.

## Shared system changes

- Added semantic V2 surfaces, density, spacing, focus, and motion tokens.
- Made panels borderless groups by default with explicit raised/selected variants.
- Converted badges to dot-led text status indicators.
- Added workspace/pane headers, toolbars, inline metadata, progress/risk indicators, disclosure rows, accessible split panes, outline views, skeletons, search, and virtualization.
- Simplified titlebar utilities into a clear primary action and overflow menu.
- Closed the global inspector unless a meaningful object is selected.
- Reworked sidebar selection and counts into a quieter native desktop hierarchy.

## Route summary

Overview is a project brief; Context is a dense selector/budget workspace; Graph owns a dominant canvas; Experiments, Sources, and Literature are comparison-first; Notebooks and Code Linker use outline/detail patterns; Claims uses a compact audit board; Provenance defaults to lineage; Reproducibility reads as an audit report; Decisions is a continuous timeline; Next Steps is a ranked list; Integrations is a provider catalog; Models uses a preset/topology split; Settings uses native preference rows. Agent Sessions keeps its specialized transcript and workbench while inheriting the calmer shell.

## Menus and controls

Create/save/start/accept/configure remain primary actions. Secondary utilities are quiet buttons or overflow actions. Filters and view modes stay local to their collection. Every exercised control either updates fixtures, navigates, or presents an honest prototype message.

## Accessibility

V2 adds consistent focus-visible treatment, semantic headings/lists/tables, text-backed statuses, labeled regions, keyboard split resizing, named progress/search controls, reduced-motion support, and automatic removal of the empty inspector landmark.

## Tests and screenshots

- 40 Vitest component, store, logic, route, and Agent Sessions tests pass.
- 11 Playwright navigation, workflow, Agent Sessions, responsive, visual-system, inspector, state, and large-fixture tests pass.
- 56 V2 screenshots cover every route at large/narrow desktop sizes, all data-route empty states, relevant error states, inspector open/closed, and the 500-item recommendation fixture.
- Browser checks found no document-level horizontal overflow at 1024 or 1728 px.

## Performance

The fixture contract covers 1,000 sources, 1,000 runs, 500 claims, 100 notebooks, 2,000 graph nodes, 5,000 graph edges, 500 artifacts, 500 decisions, and 500 recommendations. Next Steps windows the 500-row collection and mounts fewer than 30 rows. Table routes use bounded scroll regions, sticky headers, and preview caps where appropriate.

On the final local Node 22 run, large-fixture creation took 3.29 ms, filtering/sorting 500 claims took 0.15 ms, and prioritizing 500 recommendations took 8.87 ms. These are local deterministic fixture measurements, not production backend or GPU benchmarks.

## Verification commands

```bash
pnpm biome check --write <changed files>
pnpm lint
pnpm typecheck
pnpm test -- --run
pnpm test:e2e
pnpm vite:build
pnpm package:dir
pnpm electron:dev
```

## Remaining visual inconsistencies

Agent Sessions deliberately retains a denser specialized component vocabulary. Some legacy route markup still names `Panel` even though V2 renders it as semantic grouping. A few low-frequency fixture forms use inline layout styles. These are cleanup opportunities, not visible acceptance blockers.

## Recommended next polish

Run VoiceOver and measured contrast audits on the packaged application, normalize the remaining inline layout styles, add CI-owned pixel baselines, and add a virtual table primitive when production persistence replaces bounded fixtures.
