# Delivery Workflow

This document is the delivery contract for Cly's research core. Linear is the
planning system of record; GitHub is the implementation, review, and release
record.

## Pull request baseline

Keep each pull request tied to one Linear issue and include its identifier in
the title or description. Authors describe research, architecture, data,
security, and rollback impact in the pull request template. UI screenshots,
Electron packaging, IDE smoke tests, and upstream synchronization are required
only when their own issue calls for them; they are not research-core CI gates.

Every pull request to `main` runs these blocking aggregate checks:

- `Cly CI / quality` — lint, typecheck, unit tests, web build, and Playwright E2E.
- `Cly Security / security` — dependency review, production dependency audit,
  production-license policy, Gitleaks secret scanning, and CodeQL.

Authors resolve every review conversation after material changes. A reviewer,
when available, verifies the acceptance criteria, test evidence, research-data
or provenance impact, security boundaries, and rollback path. The repository's
solo-maintainer baseline does not require another person's approval, so routine
merges never require an administrative bypass.

## Protected `main` configuration

A repository administrator must configure branch protection or a ruleset for
`main`; GitHub settings are not representable by files in this repository. The
protection must:

1. Require a pull request before merging, with zero mandatory approvals while
   Cly has one maintainer.
2. Require every review conversation to be resolved.
3. Require `Cly CI / quality` and `Cly Security / security` to pass and the branch to be
   current before merge.
4. Block force pushes, branch deletion, and direct pushes, including for
   administrators except through an explicitly audited emergency bypass.
5. Allow only squash or merge commits according to the repository's selected
   history policy; do not merge a pull request with a red or pending gate.

After enabling the ruleset, an administrator should open a draft pull request
that intentionally fails a research-domain test and confirm that GitHub blocks
the merge. Branch protection is considered operational only after that check.

## Linear and GitHub state transitions

| Linear state | GitHub activity | Exit condition |
| --- | --- | --- |
| Backlog | No implementation is expected. | Priority and problem are accepted. |
| Todo | Scope, acceptance criteria, owner, and dependencies are ready. | Work begins. |
| In Progress | A branch or draft pull request may exist. | The pull request is reviewable and all author-run checks pass. |
| In Review | A non-draft pull request links the issue. | Required review and checks pass, then the pull request merges. |
| Done | The change is merged to `main` and documentation or rollout work is complete. | No required follow-up remains. |
| Canceled | Work will not ship; close any pull request without merging. | The issue records why it was canceled or superseded. |

Moving a pull request back to draft moves the issue from In Review to In
Progress. A merged pull request does not move the issue to Done while a required
migration, documentation update, or rollout action remains.

## Security and dependency controls

Cly's upcoming local service and integrations cross filesystem, command,
network, provider, and repository trust boundaries. The delivery baseline
addresses those risks as follows:

| Control | Threat addressed |
| --- | --- |
| The production dependency audit blocks a pull request when the lockfile contains moderate-or-higher advisories; the adjacent license gate rejects denied copyleft licenses. | Compromised or legally incompatible supply-chain changes. |
| The production-license script allowlists permissive licenses and narrow, documented package exceptions. | Unreviewed runtime license obligations or missing license metadata. |
| CodeQL runs extended JavaScript/TypeScript queries on pull requests, `main`, and weekly, retaining SARIF artifacts without requiring GitHub Advanced Security uploads. | Injection, unsafe data flow, and other code-level vulnerabilities. |
| Gitleaks runs on pull requests, `main`, and weekly. GitHub secret scanning and push protection should additionally be enabled if the repository plan supports them. | Credentials entering history through source, fixtures, logs, or configuration. |
| GitHub Actions receive job-specific minimum permissions; dependency updates are grouped and reviewed like other changes. | Workflow-token abuse and unreviewed supply-chain drift. |
| The pull request security checklist requires scoped interfaces, validated untrusted input, and human approval for destructive or external actions. | Local API, IPC, agent, command, URL, and filesystem capability escalation. |

Automated checks supplement the invariants in [SECURITY.md](../SECURITY.md).
They do not replace threat modeling for new local-service or integration
boundaries. A dependency exception must identify the exact package and rationale
in `scripts/check-production-licenses.mjs`; broad new license classes are not an
acceptable shortcut.

## Release ownership

Releases use explicit ownership, with separation of duties when another
maintainer is available:

- The change owner makes the pull request release-ready, supplies test and
  migration evidence, and writes the release-note entry.
- The reviewer validates research integrity, security impact, and rollback
  instructions and approves the exact commit that will ship.
- The release owner confirms `main` is green, chooses the version, creates the
  signed tag and artifacts, publishes through the approved channel, and records
  the release link on the Linear issue.
- The repository administrator owns branch rules, secret scanning, push
  protection, environments, and emergency-bypass auditing.

For a solo-maintainer release, the pull request, green required checks, and
recorded release evidence replace a mandatory second-person approval. Until
signed distribution is configured, builds remain internal and must not be
described as public releases.

For an emergency bypass, the repository administrator records the reason and
commit in a GitHub issue, obtains retrospective review, and restores every gate
before the next change merges.
