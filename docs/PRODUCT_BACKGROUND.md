# Cly Product Background

Cly is a local-first research cockpit for computational and code-assisted research. It connects the full evidence trail:

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

Cly is not a VS Code clone, a notebook editor, an admin dashboard, or a chat wrapper. Dream supplies desktop and execution infrastructure; Cly supplies the research-object model, evidence navigation, context control, integrity workflows, and decision memory.

The current phase is UI-first. All external integrations, model calls, authentication, execution, and synchronization are simulated behind typed service interfaces.
