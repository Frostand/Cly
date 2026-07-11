# Research IDE Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Establish validated, secure extension boundaries and the minimum quality system before implementing research-domain behavior.

**Architecture:** Preserve the Electron application as one package. Introduce research functionality behind feature-local renderer modules, authenticated Hono route registration, SQLite/Drizzle repositories, and explicit approval policies; defer monorepo migration until a second deployable needs shared packages.

**Tech Stack:** Electron 41, React 19, Vite 8, TypeScript 6, Hono, SQLite/Drizzle, Zustand, pnpm 11, GitHub Actions.

## Global Constraints

- Do not change production research behavior before this foundation is reviewed.
- Preserve context isolation and the session-token protected loopback API.
- Do not permit agents, parsers, or external content to grant capabilities.
- Use short-lived `RID-<number>` branches and Conventional Commit subjects with the issue reference.
- Use deterministic local fixtures; normal CI must not need paid APIs.
- Treat new migrations, provider transmission, command execution, and provenance mutation as security-sensitive.

---

## File structure

| Path | Responsibility |
| --- | --- |
| `vitest.config.ts` | Test runner configuration for renderer and Node-domain tests. |
| `src/features/research/domain/ids.ts` | Branded, stable research object identifiers. |
| `src/features/research/domain/relationship.ts` | Confirmed/inferred relationship contract, independent of persistence. |
| `electron/api/research/register-routes.js` | Thin authenticated route registration seam. |
| `electron/db/research/schema.ts` | Research tables added only after ADR approval. |
| `tests/unit/research/relationship.test.ts` | Deterministic domain contract tests. |
| `tests/integration/research/routes.test.ts` | Authenticated local route validation. |

### Task 1: Establish the test harness [RID-003]

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`
- Create: `tests/unit/smoke.test.ts`
- Modify: `.github/workflows/quality.yml`

**Interfaces:**
- Produces: `pnpm test` executes `vitest run` and exits 0 for passing suites.

- [ ] **Step 1: Write the failing smoke test**

```ts
import { expect, test } from "vitest";

test("test harness executes deterministic assertions", () => {
  expect("research-ide").toBe("research-ide");
});
```

- [ ] **Step 2: Run it to verify it fails before configuration**

Run: `pnpm test`

Expected: FAIL because the `test` script is absent.

- [ ] **Step 3: Add the minimal configuration**

```ts
// vitest.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });
```

Add `"test": "vitest run"` to `package.json`, install `vitest` as a development dependency with pnpm, and add `pnpm test` after typecheck in the Quality workflow.

- [ ] **Step 4: Run the test and full quality commands**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm vite:build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts tests/unit/smoke.test.ts .github/workflows/quality.yml
git commit -m "test(foundation): add deterministic test harness [RID-003]"
```

### Task 2: Define research identity and relationship contracts [RID-004]

**Files:**
- Create: `src/features/research/domain/ids.ts`
- Create: `src/features/research/domain/relationship.ts`
- Create: `tests/unit/research/relationship.test.ts`

**Interfaces:**
- Produces: `createResearchObjectId(kind, value): ResearchObjectId` and `createRelationship(input): ResearchRelationship`.
- Consumes: no database, renderer, provider, or Electron API dependency.

- [ ] **Step 1: Write failing relationship tests**

```ts
expect(createRelationship({
  fromId: createResearchObjectId("paper", "p1"),
  toId: createResearchObjectId("claim", "c1"),
  type: "supports",
  evidence: [{ sourceId: "source:p1", locator: "p. 4" }],
  status: "inferred",
})).toMatchObject({ status: "inferred", confirmation: null });
```

- [ ] **Step 2: Run the targeted test to verify it fails**

Run: `pnpm vitest run tests/unit/research/relationship.test.ts`

Expected: FAIL because the domain module does not exist.

- [ ] **Step 3: Implement immutable, validation-first contracts**

```ts
export type RelationshipStatus = "inferred" | "confirmed";
export interface ResearchRelationship {
  id: string;
  fromId: ResearchObjectId;
  toId: ResearchObjectId;
  type: "supports" | "contradicts" | "answers" | "implements" | "derives_from";
  status: RelationshipStatus;
  evidence: readonly EvidenceLocator[];
  confirmation: { actorId: string; confirmedAt: string } | null;
}
```

Reject empty IDs/evidence and reject a confirmed relationship without confirmation metadata. Do not persist these types in this task.

- [ ] **Step 4: Run unit and quality checks**

Run: `pnpm test && pnpm lint && pnpm typecheck`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add src/features/research/domain tests/unit/research
git commit -m "feat(graph): define reviewable relationship contracts [RID-004]"
```

### Task 3: Decide persistence and provenance architecture [RID-005]

**Files:**
- Create: `docs/architecture/decisions/ADR-003-research-graph-persistence.md`
- Create: `docs/architecture/decisions/ADR-004-graph-store-selection.md`
- Create: `docs/architecture/decisions/ADR-005-vector-retrieval-boundary.md`
- Create: `docs/architecture/decisions/ADR-006-artifact-storage.md`

**Interfaces:**
- Produces: an approved schema/migration boundary for the first persistence task.

- [ ] **Step 1: Document alternatives and acceptance constraints**

Each ADR must compare at least SQLite relational tables, a dedicated graph store, and external/embedded vector options as relevant; state offline behavior, migration/recovery, provenance integrity, encryption/privacy, cost, and backup consequences.

- [ ] **Step 2: Hold the design review**

Run: `git diff --check`

Expected: exit 0; review records an owner and a revisit condition for every ADR.

- [ ] **Step 3: Commit**

```bash
git add docs/architecture/decisions
git commit -m "docs(architecture): decide research persistence boundaries [RID-005]"
```

### Task 4: Implement a limited research API seam [RID-006]

**Files:**
- Create: `electron/api/research/register-routes.js`
- Modify: `electron/api/app.js`
- Create: `tests/integration/research/routes.test.ts`

**Interfaces:**
- Consumes: the existing authenticated `Hono` instance in `createApiApp`.
- Produces: `registerResearchRoutes(app)` and `GET /api/research/health` returning `{ "status": "ok" }` only with the session token.

- [ ] **Step 1: Write failing authorization tests**

```ts
expect((await app.request("/api/research/health")).status).toBe(401);
expect((await app.request("/api/research/health", {
  headers: { "x-dream-api-token": "test-token" },
})).json()).resolves.toEqual({ status: "ok" });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm vitest run tests/integration/research/routes.test.ts`

Expected: FAIL because the route registrar does not exist.

- [ ] **Step 3: Implement the smallest registered route**

```js
export const registerResearchRoutes = (app) => {
  app.get("/api/research/health", (c) => c.json({ status: "ok" }));
};
```

Call it only from `createApiApp` after the global API token middleware. Do not expose terminal, filesystem, provider, or mutation capabilities in this task.

- [ ] **Step 4: Run the complete validation suite**

Run: `pnpm test && pnpm lint && pnpm typecheck && pnpm vite:build`

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add electron/api/app.js electron/api/research tests/integration/research
git commit -m "feat(research): add authenticated API extension seam [RID-006]"
```

## Self-review

- Spec coverage: this plan deliberately covers only Phase 0 and the safe Phase 1 seams; literature, notebooks, experiments, claims, and agents remain separately scoped projects in the backlog.
- Placeholder scan: no task delegates undefined behavior; external architecture decisions are explicitly review gates rather than implementation placeholders.
- Type consistency: the API health seam is intentionally independent from the relationship contract and persistence model.

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-11-research-ide-foundation.md`. Execute it only after the Foundation review approves the test runner and persistence/security ADRs.
