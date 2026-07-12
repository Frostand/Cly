# Visual experience audit

Baseline: real Electron captures in `artifacts/ui-review/motion-before/` at 1024×700, 1280×800, 1440×900, and 1728×1117. Cly already had strong dark-theme foundations, compact navigation, and clear route boundaries. The main opportunity was to replace repeated prose and isolated numbers with a small data-derived visual language while preserving the continuous workspace.

| Route | Primary purpose / dominant surface | Baseline problems | Useful visual / clarifying motion | Avoid | Simplification strategy |
|---|---|---|---|---|---|
| Overview | orient to research state | five isolated metrics, long claim/risk rows, unclear phase | lifecycle path, evidence trends, activity insertion | dashboard chart grid | make lifecycle dominant; keep one action and one timeline |
| Agent Sessions Overview | select and monitor sessions | progress is present but team/routing is secondary | compact progress, team marks, state transition | pulsing every running row | animate only state changes and approval arrival |
| Agent Sessions Chat | converse while agents work | dense header, delegation is textual until topology tab | spatial mode transition, topology handoff, streamed insertion | continuous animated edges | conversation stays dominant; workbench holds technical detail |
| Context | build an agent context pack | ring shows total but not category contribution | stacked token-budget segments, reordering feedback | rolling token counters | show contribution and capacity; keep raw details in preview |
| Research Graph | trace evidence relationships | readable graph, but all relationships have equal visual weight | neighborhood focus, semantic edge states | animation on every edge | selected path is emphasized; tools remain contextual |
| Experiments | compare experiments and runs | metric strip is static; large empty area below small fixture table | run sparklines, status trend, selected-run analysis | replaying charts on load | table stays primary; visuals explain comparison only |
| Sources | organize and link sources | rows are recognizable only by text; no preview until selection | source-type mark, extraction/relevance state, preview transition | cover-gallery layout | compact table plus contextual preview |
| Literature | compare methods and claims | matrix is dense and horizontally constrained | relevance intensity and evidence markers | card conversion | matrix remains primary; hidden columns stay discoverable |
| Notebooks | inspect notebook integrity | outline is prose-like and cell structure is invisible | execution strip and issue markers | full notebook editor | show structure first; details and actions below |
| Code Linker | understand code-to-research purpose | metadata list does not convey the relationship chain | objective → method → code → runs → claims | decorative dependency graph | one compact chain plus selectable file list |
| Claims | assess evidence and readiness | confidence bar lacks support/contradiction semantics | evidence-strength balance | scientific-looking precision without labels | label assessment and show evidence counts with confidence |
| Provenance | trace artifacts to evidence | lineage is already primary; repeated rows need stronger state | shared relationship path and path tracing | invented lineage or decorative flow | preserve explicit chain and make broken/manual states dominant |
| Reproducibility | prioritize audit findings | circular score and metric boxes duplicate status information | risk distribution plus actionable list | gamification or confetti | compact summary, finding list remains dominant |
| Decisions | understand research choices over time | timeline is good but branch/supersession is subtle | insertion and supersession focus | animated history replay | keep chronological structure and disclose alternatives |
| Next Steps | decide what to do next | many attributes and actions compete in each row | impact/effort position and state movement | kanban conversion | keep prioritized list; reveal secondary actions contextually |
| Integrations | manage capabilities | grouped content is clear but connection states are text-heavy | connection/sync state transition | animated provider-card wall | compact rows and dialogs only |
| Models & Agents | configure models and presets | configuration details compete with selection | usage feedback and topology preview | AI-brain decoration | table/list selection drives one configuration surface |
| Settings | change preferences | calm and appropriate | category fade and save confirmation | charts or ambient animation | retain native preference rows |

## Cross-route findings

- P1: meaningful state was often expressed by repeated helper sentences rather than a visual summary.
- P1: Context could not show which categories consumed the budget.
- P1: notebook cell structure and code-to-research relationships were not scannable.
- P2: route changes were abrupt and provided no spatial continuity.
- P2: several compact fixtures left large dead areas at 1440px and above.
- P2: metrics used identical boxes even when a trend or distribution was the real question.
- P3: some secondary actions remain visible where a later overflow consolidation may be preferable.

No baseline P0 clipping or horizontal-overflow defect was found by the Electron review metrics.
