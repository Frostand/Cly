# Cly product plan

## Positioning

**Cly is a local-first research workspace that connects literature, code, experiments, outputs, decisions, and claims.** It is the system of record for agentic and computational research—not another general-purpose IDE.

Researchers retain their preferred editing environment. Cly can include a focused code workspace for quick edits, notebooks, diffs, and artifact inspection, while VS Code-compatible editors, Jupyter, terminals, and GitHub connect through a local Cly service.

## Product boundary

| Cly owns | Existing coding tools own |
| --- | --- |
| Research plans, objectives, hypotheses, sources, evidence, decisions, experiments, provenance, claims, audits, and agent control | General code editing, language services, debugging, extension ecosystems, and user-specific editor workflows |

## Architecture

```text
Cly research application
  ├─ research graph, sources, experiments, claims, decisions, agents, audits
  └─ local Cly service
       ├─ repository and Git observation
       ├─ experiment and artifact capture
       ├─ permission-gated agent execution
       └─ context and provenance APIs
            ├─ focused Cly code workspace
            ├─ VS Code-compatible extension
            ├─ Jupyter integration / experiment SDK
            ├─ CLI and MCP interface
            └─ GitHub integration
```

## MVP outcome

Demonstrate one verified research chain: question → source discovery and review → objective/hypothesis → code or notebook in Cly or an external tool → experiment → artifact → claim → evidence and reproducibility audit.

The user can see why a file or commit exists, which task and hypothesis it serves, which sources informed it, which environment produced a result, and whether that result supports a claim.

## Phased delivery

1. **Standalone core and local service:** research objects, persistence, project import, Git/filesystem observation, permissions, and provenance events.
2. **Research workspace:** dashboard, source library, literature matrix, graph, objectives, decisions, experiments, claims, audits, and agent manager.
3. **Computational research:** notebook/code linking, environment capture, runs, metrics, figures/tables, and artifact lineage.
4. **Companion mode:** VS Code-compatible extension, Jupyter integration, experiment SDK, CLI/MCP, and GitHub integration.
5. **Optional focused workspace:** embedded editing, terminal, diffs, and notebook inspection as a convenience client—not the core platform.

## Non-goals

- Maintaining an IDE fork or tracking an IDE upstream.
- Rebuilding language servers, debugging, editor extensions, or general IDE compatibility.
- Passive dashboard behavior that requires manual status entry to remain useful.
- Autonomous merges, destructive actions, or unreviewed claim changes.

## Product principles

- Cly must stay operationally connected to work: observe repositories, Git, notebooks, runs, and artifacts automatically where users permit it.
- Every important generated artifact must be traceable to its task, inputs, environment, and resulting research objects.
- External tools are first-class clients; no core research capability can depend on a specific editor shell.
- Human review is required for agent actions with material effects and for changes to scientific claims.
