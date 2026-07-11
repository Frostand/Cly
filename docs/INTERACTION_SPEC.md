# Interaction Specification

## Global behavior

- Sidebar selection changes the main workspace and clears stale object selection.
- Selecting an object opens the inspector and preserves its stable ID.
- Escape closes palette/popovers or clears selection.
- Visible actions mutate fixture state, navigate, open a dialog, simulate a task, show a confirmation/status toast, or remain disabled with an explanation.

## Creation

The global New button is contextual for Claims, Experiments, and Sources. The command palette exposes New Claim, Experiment, Source, and Decision from any screen. New claims start Unsupported. New experiments start Planned.

## Context

Include/exclude, pin, raw/summary representation, pack application, priority reordering, budget/model capacity, exact agent preview, and pack save update immediately. Compression, restore, archive, branch, and forget explain prototype behavior without destroying evidence.

## Research integrity

Claim status changes update shared state. Evidence linking adds the canonical experiment to a selected claim. Audit resolution changes finding disposition. Next-step acceptance/defer/dismiss changes status. Decision creation and supersession preserve history.

## Graph

Search and node-type filters reduce the visible neighborhood. Low-confidence links can be hidden. Node selection enables evidence, provenance, contradiction, and neighborhood traces. Suggested edges can be approved in the relationship table.

## Tables and large data

Tables support search/filter and sticky headers. Large fixtures bound rendered rows (typically 200–300) and graph nodes/edges (60/120) while preserving total counts and explanatory notices.

## External boundaries

Actions that would open a file, editor, website, model, OAuth flow, or real execution produce a clear preview/unavailable explanation. They never silently no-op.
