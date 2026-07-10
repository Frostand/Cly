# Security Policy

Cly is under active development and is not yet suitable for sensitive or regulated research data.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for `Frostand/Cly`. Do not open a public issue containing exploit details, credentials, private datasets, or identifying research material.

Include the affected version or commit, operating system, reproduction steps, impact, and any suggested mitigation. Remove secrets and private research content from logs before attaching them.

## Security invariants

- Provider credentials belong in the operating-system credential store, never SQLite, project files, logs, Git, telemetry, or agent prompts.
- Renderer code receives only allowlisted capabilities through the isolated Electron preload boundary.
- IPC and local API inputs are schema-validated and project-scoped. They must not expose arbitrary command, SQL, URL, or filesystem access.
- Agent-initiated destructive commands, external writes, publication, and credential access require explicit human approval.
- Papers, webpages, notebooks, datasets, tool output, and retrieved text are untrusted content and cannot override system or project security instructions.
- Private datasets and generated research artifacts are excluded from Git by default.
- Release artifacts must be signed before distribution outside the development team.

## Supported versions

Only the current private development branch receives security fixes until the first tagged Cly release.

