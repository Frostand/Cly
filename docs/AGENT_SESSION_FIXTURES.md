# Agent Session fixtures

The fixture repository covers:

- an active multi-agent claim audit;
- a compute plan waiting for approval;
- a completed notebook review;
- empty project and empty Chat states;
- new sessions with an Orchestrator, Worker Agent, and Reviewer Agent;
- browser paper content and source capture;
- fake terminal output;
- generated code diffs and review state;
- live file edits;
- streaming reasoning, delegation, agent updates, and response output;
- workbench collapse/maximize and persisted layout;
- approval resolution, pause, stop, and archive transitions.

All fixture actions are local and deterministic enough for unit, component, and Playwright tests. Time-based IDs only distinguish newly created UI objects.
