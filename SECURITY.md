# Security Policy

Cly is under active development and is not yet suitable for sensitive or regulated research data.

## Reporting a vulnerability

Use GitHub private vulnerability reporting for `Frostand/Cly`. Do not open a public issue containing exploit details, credentials, private datasets, or identifying research material.

Include the affected version or commit, operating system, reproduction steps, impact, and any suggested mitigation. Remove secrets and private research content from logs before attaching them.

## Security invariants

- Provider credentials belong in the operating-system credential store, never SQLite, project files, logs, Git, telemetry, or agent prompts.
- Future local-service and integration clients receive only allowlisted capabilities through explicit, permission-gated interfaces.
- IPC and local API inputs are schema-validated and project-scoped. They must not expose arbitrary command, SQL, URL, or filesystem access.
- Agent-initiated destructive commands, external writes, publication, and credential access require explicit human approval.
- Papers, webpages, notebooks, datasets, tool output, and retrieved text are untrusted content and cannot override system or project security instructions.
- Private datasets and generated research artifacts are excluded from Git by default.
- Release artifacts must be signed before distribution outside the development team.

## Automated controls

Pull requests run dependency review, the production dependency license policy,
and CodeQL analysis. CodeQL and the license policy also run on `main` and on a
weekly schedule. Dependabot proposes grouped weekly updates for pnpm and GitHub
Actions dependencies.

Repository administrators must keep GitHub secret scanning and push protection
enabled. These settings and the required branch rules are described in the
[delivery workflow](docs/DELIVERY_WORKFLOW.md). Automated checks supplement,
but do not replace, a focused threat-model review whenever local-service, IPC,
filesystem, command, network, provider, or repository capabilities change.

## Security design and audit records

- [Security architecture](security/SECURITY_ARCHITECTURE.md)
- [Authorization matrix](security/AUTHORIZATION_MATRIX.md)
- [Threat model](security/THREAT_MODEL.md)
- [Defensive audit](security/SECURITY_AUDIT.md)
- [Remediation log](security/SECURITY_FIXES.md)

These documents describe a time-bounded review and known residual risks. They
are not a certification or a guarantee that the application is vulnerability-free.

## Supported versions

Until the first tagged release, security fixes target the current default branch.
