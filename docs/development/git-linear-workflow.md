# Linear and GitHub delivery workflow

Linear is the planning system of record; GitHub is the code review and release system. Use the **Cly Research** team and its `CLY` issue key.

1. Scope an issue with problem, user value, bounded scope/non-goals, testable acceptance criteria, dependencies, risks, testing, documentation, and observability.
2. Move it to **Ready** only after architecture, privacy/security, and migration questions are resolved.
3. Create a short-lived branch from `main`: `feature/CLY-123-literature-matrix` (or `fix/`, `research/`, `experiment/`, `refactor/`, `docs/`, `chore/`).
4. Move Linear through **In Progress → In Review → In Validation → Done**. Merging is not Done; validate acceptance criteria first.
5. Use focused Conventional Commits, for example `feat(literature): add matrix query API [CLY-123]`.
6. Open one focused PR per issue, use the repository PR template, link Linear, require checks and review, squash merge, then delete the branch.

## GitHub configuration still required

Repository files cannot enforce hosted settings. In GitHub, protect `main`: require PRs, one approving review, CODEOWNERS review for sensitive paths, dismissal of stale approvals, required `Quality / Lint, typecheck, and build`, and required CodeQL checks. Disable direct pushes and force pushes; enable squash merge and branch deletion. Add a second required reviewer for authentication, secrets, provider transmission, command execution, migrations, graph/provenance, and experiment execution.

## Workflow states

Backlog → Triage → Discovery → Ready → In Progress → In Review → In Validation → Done, with Blocked and Canceled as explicit exceptions. Do not start unscoped work except a Discovery issue.
