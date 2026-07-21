# Code research linking

Cly indexes metadata for tracked Python (`.py`) and Jupyter (`.ipynb`) files
inside a registered Git repository. The index records file and symbol identity,
project-relative locations, content hashes, the observed commit, and a sanitized
GitHub `owner/repository` slug. It does not persist source bodies, notebook
outputs, credentials, or arbitrary remote URLs.

## Link truthfulness

A code link names its creation source explicitly:

- `manual` links are verified user assertions;
- `execution` links are verified observations and require structured execution
  evidence;
- `agent-proposed` links require structured evidence and a confidence in
  `[0, 1]`, and are always created as `unverified`.

Only an explicit human review can move an agent proposal to `verified` or
`rejected`. Each creation, review, scan, and stale transition appends project-
scoped provenance. The database also rejects agent proposals without evidence
or confidence and rejects cross-project or cross-kind local graph targets.

Supported targets are objectives, methods, datasets, experiments, runs, claims,
tests, risks, commits, unresolved issues, sources, and artifacts. Existing graph
types (`source`, `artifact`, `claim`, `experiment`, and `run`) must resolve to a
same-project research object; the remaining types use a stable external or
project-local identifier and a display title.

## Local service API

- `POST /api/projects/:projectId/code-context/scan` indexes tracked Python and
  Jupyter files. The request has no body.
- `GET /api/projects/:projectId/code-context?path=<relative>&symbol=<name>`
  returns a file or symbol page with links and provenance. Omit `symbol` for a
  file page. Notebook symbols use `cell[<index>]::<qualifiedName>`.
- `POST /api/projects/:projectId/code-context/links` creates a manual,
  execution-derived, or agent-proposed link.
- `PATCH /api/projects/:projectId/code-context/links/:linkId/review` verifies or
  rejects an unverified proposal.
- `GET /api/projects/:projectId/code-context/stale` lists linked research
  targets impacted by changed code.

Repository observation immediately marks links for changed paths stale. A later
code scan compares symbol hashes as well, so changes observed between Git status
scans still enter the stale-impact stream. Stale link events retain the impacted
target ID and, for local research objects, bind provenance directly to that
object so claim/artifact audits can consume the signal.

## Scanner boundaries

The scanner resolves the registered root canonically, requires it to be the Git
top level, obtains candidates only from `git ls-files`, rejects traversal and
symlink escapes, and enforces file-count, per-file, total-byte, and Git-output
limits. Git runs with hooks, credentials, prompts, global/system configuration,
and optional locks disabled. Unsupported remotes are recorded as `null` rather
than copied into storage.
