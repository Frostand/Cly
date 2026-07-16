// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import getPort from "get-port";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ app: { getPath: () => tmpdir() } }));

import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../../persisted-state.js";
import { API_SESSION_TOKEN_HEADER, startApiServer } from "../../app.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { createProductionClyDevHandoffDependencies } from "./handoff-production.js";

const directories: string[] = [];
let server: Awaited<ReturnType<typeof startApiServer>> | undefined;

afterEach(async () => {
  await server?.close();
  server = undefined;
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("production Cly Dev handoff startup", () => {
  it("fails closed when live project and provider inspectors lack authority", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cly-handoff-closed-"));
    directories.push(directory);
    const db = getStateDatabase(path.join(directory, "state.sqlite"));
    db.prepare(
      `INSERT INTO projects
       (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
       VALUES ('project-1', '/tmp/project-1', '/tmp/project-1', 'Closed fixture',
               'open', 0, '{}', '2026-07-16', '2026-07-16')`,
    ).run();
    const dependencies = createProductionClyDevHandoffDependencies({
      db,
      runner: {
        getAuthentication: () => ({ status: "absent" }),
        listModels: () => [],
        getCapabilities: () => ({}),
      },
    });

    expect(() =>
      dependencies.inspectPermissions({ projectId: "project-1" }),
    ).toThrow(/current Cly Dev project policy/i);
    expect(() =>
      dependencies.inspectApprovals({ projectId: "project-1" }),
    ).toThrow(/current Cly Dev project policy/i);
    await expect(
      dependencies.getProviderCapabilities({ projectId: "project-1" }),
    ).rejects.toThrow(/not authenticated/i);
    await expect(
      dependencies.inspectRepository({
        projectId: "project-1",
        repository: {
          id: "missing-repository",
          worktreeId: "missing-worktree",
          branch: "main",
          files: [],
        },
      }),
    ).rejects.toThrow(/matching target repository worktree/i);
  });

  it("serves authenticated export, inspection, and import through the constructed bundle", async () => {
    const directory = mkdtempSync(path.join(tmpdir(), "cly-handoff-startup-"));
    directories.push(directory);
    const repositoryPath = path.join(directory, "repository");
    mkdirSync(path.join(repositoryPath, "src"), { recursive: true });
    writeFileSync(
      path.join(repositoryPath, "src/index.ts"),
      "export const ready = true;\n",
    );
    execFileSync("git", ["init", "-q"], { cwd: repositoryPath });
    execFileSync("git", ["add", "src/index.ts"], { cwd: repositoryPath });
    execFileSync(
      "git",
      [
        "-c",
        "user.name=Cly",
        "-c",
        "user.email=cly@example.com",
        "commit",
        "-qm",
        "fixture",
      ],
      { cwd: repositoryPath },
    );
    const commitSha = execFileSync("git", ["rev-parse", "HEAD"], {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();
    const branch = execFileSync("git", ["branch", "--show-current"], {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();
    const objectHash = execFileSync("git", ["rev-parse", "HEAD:src/index.ts"], {
      cwd: repositoryPath,
      encoding: "utf8",
    }).trim();

    const db = getStateDatabase(path.join(directory, "state.sqlite"));
    db.prepare(
      `INSERT INTO projects
       (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 0, ?, ?, ?)`,
    ).run(
      "project-1",
      repositoryPath,
      repositoryPath,
      "Startup fixture",
      JSON.stringify({ clyDevPolicy: { default: "deny" } }),
      "2026-07-16T12:00:00.000Z",
      "2026-07-16T12:00:00.000Z",
    );
    const sessions = createClyDevSessionRepository({ db });
    const aggregate = sessions.createSessionAggregate("project-1", {
      workspace: {
        schemaVersion: 1,
        idempotencyKey: "startup-workspace",
        name: "Startup workspace",
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch },
        machine: { id: "startup-machine", platform: "darwin" },
        localOnly: {
          repositoryPath,
          worktreePath: repositoryPath,
        },
      },
      contextManifest: {
        schemaVersion: 1,
        idempotencyKey: "startup-context",
        localOnly: {},
        transferable: {
          summary: "Committed startup context",
          entries: [
            {
              kind: "repository_file",
              repositoryId: "repo-1",
              relativePath: "src/index.ts",
              commitSha,
              objectHash,
            },
          ],
        },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: "startup-task",
        title: "Resume from startup",
        objective: "Prove production handoff composition",
        researchObjectIds: [],
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: "startup-session",
        title: "Startup session",
        provider: { id: "openai-codex", model: "test-model" },
        commit: { sha: commitSha },
        state: "resumable",
      },
    });
    const runner = {
      getAuthentication: vi.fn(() => ({ status: "authenticated" })),
      listModels: vi.fn(() => [{ id: "test-model" }]),
      getCapabilities: vi.fn(() => ({
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
      })),
    };
    const dependencies = createProductionClyDevHandoffDependencies({
      db,
      runner,
    });
    const port = await getPort({ host: "127.0.0.1" });
    const token = "startup-authority";
    server = await startApiServer({
      port,
      apiToken: token,
      allowedRendererOrigin: `http://127.0.0.1:${port}`,
      clyDevHandoff: dependencies,
    });
    const request = (pathname: string, body: unknown) =>
      fetch(`http://127.0.0.1:${port}${pathname}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          [API_SESSION_TOKEN_HEADER]: token,
        },
        body: JSON.stringify(body),
      });
    const base = "/api/projects/project-1/cly-dev/handoffs";

    const exportedResponse = await request(`${base}/export`, {
      sessionId: aggregate.session.id,
    });
    expect(exportedResponse.status).toBe(200);
    const envelope = await exportedResponse.json();

    const inspectionResponse = await request(`${base}/inspect`, { envelope });
    expect(inspectionResponse.status).toBe(200);
    expect(await inspectionResponse.json()).toEqual(
      expect.objectContaining({ compatible: true, stale: [] }),
    );

    const importResponse = await request(`${base}/import`, { envelope });
    expect(importResponse.status).toBe(201);
    expect(await importResponse.json()).toEqual(
      expect.objectContaining({
        duplicate: false,
        materialized: expect.objectContaining({
          actionableState: expect.any(Object),
        }),
      }),
    );
  });
});
