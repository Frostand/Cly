# Research model baseline

The canonical research domain model will be introduced in Phase 1. Its initial object types are Project, ResearchQuestion, Objective, Hypothesis, Source/Paper, Claim, Evidence, Method, Dataset/DatasetVersion, CodeFile, Notebook/NotebookCell, Experiment/Run, Metric, Figure, Table, Decision, Risk, Task, Branch, Commit, PullRequest, Agent, Conversation, and Report.

Relationships must be typed, sourceable, versioned, and marked `inferred` or `confirmed`. Provenance must point back to original passages, code symbols/cells, runs, commits, configurations, datasets, and environments as applicable. Detailed persistence choices wait for ADR-003 and ADR-004.
