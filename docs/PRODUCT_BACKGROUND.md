# Cly Product Background

Cly is a local-first research platform for computational and code-assisted research. It is the system of record that connects the full evidence trail:

```text
question → sources → methods → code → notebooks → experiments
         → outputs → figures/tables → claims → decisions → reports
```

## Product promise

A researcher should be able to answer:

- What is the project trying to prove?
- Which evidence supports or contradicts each claim?
- Which code, notebook, data, environment, and run produced a result?
- Which decisions changed the project direction, and why?
- Which artifacts are stale, manually edited, or irreproducible?
- What exact context will an agent receive?
- What should happen next?

## Audience

Cly is designed for researchers, students, research engineers, independent scientists, and teams working across machine learning, computational biology, physics, engineering, mathematics, economics, robotics, neuroscience, simulations, data science, and code-assisted social science.

## Product boundaries

Cly is a standalone research platform, not an IDE. It includes an integrated coding workspace for computational work, but its primary value is the research-object model, evidence navigation, context control, integrity workflows, and decision memory — all of which are independent of any code editor.

Cly integrates with external editors (VS Code, Cursor, Jupyter) through extensions and APIs. Users can keep their preferred coding environment while Cly tracks their research state.

The current phase is UI-first with fixture-backed screens. All external integrations, model calls, authentication, execution, and synchronization are simulated behind typed service interfaces and will be implemented in Phase 2–3.
