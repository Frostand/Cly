# Cly Architecture

## Direction

Cly is a standalone research platform. It is not an IDE fork. The research core — graph, sources, claims, provenance, memory, and agent orchestration — is independent of the editor and code workspace.

The coding workspace (editor, terminal, git, notebooks) is an integrated module within Cly. It is currently implemented with Dream IDE. This module is replaceable: the research core does not depend on Dream internals, only on typed service interfaces.

## Layers

```
┌─────────────────────────────────────────────────────────┐
│                 EXTERNAL INTEGRATIONS                   │
│   VS Code ext   Jupyter   GitHub   CLI   MCP server     │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                   CLY APPLICATION                       │
│   Dashboard   Literature   Experiments   Claims         │
│   Graph   Sources   Audits   Planner   Agents           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                     CLY CORE                            │
│   Research objects   Relationships   Provenance events  │
│   Service contracts   Validation   Repository           │
└──────────────────────────┬──────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────┐
│                  CODING WORKSPACE                       │
│   Editor   Terminal   Git   Notebooks   Agentic coding  │
│   (Dream IDE — replaceable implementation component)    │
└─────────────────────────────────────────────────────────┘
```

### Layer 1: Cly Core

The product's actual value. Must remain independent of any editor.

- Typed research objects, directed relationships, and provenance events
- Project-scoped persistence (SQLite/Drizzle)
- Service contracts with mock implementations
- Validation rules
- Agent orchestration primitives
- Context and memory management

The core communicates through typed service interfaces. No core code imports from the coding workspace.

### Layer 2: Cly Application

The main user interface. A desktop application (Electron) or local web application.

- Research dashboard and project overview
- Source manager and literature discovery
- Literature matrix
- Research graph (objects and relationships)
- Experiment manager and run tracking
- Claim audit board
- Provenance and reproducibility views
- Decision log and next-step planner
- Agent workspace and context composer
- Integrations and settings

### Layer 3: Coding Workspace

An integrated coding environment for computational research. Currently implemented with Dream IDE. Its job is limited to:

- Code editing
- Terminal access
- Git operations
- Notebook viewing and scanning
- Diff views
- Agentic coding
- Research-aware context panels

This layer is a module, not the foundation. It can be replaced without affecting the research core.

### Layer 4: External Integrations

Allow researchers to work outside Cly through:

- VS Code / Cursor extension (for editor-native research context)
- Jupyter extension (for notebook integration)
- GitHub integration (for commit/branch tracking)
- CLI and SDK (for scripted experiment registration)
- MCP server (for agent tool access)

## Local-first storage

SQLite and Drizzle are the source of truth for application and research metadata. The research graph is represented relationally. Large datasets and generated artifacts remain outside the database and are referenced by metadata and content hashes.

Provider credentials belong in the operating-system credential store. They must not be written to SQLite, project files, logs, git history, or agent context.

### Secure Cly Dev device sync

Cly Dev sync is an encrypted, transport-neutral protocol layered on the
local-first session repository. It synchronizes only records explicitly marked
`transferable`: approved chat messages, context manifests, summaries, plans,
decisions, progress, remaining-work state, approvals, and session state.
Tool output, diffs, test logs, costs, failures, absolute paths, environment
metadata, local notes, and uncommitted-file paths remain local.

Each installation owns an X25519 encryption key and an Ed25519 signing key.
Private key material is encrypted by Electron `safeStorage` and is unavailable
when the operating-system credential store is locked or unsupported. SQLite
contains only opaque credential references and public keys. Devices exchange
public pairing bundles, and the user must verify the displayed fingerprint
through a separate channel before either device can receive new state.

The sender creates a recipient-isolated envelope with AES-256-GCM, wraps its
content key using X25519 plus HKDF-SHA-256, and signs the canonical envelope
with Ed25519. A device therefore cannot recover another device's queued state
or discover its recipient slot. The durable outbox and inbox store ciphertext
envelopes only. Bounded batches, resumable cursors, acknowledgements,
exponential retry metadata, and content-free audit events make the protocol
suitable for an offline queue or a future relay without giving that transport
access to plaintext.

Local key rotation advances exactly one version and requires the new
fingerprint to be verified on peers. Unacknowledged envelopes signed by the
retired key are removed so the next staging pass encrypts them with the active
key. A peer may accept any strictly newer version after verifying its
fingerprint, which keeps recovery possible when intermediate rotations were
missed. Old public keys are retained only for records already in flight.
Revocation blocks new exports and marks pending deliveries policy-blocked.
Mutable handoff records use base revisions; concurrent updates create an
explicit conflict that the user resolves rather than silently choosing a
winner.

## Extension boundary

Cly code lives under `src/features/cly/`. The coding workspace infrastructure lives under `src/components/ide/` and `electron/`. Research modules depend on typed service interfaces (`src/features/cly/services/interfaces.ts`), not on editor internals.

This boundary ensures the coding workspace can be replaced or multiple editors can be supported without rewriting the research platform.

External and embedded clients depend on the transport-neutral contracts in
`src/features/research/contracts`. See [Research core and client contract](research-client-contract.md)
for attachment, authorization, provenance, and failure semantics.

## Data flow

```text
Research screen
  → typed research client
  → project-scoped service
  → research repository
  → SQLite / Drizzle
  → provenance event
```

Every mutation must carry a project identifier, validate its payload, create or update a research object, and record sufficient provenance to explain the change.

## Three usage modes

### Mode 1: Research-only
For literature reviews, planning, evidence analysis, or claim auditing. The user may never open the code editor.

### Mode 2: Integrated computational research
For users doing literature, coding, notebooks, experiments, and reports inside Cly. This is the primary target.

### Mode 3: Companion mode
For researchers who continue using VS Code, Cursor, JupyterLab, or another environment. Cly syncs commits, branches, notebook metadata, experiment runs, figures, and provenance through integrations.
