// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdtemp, readFile, realpath, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

import { createCodeResearchLinker } from "./code-linker.js";
import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";

const execFileAsync = promisify(execFile);
const temporaryDirectories: string[] = [];

async function createDatabase() {
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
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      UNIQUE(id, project_id)
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, origin TEXT NOT NULL DEFAULT 'human',
      review_state TEXT NOT NULL DEFAULT 'unreviewed', confidence REAL,
      reviewed_by TEXT, reviewed_at TEXT, created_at TEXT NOT NULL
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  const migration = await readFile(
    new URL("../../drizzle/0023_code_research_links.sql", import.meta.url),
    "utf8",
  );
  for (const statement of migration.split("--> statement-breakpoint")) {
    if (statement.trim()) database.exec(statement);
  }
  return database;
}

async function createGitRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "cly-code-linker-"));
  temporaryDirectories.push(root);
  await execFileAsync("git", ["init", "--quiet", root]);
  await execFileAsync(
    "git",
    ["remote", "add", "origin", "git@github.com:Frostand/science.git"],
    {
      cwd: root,
    },
  );
  await writeFile(
    path.join(root, "analysis.py"),
    [
      "class Model:",
      "    def fit(self, data):",
      "        return data",
      "",
      "def evaluate(model):",
      "    return model",
      "",
    ].join("\n"),
  );
  await writeFile(
    path.join(root, "study.ipynb"),
    JSON.stringify({
      nbformat: 4,
      cells: [
        { cell_type: "markdown", source: ["# Study"] },
        {
          cell_type: "code",
          source: ["def prepare(data):\n", "    return data\n"],
        },
      ],
    }),
  );
  await writeFile(
    path.join(root, "secondary.py"),
    ["def evaluate(model):", "    return model", ""].join("\n"),
  );
  await execFileAsync(
    "git",
    ["add", "analysis.py", "secondary.py", "study.ipynb"],
    {
      cwd: root,
    },
  );
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
      "initial",
    ],
    { cwd: root },
  );
  return realpath(root);
}

async function setup() {
  const root = await createGitRepository();
  const database = await createDatabase();
  const repository = createResearchRepository(database);
  repository.upsertProject({ id: "project-1", name: "Project", path: root });
  const claim = repository.createObject({
    id: "claim-1",
    projectId: "project-1",
    type: "claim",
    title: "The model generalizes",
    payload: { kind: "claim", status: "draft" },
  });
  const linker = createCodeResearchLinker(database, repository, {
    clock: () => "2026-07-19T12:00:00.000Z",
    createId: () => "link-1",
  });
  return { root, database, repository, claim, linker };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("code research linker", () => {
  it("indexes Python/Jupyter symbols and disambiguates matching names by file path", async () => {
    const { linker } = await setup();

    const scan = await linker.scan("project-1");

    expect(scan).toMatchObject({
      filesScanned: 3,
      repositorySlug: "Frostand/science",
    });
    expect(scan.commitSha).toMatch(/^[a-f0-9]{40}$/);
    expect(
      linker.getContext("project-1", {
        path: "analysis.py",
        symbol: "Model.fit",
      }).entity,
    ).toMatchObject({
      kind: "symbol",
      language: "python",
      symbolKind: "function",
      lineStart: 2,
      lineEnd: 4,
      stale: false,
    });
    expect(
      linker.getContext("project-1", {
        path: "study.ipynb",
        symbol: "cell[1]::prepare",
      }).entity,
    ).toMatchObject({ language: "jupyter", notebookCell: 1 });
    expect(linker.listEntities("project-1", { kind: "symbol" })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "analysis.py",
          symbol: "Model.fit",
          linkCount: 0,
        }),
      ]),
    );
    expect(
      linker
        .listEntities("project-1", { kind: "symbol" })
        .filter((entity) => entity.symbol === "evaluate")
        .map((entity) => entity.path),
    ).toEqual(["analysis.py", "secondary.py"]);
    expect(
      linker.getContext("project-1", {
        path: "secondary.py",
        symbol: "evaluate",
      }).entity,
    ).toMatchObject({ path: "secondary.py", symbol: "evaluate" });
  });

  it("keeps inferred links evidence-backed and unverified until human review", async () => {
    const { linker } = await setup();
    await linker.scan("project-1");
    const entity = linker.getContext("project-1", {
      path: "analysis.py",
      symbol: "evaluate",
    }).entity;

    expect(() =>
      linker.createLink({
        projectId: "project-1",
        codeEntityId: entity.id,
        targetKind: "claim",
        targetId: "claim-1",
        linkRole: "supports",
        source: "agent-proposed",
        origin: "agent:test",
        confidence: 0.8,
        evidence: [],
      }),
    ).toThrow("require evidence");

    const proposed = linker.createLink({
      projectId: "project-1",
      codeEntityId: entity.id,
      targetKind: "claim",
      targetId: "claim-1",
      linkRole: "supports",
      source: "agent-proposed",
      origin: "agent:test",
      confidence: 0.8,
      evidence: [
        {
          type: "source-location",
          locator: "analysis.py:5",
          description: "Function name and call site match the claim analysis.",
          contentHash: entity.contentHash,
        },
      ],
    });
    expect(proposed).toMatchObject({
      verificationState: "unverified",
      verifiedBy: null,
      confidence: 0.8,
      source: "agent-proposed",
      origin: "agent:test",
    });

    const reviewed = linker.reviewLink({
      projectId: "project-1",
      id: proposed.id,
      verificationState: "verified",
      reviewerId: "researcher-1",
    });
    expect(reviewed).toMatchObject({
      verificationState: "verified",
      verifiedBy: "researcher-1",
    });
    expect(
      linker
        .getContext("project-1", {
          path: "analysis.py",
          symbol: "evaluate",
        })
        .provenance.map((event) => event.action),
    ).toEqual(["code.link.created", "code.link.reviewed"]);
  });

  it("feeds changed linked symbols into the stale-impact stream", async () => {
    const { root, linker, repository } = await setup();
    await linker.scan("project-1");
    const entity = linker.getContext("project-1", {
      path: "analysis.py",
      symbol: "evaluate",
    }).entity;
    linker.createLink({
      projectId: "project-1",
      codeEntityId: entity.id,
      targetKind: "claim",
      targetId: "claim-1",
      linkRole: "tests",
      source: "execution",
      origin: "run:42",
      evidence: [
        {
          type: "execution-trace",
          locator: "run:42",
          description: "The run invoked this symbol.",
        },
      ],
    });
    await writeFile(
      path.join(root, "analysis.py"),
      "def evaluate(model):\n    return None\n",
    );
    repository.upsertProject({
      id: "project-1",
      metadata: {
        repositoryObservation: {
          approvalId: "code-linker-test-opt-in",
          enabled: true,
        },
      },
      name: "Project",
      path: root,
    });
    repository.appendProvenance({
      action: "repository.observation.enabled",
      actorType: "human",
      metadata: { approvalId: "code-linker-test-opt-in" },
      projectId: "project-1",
    });

    const observation = await createRepositoryObserver(repository, {
      onChanges: (...args) => linker.recordRepositoryChanges(...args),
    }).scan("project-1");

    expect(observation.staleLinks).toHaveLength(1);
    expect(linker.listStaleImpact("project-1")).toEqual([
      expect.objectContaining({
        code: { path: "analysis.py", symbol: "evaluate" },
        impact: {
          kind: "claim",
          id: "claim-1",
          title: "The model generalizes",
        },
      }),
    ]);
    expect(repository.listProvenance("project-1")).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "code.link.stale",
          objectId: "claim-1",
          metadata: expect.objectContaining({ path: "analysis.py" }),
        }),
      ]),
    );
  });

  it("rejects external target titles that are missing and cross-kind graph targets", async () => {
    const { linker } = await setup();
    await linker.scan("project-1");
    const entity = linker.getContext("project-1", {
      path: "analysis.py",
    }).entity;

    expect(() =>
      linker.createLink({
        projectId: "project-1",
        codeEntityId: entity.id,
        targetKind: "issue",
        targetId: "CLY-57",
        linkRole: "discusses",
        source: "manual",
        origin: "researcher-1",
      }),
    ).toThrow("require a title");
    expect(() =>
      linker.createLink({
        projectId: "project-1",
        codeEntityId: entity.id,
        targetKind: "run",
        targetId: "claim-1",
        linkRole: "uses",
        source: "manual",
        origin: "researcher-1",
      }),
    ).toThrow("does not match");
  });
});
