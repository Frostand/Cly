# Cly UI organization audit

| Route | Primary task and object | Default organization | Polish outcome |
| --- | --- | --- | --- |
| Overview | Understand project state | Research question/hypothesis, integrity list, next action, activity | Preserved research content; reduced header footprint globally |
| Agent Sessions | Find or continue a session | Compact session list + contextual session inspector | Full titles restored; low-priority metadata moved from rows |
| Agent Chat | Direct an Orchestrator | Conversation + composer + workbench | Header metadata disclosed; modal/menu keyboard behavior fixed |
| Context | Decide what an agent receives | Context rows + budget + selected list + packs | Denser rows; advanced item actions collapsed |
| Graph | Inspect linked research | Dominant canvas + trace rail | Header copy shortened; canvas remains primary at every size |
| Experiments | Compare experiments and runs | Table-first views | Task copy shortened; metrics remain compact context |
| Sources | Find and connect evidence | Filter/sort table + inspector | Source actions collapsed; Year column fixed |
| Literature | Compare evidence | Matrix-first | Copy shortened; horizontal containment retained |
| Notebooks | Find execution/reproducibility issues | Notebook list/detail | Copy and empty state shortened |
| Code Linker | Map code to research meaning | File outline/detail | Copy and empty state shortened |
| Claims | Judge evidence readiness | Compact board/table + inspector | Copy shortened; detailed risks remain contextual |
| Provenance | Trace result lineage | Lineage-first | Copy/empty state shortened; broken/stale states retained |
| Reproducibility | Fix publication blockers | Score + finding report | Category enumeration removed from header |
| Decisions | Understand chronology | Timeline/history | Header and empty-state copy shortened |
| Next Steps | Prioritize recommended work | Ranked action rows | Rationale retained; explanatory shell copy shortened |
| Integrations | Verify local providers and editors | Compact detected-provider rows | Live CLI status, secure sign-in, setup commands, and editor opening replace the fixture catalog |
| Models & Agents | Configure a plan | Presets + selected topology + controls | Six presets shown by default; full list remains reachable |
| Settings | Change preferences | Category navigation + native form rows | Description shortened; structure preserved |

## Responsive organization

- At 1024 px, route descriptions are hidden before primary content or actions.
- Inspector becomes an overlay below 1180 px and remains closed without selection.
- Integration capability metadata hides before provider identity or setup action.
- Table and graph routes own their scroll boundary; the document does not overflow.
- Agent Sessions hides its contextual inspector at narrow sizes and keeps session rows task-first.
