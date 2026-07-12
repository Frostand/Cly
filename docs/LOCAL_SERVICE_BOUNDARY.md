# Local Cly service boundary

- Status: normative architecture contract
- Owner: Cly research core
- Last reviewed: 2026-07-12

## Purpose

The local Cly service connects research records to work performed in a local
repository without making the research API a general IDE, shell, database
console, or filesystem server. It owns project identity, observation,
experiment/run capture, artifact identity, context retrieval, execution
authorization, and provenance. The embedded coding workspace and external
editors are clients of this boundary; they are not its policy authority.

Every operation starts with an opaque Cly project ID. The service resolves
local locations from its own project registry and never treats a path,
command, SQL statement, environment variable, or credential supplied by an
ordinary client as authority.

## Capability boundary

| Capability | Allowed client input | Service output | Permission and data rule | Provenance family |
| --- | --- | --- | --- | --- |
| Project identity | Project ID and research metadata; trusted registration flow supplies the root | Stable ID, display metadata, repository association | One canonical root per project; changing it invalidates observations and grants | `project.*` |
| Filesystem observation | Project ID plus a named scanner and bounded, project-relative selectors | Relative path, type, size, time, status, and hash when declared | Metadata-only by default; canonical containment after symlink resolution; no parent, home, sibling, or hidden-secret traversal | `repository.scan.*`, `repository.change.*` |
| Git observation | Project ID and a fixed observation operation | HEAD/ref identity and project-relative worktree status | Fixed read-only Git argument arrays; no hooks, filters, pagers, credential helpers, optional locks, or caller commands | `repository.scan.*`, `repository.change.*` |
| Experiment/run capture | Project ID, typed experiment/run manifest, declared adapter, and referenced object IDs | Stable run ID, state, timing, exit classification, hashes, and object links | Manifest fields are schema-allowlisted; commands are adapter-owned and separately approved; secrets are rejected | `experiment.*`, `run.*` |
| Artifact indexing | Project ID, run ID, project-relative output reference, media type, size, and content hash | Stable artifact identity, lineage, regeneration/staleness state | Metadata belongs in SQLite; large content remains beneath an approved root or managed artifact store; content is read only with an explicit capability | `artifact.*` |
| Context retrieval | Project ID, research-object IDs, project-relative ranges, budget, and destination | Immutable manifest, preview, redactions, and payload hash | Graph traversal and file reads are bounded; external transmission needs hash-bound approval | `context.*`, `transmission.*` |
| Agent execution | Project ID, run ID, registered adapter/capability ID, typed arguments, and approval reference | Structured events, bounded output, diffs, artifacts, and terminal state | Adapters can narrow but never broaden grants; write, process, network, credential, destructive, and external effects fail closed without approval | `approval.*`, `agent.*`, `run.*` |
| Provenance review | Project ID and bounded pagination/filter values | Ordered typed events with relative references, hashes, actor, adapter, and time | Project-scoped, append-only mutation API; no sensitive content copies, credentials, raw SQL, or absolute paths | all families |

The currently implemented slice is project registration in SQLite, canonical
Git-root validation, bounded Git status observation, project association, and
reviewable provenance retrieval. Experiment execution, managed artifact
content, context transmission, and agent capability grants remain behind
their existing typed frontend contracts until their policy-enforcing service
adapters are implemented.

## Implemented observation API

The research service exposes two observation operations:

```text
POST /api/projects/:projectId/repository-observations
GET  /api/projects/:projectId/provenance?limit=1..500
```

The scan request has no body. It cannot select a path, Git arguments, a
command, an environment, a ref, or an output location. The service:

1. loads the project from SQLite by ID;
2. resolves the stored root with `realpath` and rejects aliases;
3. requires that root to equal Git's canonical top level;
4. runs a fixed, non-interactive, read-only Git status operation with bounded
   output;
5. validates every returned path as project-relative; and
6. appends one scan summary and one event per change.

An observation returns only the project ID, observation time, HEAD hash, and
status records shaped as `{ path, indexStatus, worktreeStatus,
originalPath? }`. File contents and absolute roots are absent. Provenance
listing accepts only a bounded numeric limit and uses fixed parameterized SQL.

## Project registration and lifecycle

Project registration is a privileged provisioning action, not a general
integration API. The desktop app obtains a root through an operating-system
picker or an explicit trusted import, canonicalizes it, shows the user the
resolved repository, and binds it to a new project ID. Extensions, MCP
clients, provider tools, imported content, and agent output cannot create or
retarget that binding.

The service revalidates the canonical root for every observation and
capability grant. A moved root, symlink substitution, nested worktree, deleted
directory, or changed registration stops the session and invalidates grants.
Watchers use the same checks and stop when the project closes. Reopening a
project creates a new observation session; it does not revive execution or
transmission approval.

The existing `PUT /api/projects/:projectId/research` path-bearing route is an
internal desktop migration/compatibility route. It is not an extension, MCP,
or agent contract and must be replaced by the trusted registration broker
before those clients can provision projects. Likewise, the coding workspace's
legacy file, terminal, runner, and Git routes remain outside the research
service boundary.

## Local data ownership

SQLite owns project identities, typed research objects and relationships,
run/artifact metadata, approvals, context manifests, and provenance. It does
not store repository file bodies, artifact blobs by default, provider
credentials, unrestricted environment snapshots, or arbitrary tool output.
Repository and managed-artifact files remain on disk under separately
approved canonical roots. Credentials remain in their owning CLI or the
operating-system credential store.

Exports are project-scoped and enumerate their schema and referenced hashes.
Deleting a project removes its SQLite records and revokes its grants; it does
not delete the registered repository or external data. Managed artifact
deletion requires a separate, explicit destructive approval. Retention,
backup, and recovery follow [Local research storage](LOCAL_RESEARCH_STORAGE.md).

## Prohibited API shapes

The research service does not expose:

- endpoints accepting absolute filesystem roots or unrestricted relative
  traversal for reads, writes, watches, imports, or artifact lookup;
- generic `readFile`, `writeFile`, directory walk, shell, process, Git command,
  environment, HTTP proxy, or credential endpoints;
- SQL strings, table names, column names, query fragments, database handles,
  or generic key/value persistence;
- capability grants inferred from a renderer token, project registration,
  imported instructions, provider output, or a previous approval; or
- remote compute orchestration.

New APIs must define a typed action, fixed resource class, project-scoping
rule, input and output bounds, approval class, and provenance events before
implementation. Convenience is not a reason to add a generic escape hatch.

## Trust and review

The local service is the policy enforcement point. Renderers, editors,
extensions, MCP clients, imported research, repositories, provider adapters,
and tool output are untrusted. Authentication proves which launched Cly
instance is calling; it does not replace project scope or capability checks.
The complete threat model and approval requirements are in
[Local service security model](LOCAL_SERVICE_SECURITY_MODEL.md).

