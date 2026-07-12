# Cly UI copy guide

## Labels

- Route titles: 1–4 words where established terminology permits.
- Buttons: verb first, normally 1–3 words (`Import source`, `Run audit`, `Open chat`).
- Tabs: nouns or short modes (`Overview`, `Chat`, `Claims`).
- Status: one direct phrase (`Running`, `Needs review`, `Setup required`).

## Route descriptions

Use one sentence describing the current task, ideally under 60 characters. Do not enumerate every supported object or restate the route title. Put product-boundary explanations in documentation, fixture notices, or contextual help.

## Empty states

Use:

1. A short state title: `No sources yet`.
2. One actionable sentence: `Import a paper, note, dataset, or URL.`
3. One primary action.

Optional secondary actions belong in a menu or text link. Avoid large feature explanations.

## Helper text

Helper text should prevent a likely mistake, explain a constraint, or clarify persistence. Remove it when the control label and current value are sufficient. Never repeat the same explanation in a heading, subtitle, and callout.

## Tooltips and menus

Tooltips clarify compact icon actions but must not contain essential safety information. Menus use short action labels; consequences appear after selection or in confirmation UI. Include keyboard shortcuts where stable.

## Metadata

Keep identity, status, progress, and the next action on the default surface. Move branch, usage, full configuration, permissions, and history into an inspector, disclosure, or menu. Render ordinary metadata inline rather than as a badge.

## Terminology

- `Agent Sessions`, `Overview`, and `Chat` are the canonical mode names.
- Use `Context pack`, not prompt bundle or context configuration.
- Use `Reproducibility finding`, not issue/error interchangeably.
- Use `Source`, `Claim`, `Experiment`, `Run`, and `Artifact` consistently with the domain model.
- Reserve `Open` for navigation/reveal and `Run` for execution.
