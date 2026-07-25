# Local service security model

- Status: required design gate for Phase 2 adapters
- Last reviewed: 2026-07-16

Scope: local-service authentication, credentials, research-context
transmission, repository observation, execution adapters, imported content,
and provenance integrity. Electron IPC and embedded-terminal security are out
of scope.

The normative capability ownership, API allowlist, and local-data lifecycle
are defined in [Local Cly service boundary](LOCAL_SERVICE_BOUNDARY.md). This
document supplies the threat model and security requirements for that
boundary.

This document turns the security invariants in `SECURITY.md` and the provider
boundary in ADR 0002 into requirements that can be implemented and tested. A
feature described here is not considered safe merely because it is local.

## Security objective

Cly may read private research and authorize tools with the user's operating-
system privileges. The local service must therefore ensure that:

1. only the Cly instance that launched the service can call its private API;
2. secrets are available only to the component and destination that need them;
3. an external provider receives exactly the context the user approved;
4. repository reads and execution remain within a registered project and a
   declared capability;
5. imported or tool-produced content is treated as data, never authority; and
6. the audit trail can explain what was observed, transmitted, approved, and
   changed, and can reveal later tampering.

This model protects against malicious webpages and local processes, a
compromised renderer, prompt injection in research material, confused-deputy
requests between projects, over-broad provider adapters, accidental secret
disclosure, and undetected provenance modification. It does not claim to
protect data from an already-compromised operating-system account, kernel, or
provider after the user has approved transmission to that provider.

## Assets and trust boundaries

| Asset | Examples | Required protection |
| --- | --- | --- |
| Credentials | provider tokens, OAuth refresh tokens, integration secrets | Confidentiality; revocation; never stored in research data |
| Research context | papers, source excerpts, claims, datasets, code, prompts | Project isolation; preview and approval before external transmission |
| Repository | code, Git metadata, notebooks, untracked files | Canonical project scoping; least-privilege observation and mutation |
| Execution authority | process, filesystem, network, provider, and external-service access | Explicit capabilities; fail-closed approval; bounded lifetime |
| Provenance | run inputs, context manifest, approvals, outputs, hashes | Completeness, ordering, project ownership, tamper evidence |

The renderer, imported content, provider output, tool output, repositories,
and every external provider are untrusted. The local service is the policy
enforcement point. Provider CLIs and execution adapters are privileged but are
not policy authorities. The operating-system credential store and Cly's main
process are inside the credential boundary.

## Threat scenarios

| Threat | Example consequence | Required control |
| --- | --- | --- |
| Loopback request forgery | A webpage or unrelated local process calls a Git, provider, or research endpoint. | Per-launch authentication plus Host/Origin checks, no CORS, and no token in URLs or persistent storage. |
| Renderer compromise | Script execution in the renderer uses its bearer token to read arbitrary local paths or approve effects. | Treat renderer as untrusted, bind service capabilities to registered projects/runs, keep credentials out of the renderer, and eventually replace the general renderer token with a narrow broker. |
| Credential exfiltration | A token enters a prompt, log, SQLite row, child environment, redirect, or export. | OS-store ownership, opaque references, destination allowlisting, schema rejection, minimal environments, and canary-secret scanning. |
| Context substitution | Content changes after preview, or a summary hides sensitive text while a different payload is sent. | Immutable manifest and exact payload hashes, approval binding, and reapproval on every material change. |
| Path or project confusion | A caller supplies another project, `..`, a symlink, parent Git root, or sibling worktree. | Registered project IDs, canonical-root resolution, realpath containment, and cross-project tests. |
| Over-privileged observation | A scanner crawls a home directory, secret dotfiles, Git helpers, or unrelated large datasets. | Metadata-first scoped capabilities, explicit extra roots, fixed Git operations, common ignore policy, bounds, and observation audit events. |
| Approval replay or widening | A one-file approval is reused for another run, command, host, account, or destructive action. | Hash-bound, run/project-scoped, expiring grants with normalized constraints and single-use high-risk decisions. |
| Unpausable provider effect | A provider performs a write/network action before Cly can ask the user. | Keep the adapter plan/read-only until it supports intercept-before-effect; fail closed on unknown events. |
| Prompt injection | A paper says to ignore policy, read credentials, call a URL, or forge an approval result. | Trust labels, typed serialization, instruction separation, injection indicators, and independent action validation. |
| Provenance forgery | Events are deleted/reordered or inputs, approvals, and artifacts are replaced after a run. | Append-only APIs, project ownership, sequence/hash chains, completion verification, and later signed external checkpoints. |
| Resource exhaustion | Huge imports, slow bodies, event floods, or unbounded provider output freeze the service. | Type/size/time/concurrency/resource limits, bounded queues/output, cancellation, and constrained parsers. |

## Local-service authentication

### Required protocol

- Bind only to an explicitly configured loopback address. Startup must fail if
  the server would bind to a wildcard or non-loopback address.
- Generate at least 256 bits of cryptographically random session-token
  entropy for every service launch. Never accept a token through a command
  line, URL, environment variable, persisted setting, or log message.
- Require the token on every private endpoint, including streaming,
  approvals, health/status endpoints that expose capabilities, and errors that
  reveal project state. Compare it without data-dependent early exit.
- Accept requests only for an expected `Host` and, for browser-originated
  requests, an expected `Origin`. Do not enable permissive CORS. Authentication
  is still required when origin checks pass.
- Set request-body limits, stream idle timeouts, and concurrency limits before
  parsing provider or import payloads. Invalid authentication is rejected
  before a body is read or a database/provider operation begins.
- Rotate the token on service restart and invalidate it before shutdown.
  Approval IDs and run IDs are not authentication credentials.
- Do not expose the general bearer token to extensions, MCP clients, CLIs, or
  other local integrations. Those clients require separately issued,
  revocable, capability-scoped credentials and a pairing flow.

The current service satisfies loopback-only binding and per-launch 256-bit
token generation. It uses an ordinary equality comparison and exposes the
general token to the renderer through the preload bridge. It does not yet
enforce Host/Origin, body, timeout, or concurrency rules. Renderer exposure is
an accepted implementation constraint only for the current internal UI; it
means renderer compromise is equivalent to local-service compromise and must
be removed before less-trusted renderer content or remote content can share
that context.

## Credential storage and transmission

### Ownership

- Provider-CLI credentials remain owned by that CLI. Cly invokes the CLI and
  checks availability without reading, copying, refreshing, exporting, or
  persisting its credential files.
- A Cly-owned integration secret is stored through the main-process-only
  `CredentialStore` contract from ADR 0002. Implementations use Keychain on
  macOS, Credential Manager on Windows, and Secret Service/KWallet or a
  documented secure equivalent on Linux.
- SQLite stores only a random credential reference, provider, account label,
  non-sensitive status, scopes, and timestamps. A reference must not encode or
  derive from the secret.
- If a secure store is unavailable or locked, the integration is unavailable.
  Plaintext files, application encryption keys beside ciphertext, and silent
  fallbacks are prohibited.

### Access and transmission

- `CredentialStore.get` returns an opaque secret only to the main-process
  adapter that owns the matching credential reference. Renderer, local HTTP,
  research repositories, context builders, logs, telemetry, crash reports,
  exports, and provenance APIs never return the value.
- Adapters send a secret only to the configured provider endpoint over a
  verified encrypted transport. Redirects to a different origin are rejected;
  proxy and custom-CA behavior must be visible to the user.
- Secrets are placed in the narrowest supported authentication field. They
  are not interpolated into prompts, command strings, URLs, filenames, or
  provider-visible metadata. Child-process environments are constructed from
  an allowlist rather than inheriting the full Cly environment.
- Secret-bearing request and response objects are redacted before diagnostic
  handling. Redaction is defense in depth; schemas must reject credential-like
  fields in research runs, context manifests, and provenance metadata.
- Secret values are retained in memory only for the request lifetime. Cly does
  not cache provider secrets in the renderer or database. Disconnect and
  account removal delete the secure-store value and mark its reference revoked.
- Capability checks report only states such as `available`, `locked`,
  `reauthentication-required`, or `unavailable`. They do not return tokens,
  credential paths, or raw provider configuration.

The provider-specific findings and migration constraints are recorded in
`phase-0/provider-credential-audit.md`. The Codex model-discovery adapter that
reads Codex's local authentication cache must not be reused by research
execution. Claude authentication remains delegated to Claude Code.

## Cly Dev device-sync boundary

Device sync extends the local-service boundary to another user-approved Cly
installation. A paired device, its public keys, and an untrusted transport are
separate trust decisions: possessing a pairing bundle or encrypted envelope
does not authorize synchronization.

### Required controls

- A device begins `pending` and becomes `trusted` only after its fingerprint is
  entered and matched. A revoked device cannot be trusted again under the same
  identity, receive a new outbox batch, or rotate keys.
- Device private keys are main-process-only credentials. They are encrypted
  with Electron `safeStorage`; plaintext fallback is prohibited. SQLite,
  renderer responses, pairing bundles, logs, audits, and sync envelopes never
  contain the private bundle.
- Envelopes use AES-256-GCM content encryption, recipient-specific
  X25519/HKDF-SHA-256 key wrapping, and an Ed25519 signature over canonical
  metadata, recipient slots, and ciphertext. Project, record, revision,
  sender, recipient, and key-version substitutions therefore fail validation.
- The encrypted outbox and inbox are the only durable sync payload stores.
  Plaintext exists only while an approved local event is encrypted or an
  authenticated incoming record is decrypted for application.
- Only allowlisted event types marked `transferable` may enter the outbox.
  Local-only events and manifest fields—including absolute paths, environment
  variable names, local notes, and uncommitted-file paths—are never serialized
  into an envelope.
- Every import is schema-, signature-, recipient-, trust-, key-version-, size-,
  and quota-checked before application. One corrupt record does not prevent
  valid records in the same bounded batch from being accepted.
- Delivery is idempotent by project, recipient, and envelope identity. Durable
  cursors, acknowledgements, attempt counts, retry times, and stable error codes
  permit resume after interruption without duplicating applied records.
- Mutable records carry a base revision. A mismatch creates a durable conflict
  and never overwrites the current head until the user chooses the local or
  incoming version. Chat messages remain append-only.
- Audit records contain action, device IDs, project ID, counts, revisions,
  byte sizes, outcomes, and error codes only. Audit metadata rejects fields
  capable of carrying bodies, messages, payloads, ciphertext, envelopes,
  secrets, or private keys.

### Rotation and revocation semantics

Local rotation creates a fresh keypair in the credential store before making
its public version active. Unacknowledged outbox records signed by the retired
key are discarded and become eligible for re-encryption during the next
staging pass; acknowledged history remains intact. Peers accept a strictly
newer public version only after its fingerprint is verified, including a later
version when an intermediate rotation was missed. Retired keys remain usable
for authenticating records that were already in flight; they cannot receive
newly staged state. Revoking a peer marks all its keys revoked and converts its
pending deliveries to `policy_blocked`. Revocation prevents future disclosure
but cannot retract plaintext the peer legitimately decrypted before
revocation.

The current implementation exposes authenticated local HTTP endpoints for
pairing, encrypted batch export/import, acknowledgements, status, and conflict
resolution. It deliberately does not designate or trust a hosted relay: any
future transport must treat envelopes as opaque bytes, enforce independent
authentication and quotas, and preserve the end-to-end cryptographic checks
described above.

## Selected-context preview and approval

Context selection and action approval are separate decisions. Permission to
read a project does not imply permission to send its contents to a provider,
and permission to send context does not imply permission to execute a tool.

### Context manifest

Before the first external transmission, `prepareRun` creates an immutable
context manifest containing:

- run ID, project ID, destination provider/account, model, and purpose;
- each selected research-object ID and relationship used;
- each file's project-relative path, canonical content hash, selected line or
  byte range, and included/redacted byte count;
- included conversation turns, generated summaries, and system/project
  instructions, each labeled by origin;
- estimated tokens/bytes, sensitivity labels, stale-content warnings, and all
  redaction or compression transformations; and
- a hash of the exact serialized provider payload, excluding credentials.

The preview shows human-readable content, not only IDs or counts. It must make
the destination, sensitive items, hidden transformations, and excluded content
obvious. Absolute paths, unrelated metadata, hidden files, VCS internals,
credential files, ignored secret patterns, and unselected object neighbors are
excluded by default.

### Approval rules

- External transmission requires an affirmative approval of the manifest and
  destination. Closing the preview, timeout, cancellation, disconnect, or
  payload-generation failure denies transmission.
- Approval is bound to the run ID, project ID, destination account/model,
  manifest hash, payload hash, and expiry. It cannot be replayed in another run
  or after any selected content, transformation, destination, or system
  instruction changes.
- Follow-up turns may reuse approval only when the UI displays that reuse and
  the destination and approved context manifest remain byte-identical. New
  context, file changes, broader ranges, regenerated summaries, or a different
  provider require a new preview and approval.
- Deterministic local-only scans do not need transmission approval. Their
  results become untrusted context and require preview if later sent outside
  the local service.
- The provenance log records manifest/payload hashes and the decision, but not
  a second copy of sensitive context. A project-scoped user can later inspect
  the human-readable manifest from the run record, subject to retention policy.

## Repository observation

- API and adapter requests identify a registered project by ID, never authorize
  themselves with a caller-supplied absolute root. The service resolves the
  stored root, canonicalizes it with `realpath`, and confirms it still refers
  to the approved directory before every operation.
- Relative paths are resolved beneath that canonical root. Symlinks and
  junctions are resolved before access; a target outside the root is denied
  unless separately registered and approved as a read-only data location.
- Default observation is metadata-only: relative path, type, size, timestamps,
  Git status, and hashes when required. Content reads require a declared
  scanner/context capability. There is no implicit home-directory, parent-
  repository, sibling-worktree, environment, dotfile, or credential scan.
- Watchers use the same boundary and ignore policy as initial scans. They
  coalesce events, bound queues, never follow a newly introduced escaping
  symlink, and stop when the project closes or its registration changes.
- Git observation is read-only and uses a fixed command/argument set. It does
  not run hooks, filters, pagers, credential helpers, or repository-provided
  executables. Mutating Git operations use the execution approval boundary.
- Every observation session records actor, project, adapter version,
  capability, start/stop time, ignore-policy version, and aggregate results.
  Content is logged only by hash and project-relative reference.

Current project-file, Git, and chat routes accept arbitrary existing absolute
directories supplied by the authenticated renderer. Lexical containment is
applied to relative file paths, but canonical symlink containment and binding
to a registered project ID are not universal. These routes are coding-
workspace compatibility APIs, not acceptable research-service authorization
boundaries.

The research service now implements a narrow observation slice separately:
`POST /api/projects/:projectId/repository-observations` accepts no path or
command, revalidates the registered canonical Git top level, runs a fixed
bounded status operation, and records only project-relative metadata through
project-scoped provenance. Trusted project provisioning, watchers, content
scanners, and execution capabilities must retain the stronger requirements
above as they are implemented.

## Approved execution adapters

Every adapter declares a versioned capability descriptor covering action
classes (`read`, `write`, `network`, `process`, `credential`, and
`external-side-effect`), allowed roots, executable identity, argument schema,
environment keys, network destinations, time/resource limits, and whether the
action can be paused before its effect.

- `ResearchAgentService` is the only component that grants capabilities.
  Provider-native modes can further restrict a run but cannot broaden it.
- Read-only, project-contained actions may follow the run's declared policy.
  Write, network, process, credential, destructive, and external-side-effect
  actions require a pending Cly approval unless that exact capability was
  explicitly granted for the current run.
- The approval preview includes normalized executable/tool identity, exact
  arguments or structured operation, canonical cwd/targets, affected files,
  destination host/account, data leaving the machine, risk class, and expiry.
  A shell command summary is not a substitute for the exact request.
- Approval grants bind to the run, project, adapter version, action class, and
  normalized parameter constraints. “Session” never means another run,
  project, adapter, or broadened path/host. Destructive and credential actions
  are always single-use.
- Adapters execute with a minimal environment, project-scoped cwd, fixed
  argument arrays, bounded output, cancellation, timeout, and resource limits.
  Shell evaluation, repository hooks, and inherited provider auto-approval are
  disabled unless they are the specifically reviewed capability.
- Denial, expiry, malformed provider events, adapter crash, renderer loss,
  service shutdown, or provider disconnect fail closed. An adapter that cannot
  pause before an effect is read-only/plan-only.
- The service records requested and resolved action hashes, decision actor and
  reason, grant scope, adapter result, affected artifact hashes, and terminal
  status. Approval state is durable enough to explain a completed action but
  is invalid after process recovery unless a recovery protocol explicitly
  proves that no effect occurred.

The current shared approval map is process-global and in-memory. Its IDs are
not bound to a run or project, `session` scope has no normalized semantics, and
unknown IDs are deliberately treated as handled for a separate UI flow. It
must not authorize research execution.

## Imported content and prompt injection

- Papers, webpages, notebooks, datasets, repository files, comments,
  filenames, tool results, provider messages, and extracted metadata are
  untrusted data regardless of author or format.
- Importers parse in a constrained process where practical, enforce type and
  size limits, disable macros/scripts/external entity resolution, and do not
  fetch embedded URLs without a separate network decision.
- Stored content carries origin URI/reference, retrieval time, importer and
  parser version, content hash, media type, transformations, and trust label.
  Extracted claims never replace the source bytes or their hash.
- Context serialization uses typed fields and explicit untrusted-content
  delimiters. Imported text cannot supply system messages, tool definitions,
  approval decisions, destination changes, hidden context requests, or policy
  overrides.
- Instructions found inside content are surfaced as injection indicators and
  remain quoted evidence. They never trigger tools or broaden retrieval.
- Provider output and tool output are validated before becoming an action.
  Treating model-generated JSON as structured does not make it trusted.

## Provenance integrity

Every security-relevant event is append-only and contains event ID, project
and run IDs, monotonic sequence, UTC timestamp, actor type/ID, action type,
normalized input/result hashes, policy and adapter versions, and the previous
event hash. The event hash covers the canonical serialized event and previous
hash, forming a per-run chain. Referenced source and artifact content uses
SHA-256 or a stronger reviewed hash.

- Database permissions and repository APIs deny update/delete of provenance
  events during ordinary operation. Corrections append a superseding event.
- Run completion verifies sequence continuity, event hashes, context/payload
  hashes, approval-to-action linkage, and output artifact hashes. An incomplete
  or broken chain marks the run `integrity-unknown`; it is never silently
  repaired.
- Export includes the chain, hash algorithm/version, referenced manifests,
  and a verification report. Import verifies before merging and preserves
  original IDs/origin. Backups retain provenance according to
  `LOCAL_RESEARCH_STORAGE.md`.
- Hash chains reveal database modification but do not prevent a privileged
  local attacker from rewriting an entire database. Before provenance is used
  as external attestation, signed checkpoints must be stored outside that
  database (for example in the OS store or a user-exported signed bundle).

Current provenance records project ownership and creation events, but metadata
is `{}`, mutations are not prohibited at the database layer, and there are no
run sequences, input/output hashes, approval links, hash chains, or integrity
verification. Current records are useful history, not tamper-evident evidence.

## Findings and required work

No external research execution adapter may be enabled until all P0 items that
apply to it are complete.

| ID | Priority | Finding / implementation work | Required verification |
| --- | --- | --- | --- |
| LS-01 | P0 | Harden loopback authentication: constant-time comparison, Host/Origin policy, body/time/concurrency limits, early auth, shutdown invalidation. | Integration tests reject missing/wrong/stale tokens, hostile origins/hosts, oversized/slow bodies, and non-loopback bind attempts. |
| LS-02 | P0 | Replace arbitrary project roots in research APIs with registered project IDs and canonical root resolution; enforce canonical symlink containment. | Two-project and symlink/junction tests prove reads, watches, Git operations, and actions cannot escape or cross projects. |
| LS-03 | P0 | Implement OS-backed `CredentialStore`; remove credential-file access from every migrated research adapter; add schema-level secret-field rejection and diagnostic redaction. | Platform contract tests plus canary-secret scans prove no value reaches renderer, HTTP responses, SQLite, logs, context, provenance, exports, crash data, or child environments. |
| LS-04 | P0 | Implement immutable context manifests, exact payload hashing, preview UI, redaction report, and approval binding/reapproval rules. | Tests mutate each selected file/range/summary/destination after preview and prove transmission is denied until a new approval; cancellation and disconnect send zero provider bytes. |
| LS-05 | P0 | Implement provider-neutral, run/project-scoped action classification and grants; migrate adapters only when effects can pause. | Contract tests for every adapter prove denial, timeout, cancellation, crash, disconnect, replay, parameter widening, and unknown action classes fail closed. |
| LS-06 | P0 | Build constrained importers and a typed context serializer with origin/trust labels and prompt-injection separation. | Adversarial corpus tests include system-prompt text, tool JSON, path/URL instructions, HTML/script, archive bombs, malformed documents, and embedded fetches; none can authorize or execute an action. |
| LS-07 | P0 | Extend provenance to run/action/context events with immutable repository methods, canonical hashes, per-run sequence/hash chain, and verification. | Database/API tamper tests detect update, deletion, reordering, cross-project linkage, manifest substitution, result substitution, and broken export/import chains. |
| LS-08 | P1 | Add separately paired, revocable, capability-scoped authentication for future CLI, extension, and MCP clients. Never share the renderer token. | Pairing, scope, expiry, revocation, replay, and confused-deputy tests cover each client type. |
| LS-09 | P1 | Add metadata-first repository scanners/watchers with fixed Git commands, consistent ignores, bounded queues, and auditable session summaries. | Fixture repositories cover secret directories, hooks/filters, nested repos, worktrees, case variants, event floods, and symlink replacement. |
| LS-10 | P1 | Add signed provenance checkpoints before claiming externally verifiable provenance. | Verification detects full-chain rewrite, wrong signing identity, revoked key, rollback to an older checkpoint, and modified artifact bundles. |

## Release gate evidence

The implementation owner for each item must attach:

- the contract/schema and threat addressed;
- unit and integration test names, including at least one fail-closed case;
- packaged-app secret scan and dependency/security scan results where relevant;
- manual evidence of context and action previews for each enabled adapter; and
- a statement of remaining limitations and the next review date.

Security review is repeated when an adapter gains a capability, a context
field is added, a credential owner or transport changes, an importer supports
a new format, provenance serialization changes, or a local-service client is
added.
