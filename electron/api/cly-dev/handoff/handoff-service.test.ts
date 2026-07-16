// @vitest-environment node
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { hashHandoffPayload } from "./canonical-json.js";
import { createClyDevHandoffRepository } from "./handoff-repository.js";
import { createClyDevHandoffService } from "./handoff-service.js";

const openDatabases: DatabaseSync[] = [];
const migration = readFileSync(
  new URL("../../../drizzle/0016_cly_dev_handoffs.sql", import.meta.url),
  "utf8",
).replaceAll("--> statement-breakpoint", "");

function openDatabase(databasePath = ":memory:") {
  const db = new DatabaseSync(databasePath);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(
    `CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY NOT NULL);`,
  );
  db.exec(migration);
  openDatabases.push(db);
  return db;
}

const validEnvelope = () => {
  const envelope = JSON.parse(
    readFileSync(new URL("./fixtures/valid-v1.json", import.meta.url), "utf8"),
  );
  envelope.integrity.digest = hashHandoffPayload(envelope.payload);
  return envelope;
};

const inspectionState = (overrides = {}) => ({
  repository: {
    id: "repo-1",
    branch: "feature/handoff",
    worktreeId: "worktree-1",
    commitSha: "a".repeat(40),
    files: [{ relativePath: "src/index.ts", objectHash: "b".repeat(40) }],
  },
  research: {
    objects: [{ id: "research-1", version: "v3", contentHash: "c".repeat(64) }],
  },
  capabilities: ["tool_calls", "structured_output"],
  ...overrides,
});

function setup(state = inspectionState(), databasePath = ":memory:") {
  const db = openDatabase(databasePath);
  db.prepare("INSERT INTO projects (id) VALUES (?)").run("project-1");
  db.prepare("INSERT INTO projects (id) VALUES (?)").run("project-2");
  const repository = createClyDevHandoffRepository({
    db,
    now: () => "2026-07-16T12:00:01.000Z",
  });
  return {
    db,
    repository,
    service: createClyDevHandoffService({
      repository,
      now: () => "2026-07-16T12:00:00.000Z",
      inspectRepository: () => state.repository,
      inspectResearch: () => state.research,
      getProviderCapabilities: () => state.capabilities,
    }),
  };
}

afterEach(() => {
  while (openDatabases.length) openDatabases.pop()?.close();
});

describe("Cly Dev handoff service", () => {
  it("round-trips actionable state without raw conversation", async () => {
    const { service } = setup();
    const source = validEnvelope().payload;
    const exported = await service.exportHandoff({
      projectId: "project-1",
      payload: source,
      includeMessages: false,
    });
    expect(exported.payload.messages).toEqual([]);
    expect(exported.payload.conversationSync).toBe("excluded");
    expect(exported.payload.goal).toEqual(source.goal);
    expect(exported.payload.plan).toEqual(source.plan);
    expect(exported.payload.remainingWork).toEqual(source.remainingWork);

    const result = await service.importHandoff({
      projectId: "project-1",
      envelope: exported,
    });
    expect(result.inspection.compatible).toBe(true);
    expect(result.payload.goal).toEqual(source.goal);
    expect(result.payload.contextManifest).toEqual(source.contextManifest);
  });

  it("redacts restricted optional material before export", async () => {
    const { service } = setup();
    const payload = validEnvelope().payload;
    const restricted = JSON.parse(
      readFileSync(
        new URL("./fixtures/redaction-input.json", import.meta.url),
        "utf8",
      ),
    );
    Object.assign(payload, restricted);
    const exported = await service.exportHandoff({
      projectId: "project-1",
      payload,
    });
    expect(JSON.stringify(exported.payload)).not.toMatch(/pty-1|\/tmp\/repo/);
  });

  it("rejects corruption before inspection or persistence", async () => {
    const { repository, service } = setup();
    const envelope = JSON.parse(
      readFileSync(
        new URL("./fixtures/corrupt-v1.json", import.meta.url),
        "utf8",
      ),
    );
    const inspected = await service.inspectImport({
      projectId: "project-1",
      envelope,
    });
    expect(inspected.compatible).toBe(false);
    expect(inspected.conflicts[0].code).toBe("integrity_mismatch");
    await expect(
      service.importHandoff({ projectId: "project-1", envelope }),
    ).rejects.toThrow(/integrity/i);
    expect(repository.list("project-1")).toEqual([]);
  });

  it("explains repository and research staleness with recovery actions", async () => {
    const state = inspectionState({
      repository: {
        ...inspectionState().repository,
        commitSha: "d".repeat(40),
        files: [{ relativePath: "src/index.ts", objectHash: "e".repeat(40) }],
      },
      research: {
        objects: [
          { id: "research-1", version: "v4", contentHash: "f".repeat(64) },
        ],
      },
    });
    const { service } = setup(state);
    const inspected = await service.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(inspected.compatible).toBe(true);
    expect(inspected.stale.map((item: { code: string }) => item.code)).toEqual(
      expect.arrayContaining([
        "repository_commit_changed",
        "repository_file_changed",
        "research_object_changed",
      ]),
    );
    expect(
      inspected.stale.every(
        (item: { recoveryAction?: string }) => item.recoveryAction,
      ),
    ).toBe(true);
  });

  it("reports provider capability conflicts before import", async () => {
    const providerFixture = JSON.parse(
      readFileSync(
        new URL("./fixtures/provider-limited.json", import.meta.url),
        "utf8",
      ),
    );
    const { service } = setup(
      inspectionState({ capabilities: providerFixture.capabilities }),
    );
    const envelope = validEnvelope();
    const inspected = await service.inspectImport({
      projectId: "project-1",
      envelope,
    });
    expect(inspected.compatible).toBe(false);
    expect(inspected.conflicts).toEqual([
      expect.objectContaining({
        code: "provider_capability_missing",
        capability: "structured_output",
      }),
    ]);
    expect(
      inspected.conflicts.map(
        (item: { capability: string }) => item.capability,
      ),
    ).toEqual(providerFixture.expectedMissing);
    await expect(
      service.importHandoff({ projectId: "project-1", envelope }),
    ).rejects.toThrow(/capabilit/i);
  });

  it("exports the existing durable aggregate shape without provider or machine state", async () => {
    const { service } = setup();
    const source = validEnvelope().payload;
    const envelope = await service.exportHandoff({
      projectId: "project-1",
      aggregate: {
        workspace: {
          repository: {
            id: source.repository.id,
            remoteUrl: source.repository.remoteUrl,
          },
          worktree: {
            id: source.repository.worktreeId,
            branch: source.repository.branch,
          },
          machine: { id: "machine-1", platform: "darwin" },
          localOnly: { repositoryPath: "/tmp/private" },
        },
        task: {
          id: source.task.id,
          title: source.task.title,
          objective: source.goal.objective,
        },
        session: {
          id: source.task.sessionId,
          state: source.task.state,
          commit: { sha: source.repository.commitSha },
          provider: { id: "provider-a", model: "model-a" },
        },
        contextManifest: {
          id: source.contextManifest.id,
          transferable: {
            summary: source.contextManifest.summary,
            entries: source.contextManifest.entries,
          },
          localOnly: { absolutePaths: ["/tmp/private"] },
        },
        events: [],
        research: source.research,
        relevantSymbols: source.repository.symbols,
        goal: source.goal,
        plan: source.plan,
        progress: source.progress,
        openQuestions: source.openQuestions,
        permissions: source.permissions,
        constraints: source.constraints,
        costs: source.costs,
        providerRequirements: source.providerRequirements,
      },
      includeMessages: false,
    });
    expect(envelope.payload.repository).toEqual(source.repository);
    expect(JSON.stringify(envelope.payload)).not.toMatch(
      /machine-1|provider-a|\/tmp\/private/,
    );
  });

  it("persists idempotent imports across database reopen with project isolation", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "cly-handoff-")),
      "state.sqlite",
    );
    const { db, service } = setup(inspectionState(), databasePath);
    const first = await service.importHandoff({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    const duplicate = await service.importHandoff({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(duplicate.record.id).toBe(first.record.id);
    expect(duplicate.duplicate).toBe(true);
    db.close();
    openDatabases.splice(openDatabases.indexOf(db), 1);

    const reopened = new DatabaseSync(databasePath);
    openDatabases.push(reopened);
    const repository = createClyDevHandoffRepository({ db: reopened });
    expect(repository.list("project-1")).toHaveLength(1);
    expect(repository.list("project-2")).toHaveLength(0);
    expect(() => repository.get("project-2", first.record.id)).toThrow(
      /project/i,
    );
  });
});
