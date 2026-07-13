// @vitest-environment node
import { execFile } from "node:child_process";
import {
  mkdir,
  mkdtemp,
  realpath,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";

import { createLineageReconstructor } from "./lineage-reconstructor.js";
import { createResearchRepository } from "./repository.js";
import { registerResearchRoutes } from "./routes.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

function createDatabase() {
  const database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (
      id TEXT PRIMARY KEY, path TEXT NOT NULL, normalized_path TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'open', sort_order INTEGER NOT NULL DEFAULT 0,
      metadata TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', payload TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'human', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'human',
      review_state TEXT NOT NULL DEFAULT 'unreviewed', confidence REAL, reviewed_by TEXT,
      reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE lineage_suggestions (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, logical_key TEXT NOT NULL,
      fingerprint TEXT NOT NULL, revision INTEGER NOT NULL DEFAULT 1,
      lifecycle_state TEXT NOT NULL DEFAULT 'current', supersedes_suggestion_id TEXT,
      chain_json TEXT NOT NULL, confidence REAL NOT NULL, rationale TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'inferred', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(id, project_id),
      FOREIGN KEY (supersedes_suggestion_id) REFERENCES lineage_suggestions(id)
    );
    CREATE UNIQUE INDEX lineage_current_logical_unique
      ON lineage_suggestions(project_id, logical_key) WHERE lifecycle_state = 'current';
    CREATE TABLE lineage_evidence (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, suggestion_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL, path TEXT, coordinates TEXT NOT NULL, excerpt TEXT,
      content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(suggestion_id, content_hash),
      FOREIGN KEY (suggestion_id, project_id)
        REFERENCES lineage_suggestions(id, project_id) ON DELETE CASCADE
    );
    CREATE TABLE lineage_scan_measurements (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, scan_duration_ms INTEGER NOT NULL,
      time_to_first_chain_ms INTEGER, suggestion_count INTEGER NOT NULL,
      accepted_count INTEGER NOT NULL DEFAULT 0, rejected_count INTEGER NOT NULL DEFAULT 0,
      correction_count INTEGER NOT NULL DEFAULT 0, manual_config_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL
    );
  `);
  return database;
}

async function createGitRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "cly-lineage-"));
  temporaryDirectories.push(root);
  await execFileAsync("git", ["init", "--quiet", root]);
  await mkdir(path.join(root, "notebooks"));
  await mkdir(path.join(root, "experiments"));
  await mkdir(path.join(root, "outputs"));
  await mkdir(path.join(root, "reports"));
  await writeFile(
    path.join(root, "notebooks", "analysis.ipynb"),
    JSON.stringify({
      metadata: {
        title: "Analysis notebook",
        cly: {
          objective: "Does the baseline support the objective?",
          experiment: "experiments/baseline.yaml",
        },
      },
      cells: [],
    }),
  );
  await writeFile(
    path.join(root, "experiments", "baseline.yaml"),
    "notebook: notebooks/analysis.ipynb\noutput: outputs/figure-1.png\nseed: 7\n",
  );
  await writeFile(path.join(root, "outputs", "figure-1.png"), "png");
  await writeFile(
    path.join(root, "reports", "results.md"),
    "The claim from outputs/figure-1.png supports the objective [@smith2025].\n",
  );
  await writeFile(path.join(root, "package-lock.json"), "{}\n");
  await execFileAsync("git", ["add", "."], { cwd: root });
  await execFileAsync(
    "git",
    [
      "-c",
      "user.name=Cly Test",
      "-c",
      "user.email=cly@example.test",
      "commit",
      "--quiet",
      "-m",
      "Add retrospective research materials",
    ],
    { cwd: root },
  );
  return realpath(root);
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("lineage reconstructor", () => {
  it("creates a deterministic complete inferred chain with evidence coordinates", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });
    const reconstructor = createLineageReconstructor(repository);

    const first = await reconstructor.scanLineage("project-1");
    const second = await reconstructor.scanLineage("project-1");

    expect(first.suggestions).toHaveLength(1);
    expect(second.suggestions).toEqual(first.suggestions);
    expect(first.suggestions[0]).toMatchObject({
      origin: "inferred",
      reviewState: "unreviewed",
      confidence: expect.any(Number),
      rationale: expect.stringContaining("deterministic"),
      chain: [
        expect.objectContaining({ kind: "objective" }),
        expect.objectContaining({ kind: "notebook" }),
        expect.objectContaining({ kind: "commit" }),
        expect.objectContaining({ kind: "experiment" }),
        expect.objectContaining({ kind: "artifact" }),
        expect.objectContaining({ kind: "claim" }),
      ],
      evidence: expect.arrayContaining([
        expect.objectContaining({
          path: "notebooks/analysis.ipynb",
          coordinates: expect.objectContaining({ lineStart: 1 }),
        }),
        expect.objectContaining({
          path: "reports/results.md",
          coordinates: expect.objectContaining({ lineStart: 1 }),
        }),
      ]),
    });
    expect(first.measurement).toMatchObject({
      scanDurationMs: expect.any(Number),
      timeToFirstChainMs: expect.any(Number),
      manualConfig: expect.any(Object),
    });
  });

  it("derives each edge from linked evidence and ignores lexical decoys across Git history", async () => {
    const root = await createGitRepository();
    await writeFile(
      path.join(root, "notebooks", "aaa-decoy.ipynb"),
      JSON.stringify({
        metadata: {
          title: "Decoy",
          cly: {
            objective: "Unrelated objective",
            experiment: "experiments/aaa-decoy.yaml",
          },
        },
        cells: [],
      }),
    );
    await writeFile(
      path.join(root, "experiments", "aaa-decoy.yaml"),
      "output: outputs/aaa-decoy.png\n",
    );
    await writeFile(path.join(root, "outputs", "aaa-decoy.png"), "decoy");
    await writeFile(
      path.join(root, "reports", "aaa-decoy.md"),
      "An unrelated report [@decoy2026].\n",
    );
    await execFileAsync("git", ["add", "."], { cwd: root });
    await execFileAsync(
      "git",
      [
        "-c",
        "user.name=Cly Test",
        "-c",
        "user.email=cly@example.test",
        "commit",
        "--quiet",
        "-m",
        "Add lexical decoys",
      ],
      { cwd: root },
    );
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });

    const result =
      await createLineageReconstructor(repository).scanLineage("project-1");

    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]?.chain.map((step) => step.label)).toEqual([
      "Does the baseline support the objective?",
      "Analysis notebook",
      "Add retrospective research materials",
      "experiments/baseline.yaml",
      "outputs/figure-1.png",
      "The claim from outputs/figure-1.png supports the objective [@smith2025].",
    ]);
    expect(
      result.suggestions[0]?.evidence.map((evidence) => evidence.evidenceType),
    ).toEqual(
      expect.arrayContaining([
        "objective-notebook-link",
        "notebook-commit-link",
        "commit-experiment-link",
        "experiment-artifact-link",
        "artifact-claim-link",
      ]),
    );
  });

  it("skips symlink escapes and malformed or oversized inputs without reading outside the project", async () => {
    const root = await createGitRepository();
    const outside = await mkdtemp(path.join(tmpdir(), "cly-lineage-outside-"));
    temporaryDirectories.push(outside);
    await writeFile(path.join(outside, "secret.ipynb"), "not-json");
    await symlink(
      path.join(outside, "secret.ipynb"),
      path.join(root, "notebooks", "escaped.ipynb"),
    );
    await writeFile(
      path.join(root, "notebooks", "malformed.ipynb"),
      "not-json",
    );
    await writeFile(
      path.join(root, "notebooks", "too-large.ipynb"),
      "x".repeat(4096),
    );
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({ id: "project-1", name: "Project", path: root });

    const result = await createLineageReconstructor(repository, {
      maxFileBytes: 1024,
    }).scanLineage("project-1");

    expect(result.suggestions[0]?.evidence).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: expect.stringContaining("escaped") }),
      ]),
    );
    expect(result.suggestions[0]?.evidence).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "notebooks/malformed.ipynb" }),
      ]),
    );
    expect(result.measurement.manualConfig).toMatchObject({
      maxFileBytes: 1024,
    });
  });

  it("handles an initialized repository with no Git history without proposing a partial chain", async () => {
    const root = await mkdtemp(
      path.join(tmpdir(), "cly-lineage-empty-history-"),
    );
    temporaryDirectories.push(root);
    await execFileAsync("git", ["init", "--quiet", root]);
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: await realpath(root),
    });

    const result =
      await createLineageReconstructor(repository).scanLineage("project-1");

    expect(result.suggestions).toEqual([]);
    expect(result.measurement.timeToFirstChainMs).toBeNull();
  });

  it("leaves every decision unchanged when an atomic review batch is invalid", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({ id: "project-1", name: "Project", path: root });
    const reconstructor = createLineageReconstructor(repository);
    const { suggestions } = await reconstructor.scanLineage("project-1");
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    if (!suggestion) throw new Error("Expected a lineage suggestion.");
    const suggestionId = suggestion.id;

    expect(() =>
      reconstructor.reviewLineageSuggestions(
        "project-1",
        [
          { id: suggestionId, action: "approve" },
          { id: "not-in-project", action: "reject" },
        ],
        "reviewer-1",
      ),
    ).toThrow("does not belong to the project");

    expect(repository.listLineageSuggestions("project-1")[0]).toMatchObject({
      id: suggestionId,
      reviewState: "unreviewed",
    });
    expect(repository.listProvenance("project-1")).toEqual([]);
  });

  it("records explicit approvals and edits as attributable provenance without silently verifying", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({ id: "project-1", name: "Project", path: root });
    const reconstructor = createLineageReconstructor(repository);
    const { suggestions } = await reconstructor.scanLineage("project-1");
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    if (!suggestion) throw new Error("Expected a lineage suggestion.");

    const reviewed = await reconstructor.reviewLineageSuggestions(
      "project-1",
      [
        {
          id: suggestion.id,
          action: "edit",
          edit: { rationale: "Confirmed after manual notebook inspection." },
        },
      ],
      "reviewer-1",
    );

    expect(reviewed[0]).toMatchObject({
      origin: "inferred",
      reviewState: "approved",
      reviewedBy: "reviewer-1",
      rationale: "Confirmed after manual notebook inspection.",
    });
    expect(repository.listProvenance("project-1")).toEqual([
      expect.objectContaining({
        action: "lineage.suggestion.edited",
        actorId: "reviewer-1",
        metadata: expect.objectContaining({ suggestionId: suggestion.id }),
      }),
    ]);

    const unchanged = await reconstructor.scanLineage("project-1");
    expect(unchanged.suggestions[0]).toMatchObject({
      reviewState: "approved",
      rationale: "Confirmed after manual notebook inspection.",
    });
    expect(unchanged.measurement.correctionCount).toBe(1);

    await writeFile(
      path.join(root, "reports", "results.md"),
      "The result supports the objective [@changed2026].\n",
    );
    const rescanned = await reconstructor.scanLineage("project-1");
    expect(rescanned.suggestions).toEqual([]);
    expect(rescanned.measurement).toMatchObject({
      acceptedCount: 0,
      correctionCount: 0,
      suggestionCount: 0,
    });
    expect(
      repository.listLineageSuggestions("project-1", {
        includeHistorical: true,
      }),
    ).toEqual([
      expect.objectContaining({
        reviewState: "approved",
        lifecycleState: "stale",
        rationale: "Confirmed after manual notebook inspection.",
      }),
    ]);
  });

  it("reconciles deleted and changed evidence into current revisions", async () => {
    const root = await createGitRepository();
    const database = createDatabase();
    const repository = createResearchRepository(database);
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });
    const reconstructor = createLineageReconstructor(repository);
    const first = await reconstructor.scanLineage("project-1");
    const firstSuggestion = first.suggestions[0];
    expect(firstSuggestion).toBeDefined();
    if (!firstSuggestion) throw new Error("Expected a lineage suggestion.");

    await writeFile(
      path.join(root, "reports", "results.md"),
      "The claim from outputs/figure-1.png remains supported [@smith2026].\n",
    );
    const changed = await reconstructor.scanLineage("project-1");
    expect(changed.suggestions).toHaveLength(1);
    expect(changed.suggestions[0]).toMatchObject({
      id: firstSuggestion.id,
      lifecycleState: "current",
      revision: 2,
      reviewState: "unreviewed",
    });

    await rm(path.join(root, "outputs", "figure-1.png"));
    const deleted = await reconstructor.scanLineage("project-1");
    expect(deleted.suggestions).toEqual([]);
    expect(deleted.measurement).toMatchObject({
      acceptedCount: 0,
      rejectedCount: 0,
      suggestionCount: 0,
    });
    expect(
      repository.listLineageSuggestions("project-1", {
        includeHistorical: true,
      }),
    ).toEqual([
      expect.objectContaining({
        id: firstSuggestion.id,
        lifecycleState: "stale",
        revision: 2,
      }),
    ]);
  });

  it("supersedes an approved revision and returns only the new unreviewed current revision", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });
    const reconstructor = createLineageReconstructor(repository);
    const first = await reconstructor.scanLineage("project-1");
    const approved = first.suggestions[0];
    expect(approved).toBeDefined();
    if (!approved) throw new Error("Expected a lineage suggestion.");
    reconstructor.reviewLineageSuggestions(
      "project-1",
      [{ id: approved.id, action: "approve" }],
      "reviewer-1",
    );
    await writeFile(
      path.join(root, "reports", "results.md"),
      "The claim from outputs/figure-1.png was revised [@smith2026].\n",
    );

    const rescanned = await reconstructor.scanLineage("project-1");

    expect(rescanned.suggestions).toEqual([
      expect.objectContaining({
        lifecycleState: "current",
        reviewState: "unreviewed",
        revision: 2,
        supersedesSuggestionId: approved.id,
      }),
    ]);
    expect(rescanned.measurement.acceptedCount).toBe(0);
    expect(
      repository.listLineageSuggestions("project-1", {
        includeHistorical: true,
      }),
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: approved.id,
          lifecycleState: "superseded",
          reviewState: "approved",
        }),
      ]),
    );
  });

  it("rejects correction payloads on approve/reject and rejects evidence-invalidating chain edits", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });
    const reconstructor = createLineageReconstructor(repository);
    const { suggestions } = await reconstructor.scanLineage("project-1");
    const suggestion = suggestions[0];
    expect(suggestion).toBeDefined();
    if (!suggestion) throw new Error("Expected a lineage suggestion.");
    const originalEvidence = suggestion.evidence;

    for (const action of ["approve", "reject"] as const) {
      expect(() =>
        reconstructor.reviewLineageSuggestions(
          "project-1",
          [
            {
              id: suggestion.id,
              action,
              edit: { rationale: "Hidden correction" },
            },
          ],
          "reviewer-1",
        ),
      ).toThrow();
    }
    expect(() =>
      reconstructor.reviewLineageSuggestions(
        "project-1",
        [
          {
            id: suggestion.id,
            action: "edit",
            edit: {
              chain: suggestion.chain.map((step, index) =>
                index === 1
                  ? { ...step, id: "file:notebooks/other.ipynb" }
                  : step,
              ),
            },
          },
        ],
        "reviewer-1",
      ),
    ).toThrow();
    expect(repository.listLineageSuggestions("project-1")[0]?.evidence).toEqual(
      originalEvidence,
    );
  });

  it("enforces directory, entry, depth, wall-clock, and Git timeout budgets", async () => {
    const root = await createGitRepository();
    await mkdir(path.join(root, "deep", "one", "two"), { recursive: true });
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({ id: "project-1", name: "Project", path: root });

    await expect(
      createLineageReconstructor(repository, { maxDepth: 1 }).scanLineage(
        "project-1",
      ),
    ).rejects.toThrow("depth limit");
    await expect(
      createLineageReconstructor(repository, { maxDirectories: 1 }).scanLineage(
        "project-1",
      ),
    ).rejects.toThrow("directory limit");
    await expect(
      createLineageReconstructor(repository, { maxEntries: 1 }).scanLineage(
        "project-1",
      ),
    ).rejects.toThrow("entry limit");
    let now = 0;
    await expect(
      createLineageReconstructor(repository, {
        maxScanDurationMs: 2,
        now: () => (now += 2),
      }).scanLineage("project-1"),
    ).rejects.toThrow("time limit");
    await expect(
      createLineageReconstructor(repository, {
        gitExecutor: async (_file, _args, executionOptions) => {
          expect(executionOptions.timeout).toBe(3);
          throw Object.assign(new Error("timed out"), {
            killed: true,
            signal: "SIGKILL",
          });
        },
        gitTimeoutMs: 3,
      }).scanLineage("project-1"),
    ).rejects.toThrow("Git command timed out");
  });

  it("uses one no-follow descriptor and hard caps a file that changes after discovery", async () => {
    const root = await createGitRepository();
    const repository = createResearchRepository(createDatabase());
    repository.upsertProject({
      id: "project-1",
      name: "Project",
      path: root,
      metadata: { question: "Does the baseline support the objective?" },
    });
    let changed = false;
    const result = await createLineageReconstructor(repository, {
      beforeFileRead: async (filePath) => {
        if (!changed && filePath.endsWith("analysis.ipynb")) {
          changed = true;
          await writeFile(filePath, "x".repeat(4096));
        }
      },
      maxFileBytes: 1024,
    }).scanLineage("project-1");

    expect(result.suggestions).toEqual([]);
  });

  it("rejects approve/reject edit payloads at the route boundary", async () => {
    const app = new Hono();
    let called = false;
    registerResearchRoutes(app, {
      getLineageReconstructor: () => ({
        reviewLineageSuggestions: () => {
          called = true;
          return [];
        },
      }),
    });

    for (const action of ["approve", "reject"]) {
      const response = await app.request(
        "/api/projects/project-1/lineage-suggestions/review",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            actor: "reviewer-1",
            decisions: [
              {
                id: "suggestion-1",
                action,
                edit: { rationale: "Hidden correction" },
              },
            ],
          }),
        },
      );
      expect(response.status).toBe(400);
    }
    expect(called).toBe(false);
  });
});
