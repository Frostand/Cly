import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { expect, test } from "@playwright/test";
import { inspectGitResumeDestination } from "../../electron/api/cly-dev/git-resume.js";
import {
  createClyDevHandoffService,
  createMemoryHandoffTransport,
} from "../../electron/api/cly-dev/handoff-service.js";
import { createClyDevSessionRepository } from "../../electron/api/cly-dev/session-repository.js";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../electron/persisted-state.js";

const git = (cwd: string, ...args: string[]) =>
  execFileSync("git", args, { cwd, encoding: "utf8" }).trim();

function initializeDatabase(databasePath: string) {
  getStateDatabase(databasePath);
  closePersistedStateDatabase();
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;");
  database
    .prepare(
      `INSERT INTO projects
      (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
     VALUES ('project-a', '/repo', '/repo', 'Project A', 'open', 0, '{}', '2026-07-16', '2026-07-16')`,
    )
    .run();
  return database;
}

function createSession(
  repository: ReturnType<typeof createClyDevSessionRepository>,
  machine: { id: string; platform: "darwin" | "linux" | "win32" },
  repositoryPath: string,
  commitSha: string,
) {
  const aggregate = repository.createSessionAggregate("project-a", {
    workspace: {
      schemaVersion: 1,
      idempotencyKey: "workspace-a",
      id: "workspace-a",
      name: "Feature worktree",
      repository: {
        id: "repo-a",
        remoteUrl: "https://github.com/cly/repo.git",
      },
      worktree: {
        id: "worktree-a",
        branch: "feature/resume",
        baseRef: "main",
      },
      machine,
      localOnly: { repositoryPath, worktreePath: repositoryPath },
    },
    contextManifest: {
      schemaVersion: 1,
      idempotencyKey: "context-a",
      id: "context-a",
      localOnly: {
        absolutePaths: [repositoryPath],
        environmentVariableNames: ["PRIVATE_TOKEN"],
        notes: ["Never transfer"],
        uncommittedFilePaths: [],
      },
      transferable: {
        summary: "Approved research context",
        entries: [{ kind: "commit", commitSha }],
      },
    },
    task: {
      schemaVersion: 1,
      idempotencyKey: "task-a",
      id: "task-a",
      title: "Resume cross-device audit",
      objective: "Continue without restating completed work",
      researchObjectIds: ["claim-a"],
    },
    session: {
      schemaVersion: 1,
      idempotencyKey: "session-a",
      id: "session-a",
      title: "Cross-device audit",
      provider: { id: "openai", model: "gpt-5" },
      commit: { sha: commitSha },
      state: "resumable",
    },
  });
  return aggregate.session;
}

const append = (
  repository: ReturnType<typeof createClyDevSessionRepository>,
  key: string,
  type: string,
  payload: Record<string, unknown>,
  actor = { kind: "agent" as const, id: "agent-1" },
) =>
  repository.appendEvent("project-a", "session-a", {
    schemaVersion: 1,
    payloadVersion: 1,
    idempotencyKey: key,
    type,
    transferability: "transferable",
    occurredAt: "2026-07-16T12:00:00.000Z",
    actor,
    payload,
  });

test("hands a Git-backed task from machine A to B and returns updated state without copying files", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "cly-cross-device-"));
  const remote = path.join(root, "remote.git");
  const machineAPath = path.join(root, "machine-a");
  const machineBPath = path.join(root, "machine-b");
  execFileSync("git", ["init", "--bare", remote]);
  execFileSync("git", ["clone", remote, machineAPath]);
  git(machineAPath, "config", "user.email", "agent-a@cly.local");
  git(machineAPath, "config", "user.name", "Machine A");
  git(machineAPath, "checkout", "-b", "feature/resume");
  writeFileSync(path.join(machineAPath, "tracked.txt"), "committed\n");
  git(machineAPath, "add", "tracked.txt");
  git(machineAPath, "commit", "-m", "Seed handoff");
  git(machineAPath, "push", "-u", "origin", "feature/resume");
  execFileSync("git", ["clone", "-b", "feature/resume", remote, machineBPath]);
  for (const clone of [machineAPath, machineBPath]) {
    git(
      clone,
      "remote",
      "set-url",
      "origin",
      "https://github.com/cly/repo.git",
    );
  }
  const commitSha = git(machineAPath, "rev-parse", "HEAD");

  const sourceDatabase = initializeDatabase(
    path.join(root, "machine-a.sqlite"),
  );
  const destinationDatabase = initializeDatabase(
    path.join(root, "machine-b.sqlite"),
  );
  const sourceRepository = createClyDevSessionRepository({
    db: sourceDatabase,
  });
  const destinationRepository = createClyDevSessionRepository({
    db: destinationDatabase,
  });
  createSession(
    sourceRepository,
    { id: "machine-a", platform: "darwin" },
    machineAPath,
    commitSha,
  );
  append(sourceRepository, "message-a", "message.recorded", {
    role: "user",
    body: "Continue the approved audit plan.",
  });
  append(sourceRepository, "plan-a", "plan.recorded", {
    steps: [
      { id: "verify", text: "Verify the regression", status: "completed" },
      { id: "review", text: "Complete review", status: "pending" },
    ],
  });
  append(sourceRepository, "diff-a", "diff.recorded", {
    relativePaths: ["tracked.txt"],
    additions: 1,
    deletions: 0,
    commitSha,
  });
  append(sourceRepository, "tests-a", "test.recorded", {
    commandId: "unit-tests",
    passed: 12,
    failed: 0,
    durationMs: 420,
  });
  append(sourceRepository, "remaining-a", "remaining_work.recorded", {
    items: ["Complete independent review"],
  });

  const transport = createMemoryHandoffTransport();
  const sourceService = createClyDevHandoffService({
    repository: sourceRepository,
    transport,
    inspectDestination: inspectGitResumeDestination,
  });
  const destinationService = createClyDevHandoffService({
    repository: destinationRepository,
    transport,
    inspectDestination: inspectGitResumeDestination,
  });
  await sourceService.pairDevice({
    deviceId: "machine-a",
    pairingCode: "123456",
  });
  await destinationService.pairDevice({
    deviceId: "machine-b",
    pairingCode: "654321",
  });
  const first = await sourceService.publish("project-a", "session-a", {
    deviceId: "machine-a",
    expectedRevision: 0,
  });

  const uncommittedPath = path.join(machineAPath, "machine-a-only.txt");
  writeFileSync(uncommittedPath, "must not cross devices\n");
  const resumedOnB = await destinationService.resume(first.handoffId, {
    deviceId: "machine-b",
    destination: {
      name: "Machine B",
      path: machineBPath,
      repositoryPath: machineBPath,
      worktreePath: machineBPath,
      requiredTools: ["git"],
      machine: { id: "machine-b", platform: "linux" },
    },
  });
  expect(resumedOnB.readiness).toMatchObject({
    blocking: false,
    status: "ready",
  });
  expect(() => git(machineBPath, "status", "--porcelain")).not.toThrow();
  expect(git(machineBPath, "status", "--porcelain")).toBe("");
  expect(
    destinationRepository
      .listEvents("project-a", "session-a")
      .map((event: { type: string }) => event.type),
  ).toEqual([
    "message.recorded",
    "plan.recorded",
    "diff.recorded",
    "test.recorded",
    "remaining_work.recorded",
  ]);

  append(destinationRepository, "message-b", "message.recorded", {
    role: "agent",
    body: "Machine B completed the independent review.",
  });
  const second = await destinationService.publish("project-a", "session-a", {
    deviceId: "machine-b",
    expectedRevision: 1,
  });
  await expect(
    sourceService.publish("project-a", "session-a", {
      deviceId: "machine-a",
      expectedRevision: 1,
    }),
  ).rejects.toMatchObject({ code: "handoff-conflict" });

  unlinkSync(uncommittedPath);
  const returnedToA = await sourceService.resume(second.handoffId, {
    deviceId: "machine-a",
    destination: {
      name: "Machine A",
      path: machineAPath,
      repositoryPath: machineAPath,
      worktreePath: machineAPath,
      requiredTools: ["git"],
      machine: { id: "machine-a", platform: "darwin" },
    },
  });
  expect(returnedToA.readiness.blocking).toBe(false);
  expect(
    sourceRepository.listEvents("project-a", "session-a").at(-1),
  ).toMatchObject({
    type: "message.recorded",
    payload: { body: "Machine B completed the independent review." },
  });
  expect(JSON.stringify(second)).not.toContain(machineAPath);

  sourceDatabase.close();
  destinationDatabase.close();
  rmSync(root, { recursive: true, force: true });
});

test("blocks unsafe cross-device resumes with explicit recovery states", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "cly-cross-device-matrix-"));
  const remote = path.join(root, "remote.git");
  const machineAPath = path.join(root, "machine-a");
  const machineBPath = path.join(root, "machine-b");
  execFileSync("git", ["init", "--bare", remote]);
  execFileSync("git", ["clone", remote, machineAPath]);
  git(machineAPath, "config", "user.email", "agent-a@cly.local");
  git(machineAPath, "config", "user.name", "Machine A");
  git(machineAPath, "checkout", "-b", "feature/resume");
  writeFileSync(path.join(machineAPath, "tracked.txt"), "handoff source\n");
  git(machineAPath, "add", "tracked.txt");
  git(machineAPath, "commit", "-m", "Create handoff source");
  git(machineAPath, "push", "-u", "origin", "feature/resume");
  execFileSync("git", ["clone", "-b", "feature/resume", remote, machineBPath]);
  for (const clone of [machineAPath, machineBPath]) {
    git(
      clone,
      "remote",
      "set-url",
      "origin",
      "https://github.com/cly/repo.git",
    );
  }
  const commitSha = git(machineAPath, "rev-parse", "HEAD");
  const sourceDatabase = initializeDatabase(
    path.join(root, "matrix-source.sqlite"),
  );
  const sourceRepository = createClyDevSessionRepository({
    db: sourceDatabase,
  });
  createSession(
    sourceRepository,
    { id: "machine-a", platform: "darwin" },
    machineAPath,
    commitSha,
  );

  const transport = createMemoryHandoffTransport();
  const service = createClyDevHandoffService({
    repository: sourceRepository,
    transport,
    inspectDestination: inspectGitResumeDestination,
  });
  await service.pairDevice({ deviceId: "machine-a", pairingCode: "123456" });
  await service.pairDevice({ deviceId: "machine-b", pairingCode: "654321" });
  const envelope = await service.publish("project-a", "session-a", {
    deviceId: "machine-a",
    expectedRevision: 0,
  });
  const destination = (repositoryPath: string) => ({
    name: "Machine B",
    path: repositoryPath,
    repositoryPath,
    worktreePath: repositoryPath,
    requiredTools: ["git"],
    machine: { id: "machine-b", platform: "linux" as const },
  });

  await expect(
    service.inspect(envelope.handoffId, {
      deviceId: "machine-b",
      destination: destination(path.join(root, "missing-repository")),
    }),
  ).resolves.toMatchObject({
    readiness: {
      status: "missing-repository",
      blocking: true,
      actions: ["clone", "defer", "return-to-source"],
    },
  });

  git(machineBPath, "config", "user.email", "agent-b@cly.local");
  git(machineBPath, "config", "user.name", "Machine B");
  writeFileSync(
    path.join(machineBPath, "tracked.txt"),
    "divergent destination\n",
  );
  git(machineBPath, "add", "tracked.txt");
  git(machineBPath, "commit", "-m", "Diverge on machine B");
  await expect(
    service.inspect(envelope.handoffId, {
      deviceId: "machine-b",
      destination: destination(machineBPath),
    }),
  ).resolves.toMatchObject({
    readiness: {
      status: "divergent-branch",
      blocking: true,
      actions: [
        "create-branch",
        "create-worktree",
        "inspect-changes",
        "defer",
        "return-to-source",
      ],
    },
  });

  transport.setOnline(false);
  await expect(
    service.inspect(envelope.handoffId, {
      deviceId: "machine-b",
      destination: destination(machineBPath),
      offline: true,
    }),
  ).rejects.toMatchObject({ code: "transport-offline" });
  transport.setOnline(true);

  transport.setAuthenticated(false);
  await expect(
    service.inspect(envelope.handoffId, {
      deviceId: "machine-b",
      destination: destination(machineBPath),
    }),
  ).rejects.toMatchObject({ code: "provider-authentication-failed" });
  transport.setAuthenticated(true);

  transport.revokeDevice("machine-b");
  await expect(
    service.inspect(envelope.handoffId, {
      deviceId: "machine-b",
      destination: destination(machineBPath),
    }),
  ).rejects.toMatchObject({ code: "device-revoked" });

  sourceDatabase.close();
  rmSync(root, { recursive: true, force: true });
});
