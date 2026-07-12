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

import { createResearchRepository } from "./repository.js";
import { createRepositoryObserver } from "./repository-observer.js";

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
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE provenance_events (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, object_id TEXT, action TEXT NOT NULL,
      actor_type TEXT NOT NULL, actor_id TEXT, metadata TEXT NOT NULL, created_at TEXT NOT NULL
    );
  `);
  return database;
}

async function createGitRepository() {
  const root = await mkdtemp(path.join(tmpdir(), "cly-observer-"));
  temporaryDirectories.push(root);
  await execFileAsync("git", ["init", "--quiet", root]);
  await writeFile(path.join(root, "tracked.txt"), "initial\n");
  await execFileAsync("git", ["add", "tracked.txt"], { cwd: root });
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

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

describe("repository observer", () => {
  it("associates Git changes with a registered Cly project", async () => {
    const root = await createGitRepository();
    const database = createDatabase();
    const repository = createResearchRepository(database);
    repository.upsertProject({ id: "project-1", name: "Project", path: root });
    await writeFile(path.join(root, "tracked.txt"), "changed\n");
    await mkdir(path.join(root, "results"));
    await writeFile(path.join(root, "results", "run.json"), "{}\n");

    const result = await createRepositoryObserver(repository).scan("project-1");

    expect(result.projectId).toBe("project-1");
    expect(result.changes).toEqual(
      expect.arrayContaining([
        {
          indexStatus: " ",
          path: "tracked.txt",
          worktreeStatus: "M",
        },
        {
          indexStatus: "?",
          path: "results/run.json",
          worktreeStatus: "?",
        },
      ]),
    );
    expect(result.repository.head).toMatch(/^[a-f0-9]{40}$/);
    expect(repository.listProvenance("project-1", { limit: 10 })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: "repository.scan.completed",
          actorType: "system",
          metadata: expect.objectContaining({ changeCount: 2 }),
        }),
        expect.objectContaining({
          action: "repository.change.observed",
          metadata: expect.objectContaining({ path: "tracked.txt" }),
        }),
      ]),
    );
  });

  it("rejects roots that are not the registered canonical Git top level", async () => {
    const root = await createGitRepository();
    const database = createDatabase();
    const repository = createResearchRepository(database);
    const child = path.join(root, "child");
    await mkdir(child);
    repository.upsertProject({ id: "child", name: "Child", path: child });

    await expect(
      createRepositoryObserver(repository).scan("child"),
    ).rejects.toThrow(
      "registered project root must be the Git repository root",
    );

    const alias = `${root}-alias`;
    temporaryDirectories.push(alias);
    await symlink(root, alias, "dir");
    repository.upsertProject({ id: "alias", name: "Alias", path: alias });
    await expect(
      createRepositoryObserver(repository).scan("alias"),
    ).rejects.toThrow("registered project path is not canonical");
  });

  it("fails closed when Git metadata exceeds the observation bound", async () => {
    const root = await createGitRepository();
    const database = createDatabase();
    const repository = createResearchRepository(database);
    repository.upsertProject({ id: "project-1", name: "Project", path: root });
    await writeFile(
      path.join(root, "untracked-with-a-long-name.txt"),
      "content\n",
    );

    await expect(
      createRepositoryObserver(repository, { maxGitOutputBytes: 8 }).scan(
        "project-1",
      ),
    ).rejects.toThrow("Repository observation exceeded its output limit");
    expect(repository.listProvenance("project-1")).toEqual([]);
  });
});
