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
  it.each([
    [
      "missing capability",
      {
        streaming: true,
        reasoning: true,
        toolCalls: true,
      },
      [{ id: "test-model" }],
    ],
    [
      "non-boolean capability",
      {
        streaming: true,
        reasoning: true,
        toolCalls: "yes",
        interceptBeforeEffect: true,
      },
      [{ id: "test-model" }],
    ],
    [
      "unknown capability",
      {
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
        futureCapability: true,
      },
      [{ id: "test-model" }],
    ],
    [
      "malformed model identifier",
      {
        streaming: true,
        reasoning: true,
        toolCalls: true,
        interceptBeforeEffect: true,
      },
      [{ id: "test-model" }, { id: " invalid-model " }],
    ],
  ])("rejects authenticated provider discovery with %s", async (_, capabilities, models) => {
    const directory = mkdtempSync(path.join(tmpdir(), "cly-handoff-provider-"));
    directories.push(directory);
    const db = getStateDatabase(path.join(directory, "state.sqlite"));
    const dependencies = createProductionClyDevHandoffDependencies({
      db,
      runner: {
        getAuthentication: () => ({ status: "authenticated" }),
        listModels: () => models,
        getCapabilities: () => capabilities,
      },
    });

    await expect(dependencies.getProviderCapabilities({})).rejects.toThrow(
      /capabilit|model/i,
    );
  });

  it("never publishes existing durable approvals as pre-materialization authority", () => {
    const directory = mkdtempSync(
      path.join(tmpdir(), "cly-handoff-approvals-"),
    );
    directories.push(directory);
    const db = getStateDatabase(path.join(directory, "state.sqlite"));
    const insertProject = db.prepare(
      `INSERT INTO projects
       (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'open', 0, ?, '2026-07-16', '2026-07-16')`,
    );
    for (const projectId of ["project-1", "project-2"]) {
      insertProject.run(
        projectId,
        `/tmp/${projectId}`,
        `/tmp/${projectId}`,
        projectId,
        JSON.stringify({ clyDevPolicy: { default: "deny" } }),
      );
    }
    const sessions = createClyDevSessionRepository({ db });
    const createSession = (projectId: string, suffix: string) =>
      sessions.createSessionAggregate(projectId, {
        workspace: {
          schemaVersion: 1,
          idempotencyKey: `workspace-${suffix}`,
          name: `Workspace ${suffix}`,
          repository: { id: `repo-${suffix}` },
          worktree: { id: `tree-${suffix}`, branch: "main" },
          machine: { id: `machine-${suffix}`, platform: "darwin" },
          localOnly: {
            repositoryPath: `/tmp/repo-${suffix}`,
            worktreePath: `/tmp/tree-${suffix}`,
          },
        },
        contextManifest: {
          schemaVersion: 1,
          idempotencyKey: `context-${suffix}`,
          localOnly: {},
          transferable: { summary: "Approval fixture", entries: [] },
        },
        task: {
          schemaVersion: 1,
          idempotencyKey: `task-${suffix}`,
          title: `Task ${suffix}`,
          objective: "Require fresh approval",
          researchObjectIds: [],
        },
        session: {
          schemaVersion: 1,
          idempotencyKey: `session-${suffix}`,
          title: `Session ${suffix}`,
          provider: { id: "openai-codex", model: "test-model" },
          commit: { sha: "a".repeat(40) },
          state: "resumable",
        },
      }).session;
    const currentSession = createSession("project-1", "current");
    const otherSession = createSession("project-1", "other-session");
    const otherProjectSession = createSession("project-2", "other-project");
    const insertApproval = db.prepare(
      `INSERT INTO cly_dev_approvals
       (id, project_id, session_id, schema_version, payload_version, state,
        request_sequence, resolution_sequence, payload_json, requested_at, resolved_at)
       VALUES (?, ?, ?, 1, 1, 'approved', 1, 2, ?, '2020-01-01', '2020-01-01')`,
    );
    for (const [id, projectId, sessionId] of [
      ["expired-current-session", "project-1", currentSession.id],
      ["approved-other-session", "project-1", otherSession.id],
      ["approved-other-project", "project-2", otherProjectSession.id],
    ]) {
      insertApproval.run(
        id,
        projectId,
        sessionId,
        JSON.stringify({
          approvalId: id,
          requestedAction: "writeFile",
          detail: JSON.stringify({ expiresAt: "2020-01-01T00:00:00.000Z" }),
        }),
      );
    }
    const dependencies = createProductionClyDevHandoffDependencies({
      db,
      runner: {
        getAuthentication: () => ({ status: "authenticated" }),
        listModels: () => [{ id: "test-model" }],
        getCapabilities: () => ({
          streaming: true,
          reasoning: true,
          toolCalls: true,
          interceptBeforeEffect: true,
        }),
      },
    });

    expect(dependencies.inspectApprovals({ projectId: "project-1" })).toEqual({
      compatible: true,
      currentApprovalIds: [],
    });
    expect(dependencies.inspectApprovals({ projectId: "project-2" })).toEqual({
      compatible: true,
      currentApprovalIds: [],
    });
  });

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
    db.prepare(
      `INSERT INTO research_objects
       (id, project_id, type, title, description, payload, origin, review_state,
        created_at, updated_at)
       VALUES ('research-1', 'project-1', 'claim', 'Production evidence',
               'Exercises live research inspection', '{"status":"supported"}',
               'human', 'reviewed', '2026-07-16T12:00:00.000Z',
               '2026-07-16T12:30:00.000Z')`,
    ).run();
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
            { kind: "research_object", researchObjectId: "research-1" },
          ],
        },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: "startup-task",
        title: "Resume from startup",
        objective: "Prove production handoff composition",
        researchObjectIds: ["research-1"],
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
    expect(envelope.payload.research.objects).toEqual([
      expect.objectContaining({
        id: "research-1",
        version: "2026-07-16T12:30:00.000Z",
        contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }),
    ]);

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
          task: expect.objectContaining({
            researchObjectIds: ["research-1"],
          }),
        }),
      }),
    );
  });
});
