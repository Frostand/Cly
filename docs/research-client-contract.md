# Research core and client contract

**Status:** normative companion-mode specification

**Owner:** Cly research core

**Last reviewed:** 2026-07-21

The canonical transport-neutral client boundary is
`src/features/research/contracts`. It is shared by the desktop app, focused
code workspace, VS Code-compatible extensions, Jupyter integrations, CLI/MCP
tools, and GitHub integrations. Adapters translate their native protocol into
this contract; the research core never imports editor, Electron, React, or
workspace state.

Companion mode brings Cly research context into a user's existing tools. It
does **not** embed, replace, or take ownership of editors, terminals, Git
clients, or notebooks. Native tools remain responsible for editing, executing,
committing, kernel lifecycle, authentication, and their own UI. Cly remains
the authority for research-object identity, project scope, approvals,
decisions, and provenance.

## Shared companion contract

Every request names an opaque Cly project ID; a file path, repository URL,
workspace name, notebook name, or Git remote is evidence, never project
authority. The service resolves the registered project root and verifies that
the requesting client is paired and capability-scoped for that project. A
client must not receive a renderer token, create or retarget a project, or
use a project ID supplied by external content as authority. See [Local Cly
service boundary](LOCAL_SERVICE_BOUNDARY.md) and [Local service security
model](LOCAL_SERVICE_SECURITY_MODEL.md) for the enforcing boundary.

Every mutation is project-scoped and carries authorization plus provenance.
Authorization names the actor, client kind, and allowlisted capabilities.
Provenance names the operation, origin, occurrence time, and optional source
URI/content hash. Credentials, raw editor state, environment values, and
unbounded file content are deliberately absent.

The companion read model exposes an active-task snapshot for one project:

| Field | Meaning |
| --- | --- |
| `projectId` | The registered Cly project that owns the task. |
| `taskId`, `title`, `state` | Stable task identity and user-facing status. |
| `revision` | Monotonic task/context revision used to mark stale client displays. |
| `researchObjectRefs` | Bounded links to the task's experiment, source, hypothesis/claim, run, and decision context. |
| `updatedAt` | The time Cly last changed the snapshot. |

An adapter displays this snapshot as **Active Cly task** and refreshes on focus,
explicit refresh, and a bounded subscription/polling interval. It shows a
clear empty, unavailable, or stale state; it does not infer a task from the
open file, branch, notebook, prompt, or PR. Selecting a task in a companion
client is a local display choice until Cly explicitly records a task change.

All operations return `ResearchResult<T>`. Failures use stable
machine-readable codes, a safe human message, and an explicit `retryable`
flag. Clients should request permission again only for `permission-denied`,
resolve conflicts before retrying `conflict`, retry `unavailable` with bounded
backoff when `retryable` is true, and never expose secrets in `message` or
`details`. `operationId` supports idempotency and audit correlation.

## Deep links and external locations

The canonical Cly link is project-bound and opaque:

```text
cly://research/projects/{projectId}/{resource}/{resourceId}
  ?attachmentId={attachmentId}&revision={revision}&focus={logicalFocus}
```

`projectId`, `resource`, and `resourceId` are required. `resource` is
`objects` for a research object and `provenance` for an immutable provenance
event. A mutation returns the latter form (for example,
`cly://research/projects/{projectId}/provenance/{provenanceEventId}`) so a
companion can reopen the exact association rather than a similarly named
object. `attachmentId`, `revision`, and `focus` are optional opaque
identifiers; `focus` may identify a logical pane, cell, range, or review item,
but never carries file content. IDs are URL-encoded. Links contain no
filesystem root, credential, bearer token, provider token, signed approval, or
authority to perform a mutation. Opening one re-authenticates through the
paired Cly instance, resolves the project first, then verifies that the target
object or provenance event belongs to that project. Cross-project, unpaired,
revoked, malformed, or unknown links fail without revealing another project's
metadata.

A link opens the associated experiment, source, or hypothesis/claim in Cly.
An attachment link opens its Cly object first, then may offer an explicit
user-initiated handoff to a native location. Cly stores a native handoff (for
example, a `vscode://` URI, JupyterLab route, GitHub URL, or CLI command) as
an external-location attribute; it never replaces the canonical Cly link or
is executed automatically. The native URI is validated against the registered
project or declared repository before it is shown.

If a requested revision, hash, range, cell, or commit no longer matches the
available content, Cly opens the research object and labels the external
reference **stale** or **unavailable**. It must not silently redirect to a
different revision. Navigation is read-only and does not create a research
mutation; an attachment, review, approval, or decision made after navigation
records the link/reference used as provenance.

## Attachment semantics and provenance

Attachments are discriminated records for code locations, commits, notebooks,
runs, and artifacts. URIs identify external content; hashes and revisions make
identity reproducible without copying large files into the research database.
Each attachment is made to a Cly experiment, source, hypothesis/claim, run,
artifact, or decision in the same `projectId`.

| User selection | Contract representation | Required provenance identity |
| --- | --- | --- |
| File | `code` attachment with project-relative or canonical file URI, revision, and available line range | Repository identity, project-relative path, revision/content hash when available, adapter and installation ID. |
| Text selection | `code` attachment with exact start/end lines | File identity and revision plus a selection hash and normalized range. The service does not treat a line range alone as immutable evidence. |
| Function or method | `code` attachment spanning the resolved definition | Qualified symbol/signature, definition range, revision, and definition/content hash. Overloads and generated definitions include the resolver's identity. |
| Notebook cell | `notebook` attachment with notebook URI and `cellIds` | Notebook content hash/revision, stable cell ID, cell source hash, cell position at capture, and kernel/execution count only as descriptive metadata. |
| Commit | `commit` attachment | Canonical repository identity, full immutable SHA, and, when known, parent SHA(s), ref observed, and adapter-observed time. A branch name alone is not a commit attachment. |

The existing `Attachment` shape carries the location, revision, notebook cell,
and commit primitives. Adapter-specific facts such as symbol identity and
selection hash belong in allowlisted provenance metadata until a future
versioned contract promotes them to first-class fields. An implementation must
not discard those facts merely because its native protocol cannot navigate to
them later.

### `cly.companion-attachment-provenance@1`

Attachment provenance uses the named, versioned
`cly.companion-attachment-provenance` schema at version `1`. It is encoded in
the scalar `ProvenanceInput.metadata` map; a companion must not place an
unversioned object or arbitrary adapter payload there. Every request includes
`companion.schema: "cly.companion-attachment-provenance"` and
`companion.version: 1`. Keys from this schema that do not apply are omitted,
not sent as `null`; unknown `companion.*`, `code.*`, `selection.*`, `symbol.*`,
`notebook.*`, or `commit.*` keys are rejected.

| Key | Scalar type and value shape | Applies to |
| --- | --- | --- |
| `companion.schema` | Exact string `cly.companion-attachment-provenance` | All |
| `companion.version` | Number `1` | All |
| `companion.adapterVersion` | Nonempty ASCII string, maximum 100 characters | All |
| `repository.identity` | Opaque Cly repository ID or sanitized `github:owner/repository` string; never a credential-bearing remote | File, selection, symbol, notebook, commit |
| `code.path` | NFC UTF-8, `/`-separated project-relative path, maximum 4,000 characters | File, selection, symbol |
| `code.revision` | Full Git SHA or provider revision string, maximum 256 characters | File, selection, symbol |
| `code.contentSha256` | Lowercase 64-character SHA-256 hex | File, selection, symbol |
| `selection.startLine`, `selection.endLine` | Positive safe-integer numbers; inclusive, one-based, and ordered | Selection, symbol |
| `selection.encoding` | Exact string `utf8-lf` | Selection, symbol |
| `selection.sha256` | Lowercase SHA-256 of the selected UTF-8 bytes after CRLF/CR normalization to LF, without trimming | Selection |
| `symbol.language` | Lowercase language identifier, maximum 50 characters | Symbol |
| `symbol.qualifiedName` | NFC string, maximum 1,000 characters | Symbol |
| `symbol.signatureSha256` | Lowercase SHA-256 of the normalized resolver signature; source/signature text is not copied into metadata | Symbol |
| `symbol.definitionSha256` | Lowercase SHA-256 of the `utf8-lf` definition bytes | Symbol |
| `symbol.resolver` | NFC `name@version` string, maximum 200 characters | Symbol |
| `notebook.revision` | Full Git SHA, notebook content revision, or hash-bound provider revision, maximum 256 characters | Notebook/cell |
| `notebook.contentSha256` | Lowercase SHA-256 of the captured notebook bytes | Notebook/cell |
| `notebook.cellIdsJson` | Canonical JSON string containing a nonempty array of unique stable cell-ID strings in attachment order | Notebook/cell |
| `notebook.cellSourceSha256ByIdJson` | Canonical JSON string mapping every captured cell ID to a lowercase SHA-256 of its `utf8-lf` source bytes | Notebook/cell |
| `notebook.cellPositionByIdJson` | Canonical JSON string mapping every captured cell ID to its zero-based safe-integer position at capture | Notebook/cell |
| `commit.parentShasJson` | Canonical JSON string containing the ordered array of full lowercase parent SHAs; `[]` is valid for a root commit | Commit |
| `commit.refObserved` | NFC ref name, maximum 500 characters; descriptive only and never substituted for the attachment SHA | Commit |
| `commit.observedAt` | UTC RFC 3339 string with `Z` suffix | Commit |

Because `metadata` values are scalar, the three `*Json` values are strings,
not nested arrays or objects. Their canonical JSON uses UTF-8, NFC-normalized
strings, lexicographically sorted object keys, source order for arrays, no
insignificant whitespace, and standard JSON escaping. Cell maps must have
exactly the same keys as `notebook.cellIdsJson`. JSON scalar strings are
limited to 32 KiB each; the complete metadata map is limited to 128 entries
and 128 KiB. Integers must be JSON-safe integers. Hashes are computed before
JSON string escaping. These encoding rules make retries and provenance hashes
stable across adapters while remaining compatible with
`Readonly<Record<string, string | number | boolean | null>>`.

Before writing, an adapter resolves the target object in the named project,
verifies `attachment:write`, normalizes the external reference, and submits a
new `operationId`. The service deduplicates retries by that operation ID and
records the actor, paired client/installation, adapter version, occurrence
time, source URI, revision/hash, target object, and normalized attachment.
It records hashes and references rather than a second copy of source code,
notebook output, Git credentials, or unbounded diff content. Changed content
creates a new attachment/provenance event; it never mutates the evidence
behind a prior event.

## Adapter responsibilities

Every adapter must display the active-task states, attach only the native
references it can identify faithfully, open canonical Cly links, expose
bounded agent-diff review, and submit an explicit human decision through the
rules below. A capability not yet implemented is displayed as unavailable; an
adapter does not emulate it with a generic filesystem, shell, Git, database,
or credential API.

| Adapter | Active task and attachment responsibilities | Open and review responsibilities | Decision responsibility |
| --- | --- | --- | --- |
| **VS Code-compatible extension** | Show the active task in a status/side-panel surface. Attach the active file, selection, or resolved function as a `code` reference; include revision and hashes from the editor/document model. It may attach a commit discovered through a bounded project Git adapter. | Resolve `cly://` links to Cly. Open experiment, source, or hypothesis/claim in Cly; offer a user-clicked editor handoff for a verified file/range. Show a bounded agent diff with changed-file navigation and verified/inferred/missing research links. | Let a signed-in human submit an approval, rejection, or approved decision after reviewing the exact snapshot. Never treat editor focus, a command invocation, or an extension setting as approval. |
| **Jupyter integration** | Show the active task in a notebook/lab panel. Attach a notebook or selected cell using stable cell ID, notebook hash, source hash, and position; it may attach a file/function only when an explicitly supported language service resolves it. | Open Cly experiment, source, or hypothesis/claim links. Offer user-initiated notebook/cell navigation after a hash check. Render agent-diff review without executing a cell, kernel, or notebook. | Submit a human-confirmed decision/review only; a kernel, notebook metadata, or cell output cannot approve an action or a decision. |
| **CLI** | `cly task show` presents the active task in text/JSON. Explicit commands attach a path/range/symbol or commit after Cly resolves the registered project; stdin may carry structured metadata but never implicit project authority. | `cly open` resolves a canonical Cly link and opens/prints the Cly object. `cly review diff` retrieves, verifies, and prints every exact patch; `--json` returns the manifest and content/chunk schema below. Hash-only output is insufficient for review. It must not page through a shell, run Git hooks, or execute a supplied command as a consequence of review. | `cly decision approve` and review-resolution commands require an interactive human confirmation (or a separately authenticated, policy-approved noninteractive human workflow), exact snapshot IDs, and a note. |
| **MCP server** | Expose read-only active-task and object tools plus explicit attachment proposals/requests. Tool input must include a paired project ID and structured reference; the server never accepts a raw root or grants a client broader access. | Return canonical Cly links and a bounded diff manifest plus a read-only content tool that retrieves exact patch chunks by `snapshotId`, `fileId`, and `contentId`. MCP responses include base64 patch bytes and integrity fields, not hashes alone. An agent can identify missing or inferred links and propose a review or decision, but cannot resolve it. | MCP tools may create a draft for a human; they cannot approve an agent action, diff, research link, or decision, nor claim that a human approved it. |
| **GitHub integration** | Show the active Cly task in an app/check/PR context after repository-to-project association is verified. Attach immutable commit SHA(s), PR base/head snapshot, and repository identity; it cannot attach a local unpushed selection or notebook cell. | Add canonical Cly links to the associated experiment, source, or hypothesis/claim. Render the bounded Cly diff-impact review with verified/inferred/missing labels and changed commit snapshot. A PR refresh creates a new review snapshot. | A GitHub comment, check, or bot reaction is never an approval by itself. The integration records an approved/rejected decision only after a named human completes Cly's exact-snapshot confirmation; it writes the resulting immutable review/decision reference back to GitHub when permitted. |

## Agent diffs, approvals, and approved decisions

Agent diff review is an observation and governance workflow, not a write
permission. Cly creates a review snapshot from a project-scoped, bounded diff
manifest: repository identity, base/head or working-tree state, changed-file
paths and statuses, immutable patch content, changed commit SHAs, agent
run/adapter identity when applicable, and linked research objects. Links are
visibly `verified`, `inferred`, or `missing`; inferred links remain suggestions
and missing provenance is never fabricated.

### Exact diff content contract

The initial bound is 250 changed paths and 1 MiB of decoded UTF-8 patch bytes
for the whole snapshot. A snapshot records the bound/version and
`fileListState: "complete" | "truncated"`. Exceeding the path bound fails
snapshot creation or creates a non-approvable `truncated` snapshot; paths must
never be silently omitted. Text patches are produced through the fixed,
non-interactive Git adapter with three context lines and no external diff,
text-conversion, hooks, filters, or repository executables.

Every manifest file has this transport-neutral shape:

```ts
type DiffFile = {
  fileId: string;
  path: string;
  previousPath?: string;
  status: "added" | "copied" | "deleted" | "modified" | "renamed" |
    "type-changed" | "unmerged" | "unknown";
  contentState: "exact" | "redacted" | "truncated" | "unavailable";
  patch?: {
    contentId: string;
    mediaType: "text/x-diff;charset=utf-8";
    byteEncoding: "base64";
    byteLength: number;
    sha256: string;
    inlineBase64?: string;
  };
  excerpts?: Array<{
    reason: "redacted" | "truncated" | "binary" | "unavailable";
    oldStart?: number;
    newStart?: number;
    text: string;
    textSha256: string;
  }>;
  unavailableReason?: string;
};
```

`patch` is present only when `contentState` is `exact`. Its SHA-256 covers the
decoded bytes, and the immutable `contentId` addresses those same bytes inside
the snapshot. Small patches may use `inlineBase64`; otherwise clients retrieve
ordered chunks shaped as `{ snapshotId, fileId, contentId, offset,
byteLength, totalByteLength, dataBase64, chunkSha256, patchSha256, final }`.
Offsets and lengths count decoded bytes. Chunks must be non-overlapping and
contiguous; after decoding and concatenating them, the client verifies both
the total length and `patchSha256` before rendering. Retrieval with a changed
snapshot/file/content tuple fails instead of returning current repository
content. The snapshot hash covers the complete manifest, including ordered
file entries and every exact patch hash.

Excerpts are explicitly incomplete previews and never satisfy exact review.
`redacted` means a secret/content rule removed one or more source-diff bytes;
the response exposes only bounded safe excerpts and redaction reasons, never
the removed bytes. `truncated` means a file, byte, or transport bound prevented
complete capture and reports the applicable bound and captured size in the
manifest. `unavailable` covers binary/submodule content, missing refs,
permission failure, retrieval failure, or an unsupported encoding and carries
a safe reason. Renderers label every non-exact state at the file and review
level; they must not render excerpts or hashes as though they were the full
patch.

CLI and MCP clients must expose the actual reviewable content. The CLI decodes,
verifies, and prints the exact patch bytes (or includes the base64/chunk fields
in structured output). MCP exposes bounded manifest and chunk calls so its
caller can retrieve and verify all exact bytes. Neither client may claim a diff
was reviewed from path names, statistics, excerpts, summaries, or hashes alone.

An adapter may render the snapshot, request revision, or submit a human's
resolution. It must re-fetch before resolution and require a new review if
the repository identity, refs, file list, patch hash, content state, research
links, or agent-run output changes. Approval is enabled only when the file list
is complete, every changed file has `contentState: "exact"`, the resolving
adapter retrieved and verified every patch byte against its length and hash,
and the human review surface made that exact content available without hidden
redactions or omissions. A `redacted`, `truncated`, or `unavailable` file—or
any failed/missing exact-content retrieval—**prohibits approval**. The user may
still reject or request revision with a rationale. The authoritative review
record contains the snapshot ID/hash, project ID, reviewer identity, decision
(`approved` or `rejected`), rationale, confirmed link IDs, verified patch
hashes, timestamp, client and adapter version, and provenance event ID.

Diff approval is distinct from execution approval. It does not authorize an
agent to write files, run a process, use credentials, access a network, push a
branch, merge a PR, or alter a research object. Those effects retain their
run- and project-scoped Cly approval requirements. Provider-native
auto-accept, editor settings, agent text, and an MCP call cannot substitute
for a Cly approval. An adapter that cannot pause an effect is read-only or
plan-only for that effect.

An approved research decision is also explicit and append-preserving. A human
reviews the exact evidence/review snapshot and submits the decision text,
affected Cly object IDs, evidence/attachment IDs, rationale, and any
superseded decision ID. Cly validates that every reference belongs to the
project, records the actor and immutable provenance, and returns the decision
ID and canonical link. Corrections and changed evidence append a new,
superseding decision; they do not rewrite an approved record. Agents and
automations may draft decisions but cannot set their approval state.

## Rollout

| Phase | Deliverable and exit criteria |
| --- | --- |
| 0 — core prerequisites | Add separately paired, revocable, project- and capability-scoped authentication; active-task read model; canonical link resolver; attachment normalization; and append-only review/decision provenance. This phase must not expose a renderer token or a generic local-service API. |
| 1 — first shippable client | Ship a **VS Code-compatible extension** with active-task display; file, selection, function, and commit attachment; canonical Cly opens; bounded agent-diff review; and explicit human review/decision submission. The extension is shippable only with pairing/revocation, cross-project rejection, stale-reference handling, and approval re-fetch tests. |
| 2 — computational and automation companions | Add Jupyter notebook/cell attachment and Cly handoff, then CLI task/attach/open/review/decision commands. Retain human confirmation and project checks for scripted flows. |
| 3 — collaboration surfaces | Add GitHub PR/commit association and exact-snapshot review handoff. Add MCP read and proposal tools only after they enforce paired capability scope; MCP remains unable to approve effects or decisions. |
| 4 — hardening and expansion | Promote stable symbol/selection fields into a versioned contract if implementations need them, add adapter conformance fixtures, and extend only after security, provenance, and revocation tests cover each new capability. |

The boundary test scans contract imports to prevent dependencies on editor/UI
infrastructure and exercises every attachment category, permissions,
provenance, and failure behavior. Companion adapters additionally need
conformance tests for project isolation, link resolution, stale revisions,
attachment idempotency, diff-snapshot invalidation, and human-only approval
and decision mutations. `node scripts/check-companion-mode-contract.mjs`
provides the lightweight documentation-contract check for this specification.
