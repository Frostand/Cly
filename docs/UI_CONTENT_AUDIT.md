# Cly UI content audit

## Method

The Electron review runner measured visible workspace characters before and after copy and disclosure changes. Content data—claims, evidence, risks, research questions, findings, and user-authored text—was excluded from deletion decisions.

## Main findings

- Route descriptions often enumerated every object type instead of stating the task.
- Empty states described future service boundaries instead of the immediate next action.
- Integrations exposed connection-model explanations beneath a provider catalog.
- Models exposed eleven preset descriptions before the selected topology.
- Context and Sources exposed secondary actions without a selection.
- Agent session headers and rows repeated model, context, branch, time, usage, and output metadata.

## Measured reductions

| Route | Iteration 1 | Final | Change |
| --- | ---: | ---: | ---: |
| Agent Sessions | 1,821 | 1,564 | −14% |
| Context | 2,564 | 2,446 | −5% while preserving research-object text |
| Integrations | 3,277 | 2,299 | −30% |
| Models & Agents | 1,897 | 1,289 | −32% |
| Sources | 1,362 | 1,125 | −17% |
| Claims | 781 | 685 | −12% |
| Settings | 298 | 233 | −22% |

All other task-header routes were shortened. Overview remained unchanged because its visible prose is predominantly the active research question, hypothesis, claim evidence, risk, and next action.

## Representative rewrites

- Context: “Control exactly what is selected…” → “Choose exactly what an agent receives.”
- Graph: object-type enumeration → “Trace how research objects support one another.”
- Reproducibility: 14-category enumeration → “Find and fix publication blockers.”
- Sources: import/material enumeration → “Organize and connect research sources.”
- Claims: evidence/risk enumeration → “Assess evidence, contradictions, and paper readiness.”
- Integrations: permission-state explanation → “Manage local and permissioned research tools.”
- Models: multi-clause setup instruction → “Choose a preset, then adjust roles, models, and limits.”

## Protected content

Research data, warnings, approval conditions, privacy constraints, evidence summaries, claim wording, reproducibility findings, and destructive-action explanations remain visible or reachable contextually.
