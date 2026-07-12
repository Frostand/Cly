# Cly UI V2 migration plan

## Completed phases

1. Audit every route and shared primitive before route edits.
2. Introduce semantic surface, spacing, density, focus, and motion tokens.
3. Add V2 headers, metadata, status, progress, disclosure, split, outline, skeleton, search, and virtualization primitives.
4. Refine the titlebar, sidebar, workspace, contextual inspector, menus, drawer, and overlays.
5. Apply an explicit route layout pattern to all 17 routes.
6. Add component, route, workflow, responsive, error, empty, inspector, and large-fixture coverage.
7. Document the system and package/launch verification.

## Migration matrix

| Route | Old pattern | V2 pattern | Replaced/refined components | Tests | Status |
| --- | --- | --- | --- | --- | --- |
| Overview | Metric/card dashboard | Project brief + integrity scan | header, metric strip, direction cards, activity | route, E2E, large/narrow/empty/error image | Complete |
| Agent Sessions | Purpose-built V2 workspace | Preserved transcript/workbench | shared shell controls only | component, full workflow, state images | Complete |
| Context | Panel list + pack cards | Dense selector + sticky budget + pack rows | context panels, pack grid, budget framing | route action, large/narrow/empty image | Complete |
| Graph | Boxed canvas | Dominant canvas + trace rail | outer panels, toolbar surface | node flow, large/narrow/empty image | Complete |
| Experiments | Tables among cards | Table-first comparison workspace | metric/panel framing | compare flow, large/narrow/empty image | Complete |
| Sources | Table plus action cards | Continuous source table + inspector | metric/panel framing | source open, filter/action, images | Complete |
| Literature | Matrix plus cards | Matrix-first evidence workspace | section/panel framing | navigation, matrix and state images | Complete |
| Notebooks | Nested split panels | Outline/audit split | selected-detail framing | import/scan flow and images | Complete |
| Code Linker | Settings-like panels | File outline + purpose detail | selected-detail framing | route/state images | Complete |
| Claims | Badge-heavy cards | Compact audit board/table | claim cards, badges, inspector behavior | claim workflow, inspector/state images | Complete |
| Provenance | Gallery-card default | Lineage default | default view, chain surface | route/state images | Complete |
| Reproducibility | Metric/finding cards | Audit report + grouped findings | panels, statuses, callouts | audit flow, state images | Complete |
| Decisions | Card timeline | Continuous chronology | timeline panels and metadata | create flow, state images | Complete |
| Next Steps | Recommendation card grid | Ranked action rows | grid/cards, status pills | accept flow, virtualization, images | Complete |
| Integrations | Three-card catalog | Provider rows | catalog cards, capability pills | setup actions, state images | Complete |
| Models & Agents | Preset card grid | Preset list + topology detail | preset cards and controls | preset flow, state images | Complete |
| Settings | Form panels | Native preferences | panels and section framing | navigation, large/narrow image | Complete |

## Compatibility strategy

Legacy primitives remain as adapters while route code is progressively made more semantic. The V2 cascade layer intentionally overrides shared legacy presentation without changing data or service contracts. A later cleanup may remove dead legacy CSS only after screenshot parity and Electron packaging remain stable.

## Next polish pass

- Replace the remaining inline style objects with named V2 variants.
- Add dedicated virtual table support if production datasets exceed fixture sizes.
- Run screen-reader and contrast audits on packaged macOS builds.
- Establish pixel-baseline approval in CI once font rendering is stable across runners.
