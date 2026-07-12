# ADR 0002: Research-agent provider boundary and approvals

- Status: Accepted
- Date: 2026-07-12

## Context

Cly supports Codex, Claude Code, OpenCode, and Cursor through its local API,
but the present implementations are chat adapters. They expose different
permission controls, emit different event shapes, and rely on each provider's
own authentication. Research-agent execution needs one Cly-owned boundary so
that a research task has the same project scope, approval semantics, and audit
trail regardless of its provider.

This decision applies to Cly's local service. It does not create an IDE-wide
agent abstraction and it does not permit autonomous execution without an
explicit approval policy.

## Decision

Introduce a provider-neutral `ResearchAgentService` contract in the local
service layer. Provider adapters may translate requests and provider events,
but only the service may authorize a consequential action or record its
provenance.

The service contract has four stages:

1. `prepareRun` validates the project root, selected research context, model,
   budget, and declared approval policy. It produces an immutable run ID.
2. `requestAction` classifies each provider action as read, write, network,
   process, credential, or external-side-effect. It sends an approval request
   to Cly before the adapter is allowed to continue a consequential action.
3. `recordEvent` appends normalized lifecycle, tool, approval, output, and
   failure events to the run provenance log. Raw provider payloads are
   redacted before storage.
4. `completeRun` records the terminal state, outputs, provider session ID, and
   approval decisions.

The normalized execution request contains a Cly run ID, provider and model,
validated project root, selected research-object IDs, context references,
budget, and approval policy. It must not contain access tokens, refresh
tokens, provider configuration files, or arbitrary paths outside the project.

## Approval policy

`read` actions within the validated project root may proceed under the
selected policy. `write`, `network`, `process`, `credential`, and
`external-side-effect` actions require a pending Cly approval unless a
previous approval explicitly grants that action class for the current run.
Approval is scoped to one run; it is never inherited by another run or by a
different project. Denial, cancellation, provider disconnect, and expiry all
fail closed.

Provider-native approval prompts are inputs to the boundary, not the source of
truth. The adapter must not auto-approve an action merely because the provider
offers an auto-accept mode.

## Provider mapping

| Provider | Current adapter | Native controls/events | Boundary treatment |
| --- | --- | --- | --- |
| Codex | `chat/codex-app-server.js`, `chat/codex-cli-stream.js` | sandbox and approval-policy settings; app-server approval requests | Translate native requests into Cly `requestAction`; do not map `full-access` to an unrestricted research run. |
| Claude Code | `chat/claude-stream.js` | permission modes and MCP tool permission handler | Route every write, direct web, process, and MCP side effect through Cly approval; provider modes only constrain the adapter. |
| OpenCode | `chat/opencode-stream.js` | server permission events and permission reply endpoint | Emit normalized action requests and reply only after Cly resolves them. |
| Cursor | `chat/cursor-stream.js` | CLI/tool event stream; no Cly-owned approval bridge today | Treat as read-only/plan-only for research runs until tool actions can be intercepted and paused by Cly. |

## Credential boundary

Provider credentials belong to the provider's CLI or to the operating-system
credential store. Cly must use a small `CredentialStore` interface for any
Cly-owned secret: `get`, `put`, `delete`, and `status`. Implementations use
Keychain on macOS, Credential Manager on Windows, and Secret Service/KWallet
or an explicitly documented secure equivalent on Linux. The interface returns
opaque values only to the local main process; it never exposes a secret to the
renderer, SQLite, project files, logs, provenance records, or prompt context.

Cly must not copy, refresh, migrate, or persist a provider CLI credential.
Where a provider adapter needs authentication, it invokes the provider CLI or
uses an OS-store-backed integration owned by Cly. If neither is available, the
provider is reported unavailable.

## Consequences

- New research-agent adapters must implement the boundary before they are
  enabled for execution.
- Existing chat adapters remain outside `ResearchAgentService` until migrated.
- Cursor research execution is deliberately deferred because its current CLI
  stream does not supply an approval pause/resume bridge.
- The credential audit in `docs/phase-0/provider-credential-audit.md` is a
  pre-beta gate for migration work.

