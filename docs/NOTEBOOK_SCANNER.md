# Static notebook scanner

Cly imports Jupyter `.ipynb` files through the local service without starting a
kernel, evaluating source, importing notebook modules, or invoking a shell. The
only accepted input is a project-relative `.ipynb` path under the registered,
canonical project root.

## API

`POST /api/projects/:projectId/notebooks/import`

```json
{ "path": "notebooks/analysis.ipynb" }
```

The local service rejects absolute paths, traversal, links that resolve outside
the registered project, non-files, invalid JSON, unsupported notebook shapes,
files over 8 MiB, more than 5,000 cells, more than 100 outputs per cell, and
more than 10,000 outputs in total. Version 4 or newer notebook structure is
required, and individual cell sources are limited to 1 million characters.
Imported text, output
metadata, HTML, tracebacks, and paths remain untrusted data. The scanner hashes
large output bodies but does not copy their body into research-object payloads.

## Objects and provenance

The scanner creates project-scoped objects for the notebook, cells, stored
outputs, dependencies, datasets, metrics, figures, tables, methods, inferred
experiments and stored runs, explicit Markdown objectives and claims, and risk
findings. IDs are SHA-256-derived from the project, notebook path, and stable
notebook coordinates (Jupyter cell IDs when available, otherwise cell index).
Re-importing the same notebook is idempotent; changed content updates the same
logical notebook and cell identities.

Cell objects retain a bounded 4,000-character source preview plus the complete
source hash and file locator. Stored error outputs retain a bounded error name
and value plus traceback line count/hash; output bodies are never interpreted.

Every inferred relationship is persisted with:

- `origin: "inferred"`;
- `verificationState: "unverified"`;
- exact notebook path and cell/output locator;
- a bounded untrusted excerpt; and
- a SHA-256 content hash.

Objects and edges remain unreviewed until a person explicitly reviews them.
Every changed object/edge and every completed import appends immutable,
project-scoped provenance. Re-importing unchanged content leaves graph rows
unchanged while still recording the import attempt.

## Deterministic checks

The first scanner version reports stored execution errors and the following
notebook risks without executing code:

- decreasing execution counts (out-of-order execution);
- outputs without an execution count or a mismatched recorded source hash;
- execution-count gaps that imply hidden kernel state;
- known randomness APIs without a detectable seed or `random_state`;
- hard-coded local absolute paths;
- non-standard imports absent from notebook dependency metadata;
- code/output execution-count mismatches; and
- embedded output bodies over 256 KiB.

These are review findings, not proof. Their inferred/unverified state prevents a
static heuristic from silently becoming an approved scientific fact.
