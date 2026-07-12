# KnowIT migration tickets for Cly

## CLY-40 — Integrate KnowIT literature discovery into Cly

### Problem

KnowIT contains a useful local-first literature workflow: search open paper sources, rank results, inspect evidence, save papers, and compare them in a literature matrix. Its current implementation is a separate FastAPI + Next.js application and is incomplete.

Cly is the destination product. The workflow needs to become a first-class Cly research capability inside the desktop application, connected to Cly’s project-scoped research graph—not a website embedded in Cly and not a second application shipped alongside it.

### Goal

Port the useful KnowIT capabilities into Cly’s existing research architecture so a researcher can:

1. Search a research question from Cly’s Literature screen.
2. Receive normalized, ranked paper results with understandable explanations.
3. Save a paper into the active Cly research project as a `source` research object.
4. Inspect and edit the paper in Sources and the Literature Matrix.
5. Connect the source to claims, experiments, runs, notebooks, and other research objects.
6. Trace retrieval, ranking, saving, editing, and synthesis through Cly provenance events.

### Cly architecture constraints

- Cly’s SQLite/Drizzle research repository is the source of truth for persisted research metadata.
- Every mutation is project-scoped and must validate its payload and record provenance.
- The research core remains independent of the coding workspace and Dream IDE.
- The UI belongs in Cly’s React application under `src/features/cly/`.
- Provider and persistence boundaries belong behind typed services in `src/features/cly/services/` and `src/features/research/`.
- Electron APIs own local application capabilities; the renderer must not directly own filesystem, credential, or database access.
- Cly must continue to support fixture/mock services and offline handling.
- The KnowIT FastAPI server and Next.js frontend are migration references, not Cly runtime dependencies.

### What to port from KnowIT

#### Literature discovery

- Normalized paper metadata and provider identifiers.
- Open-source paper connectors, initially arXiv and Semantic Scholar where appropriate.
- Provider error mapping for empty results, timeout, rate limit, malformed responses, and network failure.
- Stable deduplication using provider IDs, DOI, arXiv ID, and normalized title.

#### Ranking

- KnowIT’s keyword ranking concepts.
- Semantic-ranking boundary and Reciprocal Rank Fusion concepts.
- A replaceable local cross-encoder adapter boundary; do not label the current deterministic fixture as a cross-encoder.
- Ranked results containing score components, method, and plain-language explanation.
- Deterministic mock ranking for CI and local development.

#### Research integration

- Search runs scoped to the active Cly project.
- Saved papers represented as Cly `source` objects.
- Provider metadata, query, ranking method, score, timestamp, URL, and identifier retained as source provenance.
- Literature Matrix rows derived from the same saved source records; no parallel paper database.
- Existing Cly relationships used for claim/source evidence and research graph links.

#### Structured evidence

- Paper fields for research problem, method, dataset/system, principal result, limitations, and confidence.
- Optional extraction/enrichment, with researcher-visible boundaries between provider metadata, model output, and human edits.
- Later synthesis of themes and related-work gaps into claims or planning suggestions only through explicit, reviewable actions.

### Native Cly experience

Use the existing Cly surfaces rather than recreating KnowIT’s website UI:

- Literature: search, ranked results, status states, and matrix views.
- Sources: saved paper metadata, review status, provider links, and provenance.
- Research Graph: source-to-claim and source-to-experiment relationships.
- Claims: supporting, contradicting, and needs-evidence links.
- Inspector: selected source details, ranking explanation, and provenance.
- Project switcher: active-project scoping and isolation.
- Cly design system: tables, panels, badges, toasts, empty states, keyboard behavior, and accessibility patterns.

### Non-goals

- Embedding or launching the KnowIT Next.js website from Cly.
- Requiring a FastAPI process for the Cly desktop app.
- Copying KnowIT’s frontend runtime or introducing a second routing/design system.
- Building a private paper corpus before the Cly source and project contracts are stable.
- Sending local papers, private notes, or full documents to cloud providers by default.
- Treating opaque model scores as autonomous recommendations.
- Claiming cross-encoder support until an actual adapter, model configuration, and tests exist.
- Rewriting unrelated Cly research-core, project-isolation, or coding-workspace behavior.

### Acceptance criteria

- [x] A user can start a literature search from the active Cly project.
- [x] Paper responses are normalized behind a Cly service contract.
- [x] Ranked results show score/method explanations that a researcher can inspect.
- [x] Loading, empty, failure, timeout, and provider-rate-limit states are visible and recoverable.
- [x] Ranking has deterministic fixture coverage and does not require paid APIs in CI.
- [x] Saving a result creates one project-scoped Cly `source` object.
- [x] Saved source metadata includes provider ID/URL and retrieval/ranking provenance.
- [x] Saved papers appear in Sources and the Literature Matrix without duplicate records.
- [x] Sources can link to claims and other research objects through existing validated relationships.
- [x] Mutations persist across restart and create provenance events.
- [x] The feature runs in the Cly Electron/React application without KnowIT’s FastAPI or Next.js runtimes.
- [x] Typecheck, unit tests, repository tests, and deterministic integration tests pass.

### Implementation tickets

#### CLY-40a — Define literature domain contracts

- Add Cly types for paper metadata, provider identity, search run, ranked result, ranking explanation, and provenance.
- Extend the validated source payload schema for literature metadata.
- Define duplicate identity and merge behavior.

#### CLY-40b — Add project-scoped literature service boundary

- Add mock and real service interfaces for search, ranking, and save.
- Route all writes through the active project and research repository.
- Map provider errors into stable UI-facing error kinds.

#### CLY-40c — Port paper-source adapters

- Port the useful KnowIT connector behavior into Cly-owned adapters.
- Add deterministic fixtures for normalized arXiv/Semantic Scholar responses.
- Cover timeout, rate limit, invalid response, empty, and duplicate cases.

#### CLY-40d — Port transparent ranking

- Port keyword ranking and RRF concepts.
- Keep semantic/cross-encoder ranking behind a replaceable interface.
- Persist ranking method, score components, explanation, and model/provider metadata.

#### CLY-40e — Build the native Literature Workspace flow

- Add search controls and ranked result presentation to Cly’s Literature screen.
- Use existing Cly loading, empty, error, toast, table, panel, and inspector components.
- Support keyboard and accessibility behavior consistent with the rest of Cly.

#### CLY-40f — Connect saved literature to the research graph

- Save selected papers as source objects.
- Reuse source objects as Literature Matrix rows.
- Link sources to claims, experiments, runs, notebooks, and contradictions through existing relationships.
- Show provenance in the inspector and provenance views.

#### CLY-40g — Add optional extraction and synthesis

- Port KnowIT’s structured paper-note fields into source enrichment.
- Keep extraction optional, explicit, and provider-independent.
- Add reviewable theme/related-work synthesis only after source persistence and provenance are stable.

#### CLY-40h — Retire migration scaffolding

- Compare migrated behavior with the KnowIT snapshot.
- Remove unused copied runtime code once parity is verified.
- Retain only useful product documentation and architectural decisions.

### Definition of done

CLY-40 is complete when a researcher can move from a question to inspectable literature evidence inside the Cly desktop application, save and organize that evidence in the active project, connect it to Cly’s research graph, and recover cleanly from provider failures. The implementation must use Cly’s Electron/React/SQLite architecture, persist provenance, remain testable with deterministic fixtures, and require no KnowIT website or FastAPI runtime.
