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
import { afterEach, describe, expect, it } from "vitest";

import { createLineageReconstructor } from "./lineage-reconstructor.js";
import { createResearchRepository } from "./repository.js";

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
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
      chain_json TEXT NOT NULL, confidence REAL NOT NULL, rationale TEXT NOT NULL,
      origin TEXT NOT NULL DEFAULT 'inferred', review_state TEXT NOT NULL DEFAULT 'unreviewed',
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(project_id, fingerprint)
    );
    CREATE TABLE lineage_evidence (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, suggestion_id TEXT NOT NULL,
      evidence_type TEXT NOT NULL, path TEXT, coordinates TEXT NOT NULL, excerpt TEXT,
      content_hash TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(suggestion_id, content_hash)
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
    JSON.stringify({ metadata: { title: "Analysis notebook" }, cells: [] }),
  );
  await writeFile(path.join(root, "experiments", "baseline.yaml"), "seed: 7\n");
  await writeFile(path.join(root, "outputs", "figure-1.png"), "png");
  await writeFile(
    path.join(root, "reports", "results.md"),
    "The result supports the objective [@smith2025].\n",
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

    await writeFile(
      path.join(root, "reports", "results.md"),
      "The result supports the objective [@changed2026].\n",
    );
    const rescanned = await reconstructor.scanLineage("project-1");
    expect(rescanned.suggestions[0]).toMatchObject({
      reviewState: "approved",
      rationale: "Confirmed after manual notebook inspection.",
    });
  });
});
