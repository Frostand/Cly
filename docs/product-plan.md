# Cly product plan

## Positioning

**Cly is a local-first system of record for computational research.** It connects literature, objectives, evidence, external code and notebooks, experiments, outputs, decisions, and claims.

Cly owns the research process. Existing tools own code editing, debugging, terminal workflows, language services, and source control.

## Product boundary

| Cly owns | External tools own |
| --- | --- |
| Research plans, hypotheses, sources, evidence, decisions, experiments, provenance, claims, audits, and agent approvals | Code editing, terminals, debugging, language services, Git clients, notebooks, and editor ecosystems |

## Experience

Researchers create a project in Cly, set an objective and evaluation criteria, collect sources, plan experiments, and delegate reviewable research tasks. They use their normal editor or notebook environment to implement and run work. The local Cly service observes only opted-in repositories and runs, then connects commits, files, cells, environments, outputs, and claims to the research graph.

The core outcome is a verified chain:

```text
question → source and evidence → hypothesis → external code or notebook
→ experiment → artifact → claim → reproducibility audit
```

## Architecture

```text
Cly research application
  ├─ objectives, sources, graph, experiments, claims, audits, agents
  └─ local Cly service
       ├─ project storage and provenance
       ├─ repository and Git observation
       ├─ experiment and artifact capture
       ├─ context retrieval and permission checks
       └─ companion integration APIs
            ├─ VS Code-compatible extension
            ├─ Jupyter integration and experiment SDK
            ├─ CLI and MCP interface
            └─ GitHub integration
```

## Delivery phases

1. **Research core and local service:** typed research objects, storage, project identity, provenance, repository observation, and explicit permissions.
2. **Research graph and evidence:** sources, claims, objectives, decisions, literature matrix, and planning.
3. **Experiments and reproducibility:** run manifests, environments, artifacts, figures/tables, staleness, and audits.
4. **Companion integrations:** VS Code-compatible, Jupyter, CLI/MCP, GitHub, and Python experiment SDK.
5. **Agents:** approval-gated research agents with inspectable context, budgets, and provenance.

## Non-goals

- Building or maintaining an IDE, editor, terminal, debugger, Git client, or notebook client.
- Replacing VS Code, Cursor, Jupyter, or a researcher’s existing workflow.
- Autonomous merges, destructive actions, or unreviewed scientific-claim changes.
- Passive dashboards that require manual updates to stay useful.

## Principles

- Every material artifact is traceable to its task, inputs, environment, and resulting research objects.
- External tools are first-class clients; no core capability depends on one editor implementation.
- Repository observation and execution are opt-in, project-scoped, and permission-gated.
- Imported content is evidence, never executable instruction.
- Human review remains required for material agent actions and claim changes.
