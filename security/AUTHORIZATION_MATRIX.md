# Cly Authorization Matrix

This matrix describes the local-first product in this repository. Cly has no
first-party remote user, organization, invitation, or membership service.
Accordingly, conventional SaaS roles are **N/A** until such a service exists.

Legend: **Deny** = no authority; **Local** = the interactive OS user through a
validated renderer/API path; **Scoped** = allowed only within the registered
project/session capability; **Approve** = a fresh durable or native human
approval is also required; **N/A** = role/action is not implemented.

| Resource / action | Anonymous website | Authenticated SaaS user | Guest | Member | Admin | Owner | Agent / service | Internal admin | Local OS user |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| View local projects/research/chats | Deny | N/A | N/A | N/A | N/A | N/A | Deny by itself | N/A | Scoped |
| Create/update/delete local research records | Deny | N/A | N/A | N/A | N/A | N/A | Approve + Scoped | N/A | Scoped |
| Read project files and Git status | Deny | N/A | N/A | N/A | N/A | N/A | Policy + Scoped | N/A | Scoped |
| Write/move/delete project files | Deny | N/A | N/A | N/A | N/A | N/A | Approve + Scoped | N/A | Scoped |
| Run commands or tests | Deny | N/A | N/A | N/A | N/A | N/A | Approve + Scoped | N/A | Approve + Scoped |
| Perform Git mutation/push | Deny | N/A | N/A | N/A | N/A | N/A | Approve + Scoped | N/A | Approve + Scoped |
| Run an agent/provider request | Deny | N/A | N/A | N/A | N/A | N/A | Policy + current session | N/A | Scoped |
| Use provider credentials | Deny | N/A | N/A | N/A | N/A | N/A | No direct secret access | N/A | Main-process mediated |
| Read raw secrets/private device keys | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | OS credential-store mediated |
| View security/audit events | Deny | N/A | N/A | N/A | N/A | N/A | Scoped append/read APIs only | N/A | Scoped |
| Pair/sync a device | Deny | N/A | N/A | N/A | N/A | N/A | Trusted non-revoked device | N/A | Explicit local pairing |
| Use shell/clipboard/save/editor IPC | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | Valid bound renderer only |
| Control agent/workspace windows | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | Bound role/session only |
| Check/install updates | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | Valid privileged renderer |
| Share/export/invite/change roles | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | Export only where explicitly implemented |
| Transfer/delete a remote workspace | Deny | N/A | N/A | N/A | N/A | N/A | Deny | N/A | N/A |

## Enforcement locations

| Boundary | Authoritative inputs | Enforcement |
| --- | --- | --- |
| Loopback HTTP | Per-launch token, exact renderer origin, Host, route project ID | `electron/api/app.js`, route schemas, project authority registry |
| Renderer IPC | `webContents.id`, bound window role/session, strict payload schema | `electron/main.js`, `electron/privileged-ipc.js`, preload allowlist |
| Project filesystem | Registered canonical root/worktree, not a renderer path | project Git authority, file services, notebook importer |
| Tool execution | Server policy plus exact durable approval scope | approval gate, production composition, durable tool effects |
| Provider egress | Canonical manifest, destination, current approval, host confirmation | context repository, chat routes, provider runners |
| Device sync | Project, sender/recipient identity, key version, trust/revocation, signature, replay state | sync schema/repository/service/crypto and key vault |

## Server-side verification rules

- Treat `projectId`, `sessionId`, `requestId`, object IDs, paths, role labels,
  and ownership claims from a renderer or model as untrusted selectors.
- Resolve project authority from the local registry/database and include the
  authoritative project in every protected lookup and mutation.
- Bind IPC to the calling `webContents`, not merely to channel knowledge.
- Re-evaluate policy and approval immediately before effects; a prior UI state,
  cached message, or model instruction is not authorization.
- Deny unknown tools, malformed policies, missing approval resolvers, expired or
  mismatched approvals, stale window revisions, revoked devices, and unknown
  integration/provider states.
- If remote teams are added, implement tenant membership and role transitions
  on the server before exposing sharing, invitations, or remote access. Never
  infer those roles from the current local matrix.
