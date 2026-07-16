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
  permissions: {
    compatible: true,
    current: {
      filesystem: "workspace-write",
      network: "restricted",
      commands: ["pnpm vitest"],
    },
  },
  approvals: {
    compatible: true,
    currentApprovalIds: ["approval-1", "fresh-target-approval"],
  },
  ...overrides,
});

function setup(
  state = inspectionState(),
  databasePath = ":memory:",
  serviceOverrides = {},
) {
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
      projectExists: ({ projectId }) =>
        Boolean(
          db.prepare("SELECT id FROM projects WHERE id = ?").get(projectId),
        ),
      inspectRepository: () => state.repository,
      inspectResearch: () => state.research,
      getProviderCapabilities: () => state.capabilities,
      inspectPermissions: () => state.permissions,
      inspectApprovals: () => state.approvals,
      ...serviceOverrides,
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
    expect(result.authority).toEqual({
      source: "target-project",
      permissions: inspectionState().permissions.current,
      authorizedApprovalIds: ["fresh-target-approval"],
    });
    expect(
      result.payload.approvals.every((approval) => approval.evidenceOnly),
    ).toBe(true);
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
    expect(JSON.stringify(exported.payload)).not.toMatch(
      /pty-1|private-worktree|API_TOKEN|Users\/example/,
    );
  });

  it("excludes messages by default and rejects unsafe explicit message sync", async () => {
    const { service } = setup();
    const payload = validEnvelope().payload;
    const defaultExport = await service.exportHandoff({
      projectId: "project-1",
      payload,
    });
    expect(defaultExport.payload.conversationSync).toBe("excluded");
    expect(defaultExport.payload.messages).toEqual([]);

    const unsafeByDefault = validEnvelope().payload;
    unsafeByDefault.messages[0].body =
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature";
    const safelyExcluded = await service.exportHandoff({
      projectId: "project-1",
      payload: unsafeByDefault,
    });
    expect(safelyExcluded.payload.messages).toEqual([]);
    expect(JSON.stringify(safelyExcluded.payload)).not.toContain("Bearer");

    for (const body of [
      "Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.payload.signature",
      "Use Basic dXNlcjpwYXNzd29yZA== for the request",
      "Token ghp_1234567890abcdefghijklmnop",
      "OPENAI_API_KEY=sk-1234567890abcdefghijklmnop",
      "Inspect /Users/example/private.txt before resuming",
    ]) {
      const unsafe = validEnvelope().payload;
      unsafe.messages[0].body = body;
      await expect(
        service.exportHandoff({
          projectId: "project-1",
          payload: unsafe,
          includeMessages: true,
        }),
      ).rejects.toThrow(
        /credential|restricted|machine path|authorization|token/i,
      );
    }
  });

  it("requires a nonempty existing project and every applicable inspector", async () => {
    const db = openDatabase();
    db.prepare("INSERT INTO projects (id) VALUES (?)").run("project-1");
    const repository = createClyDevHandoffRepository({ db });
    const unguarded = createClyDevHandoffService({ repository });
    const inspected = await unguarded.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(inspected.compatible).toBe(false);
    expect(
      inspected.conflicts.map((item: { code: string }) => item.code),
    ).toEqual(
      expect.arrayContaining([
        "project_lookup_unavailable",
        "repository_inspector_unavailable",
        "research_inspector_unavailable",
        "provider_capability_inspector_unavailable",
        "permission_inspector_unavailable",
        "approval_inspector_unavailable",
      ]),
    );

    const { service } = setup();
    await expect(
      service.exportHandoff({
        projectId: "",
        payload: validEnvelope().payload,
      }),
    ).rejects.toThrow(/project/i);
    const missing = await service.inspectImport({
      projectId: "missing-project",
      envelope: validEnvelope(),
    });
    expect(missing.conflicts).toEqual([
      expect.objectContaining({ code: "project_not_found" }),
    ]);

    const { service: mismatched } = setup(inspectionState(), ":memory:", {
      projectExists: () => ({ id: "project-2" }),
    });
    const wrongProject = await mismatched.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(wrongProject.compatible).toBe(false);
    expect(wrongProject.conflicts).toEqual([
      expect.objectContaining({ code: "project_identity_mismatch" }),
    ]);
    await expect(
      mismatched.exportHandoff({
        projectId: "project-1",
        payload: validEnvelope().payload,
      }),
    ).rejects.toThrow(/project/i);
  });

  it("turns inspector errors and unavailable source state into blocking conflicts", async () => {
    const { service: throwing } = setup(inspectionState(), ":memory:", {
      inspectRepository: () => {
        throw new Error("git unavailable");
      },
    });
    const failed = await throwing.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(failed.compatible).toBe(false);
    expect(failed.conflicts).toEqual([
      expect.objectContaining({ code: "repository_inspection_failed" }),
    ]);

    const { service: unavailable } = setup(
      inspectionState({
        repository: { ...inspectionState().repository, files: [] },
        research: { objects: [] },
      }),
    );
    const unknown = await unavailable.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(unknown.compatible).toBe(false);
    expect(
      unknown.conflicts.map((item: { code: string }) => item.code),
    ).toEqual(
      expect.arrayContaining([
        "repository_file_state_unavailable",
        "research_object_state_unavailable",
      ]),
    );
    expect(unknown.stale).toEqual([]);

    const { service: partial } = setup(
      inspectionState({
        repository: {
          ...inspectionState().repository,
          files: [{ relativePath: "src/index.ts" }],
        },
        research: { objects: [{ id: "research-1" }] },
      }),
    );
    const partialState = await partial.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(partialState.compatible).toBe(false);
    expect(
      partialState.conflicts.map((item: { code: string }) => item.code),
    ).toEqual(
      expect.arrayContaining([
        "repository_file_state_unavailable",
        "research_object_state_unavailable",
      ]),
    );
    expect(partialState.stale).toEqual([]);

    const { service: malformedCommit } = setup(
      inspectionState({
        repository: {
          ...inspectionState().repository,
          commitSha: "unknown",
        },
      }),
    );
    const unknownCommit = await malformedCommit.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(unknownCommit.compatible).toBe(false);
    expect(unknownCommit.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "repository_state_unavailable",
          field: "commitSha",
        }),
      ]),
    );
    expect(
      unknownCommit.stale.some(
        (item: { code: string }) => item.code === "repository_commit_changed",
      ),
    ).toBe(false);
  });

  it("requires current target authority and never reuses imported approvals", async () => {
    const { service } = setup(
      inspectionState({
        permissions: { compatible: false, reason: "network is disabled" },
        approvals: { compatible: false, reason: "fresh approval required" },
      }),
    );
    const inspected = await service.inspectImport({
      projectId: "project-1",
      envelope: validEnvelope(),
    });
    expect(inspected.compatible).toBe(false);
    expect(
      inspected.conflicts.map((item: { code: string }) => item.code),
    ).toEqual(
      expect.arrayContaining([
        "target_permissions_incompatible",
        "target_approvals_incompatible",
      ]),
    );
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
    expect(inspected.authority).toBeNull();
    await expect(
      service.importHandoff({ projectId: "project-1", envelope }),
    ).rejects.toThrow(/capabilit/i);
  });

  it("requires explicit provider requirements and provider inspection for resumption", async () => {
    const source = validEnvelope().payload;
    const { service } = setup();
    await expect(
      service.exportHandoff({
        projectId: "project-1",
        aggregate: {
          workspace: {
            repository: source.repository,
            worktree: {
              id: source.repository.worktreeId,
              branch: source.repository.branch,
            },
          },
          task: {
            id: source.task.id,
            title: source.task.title,
            objective: source.goal.objective,
          },
          session: {
            id: source.task.sessionId,
            state: "resumable",
            commit: { sha: source.repository.commitSha },
            provider: { id: "provider-a", model: "model-a" },
          },
          contextManifest: source.contextManifest,
          events: [],
          research: source.research,
          goal: source.goal,
          plan: source.plan,
          progress: source.progress,
          permissions: source.permissions,
          costs: source.costs,
        },
      }),
    ).rejects.toThrow(/provider|requirements|capabilities/i);

    const providerRequired = validEnvelope();
    providerRequired.payload.providerRequirements = {
      required: true,
      capabilities: [],
    };
    providerRequired.integrity.digest = hashHandoffPayload(
      providerRequired.payload,
    );
    const { service: noProviderInspector } = setup(
      inspectionState(),
      ":memory:",
      { getProviderCapabilities: undefined },
    );
    const inspected = await noProviderInspector.inspectImport({
      projectId: "project-1",
      envelope: providerRequired,
    });
    expect(inspected.conflicts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "provider_capability_inspector_unavailable",
        }),
      ]),
    );

    const knownNone = validEnvelope().payload;
    knownNone.task.state = "completed";
    knownNone.providerRequirements = { required: false, capabilities: [] };
    const exported = await service.exportHandoff({
      projectId: "project-1",
      payload: knownNone,
    });
    expect(exported.payload.providerRequirements).toEqual({
      required: false,
      capabilities: [],
    });

    const providerBackedKnownNone = validEnvelope().payload;
    providerBackedKnownNone.providerRequirements = {
      required: false,
      capabilities: [],
    };
    await expect(
      service.exportHandoff({
        projectId: "project-1",
        payload: providerBackedKnownNone,
      }),
    ).rejects.toThrow(/provider|resum/i);
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

  it("uses insert-first conflict handling for duplicate import identity", () => {
    const db = openDatabase();
    db.prepare("INSERT INTO projects (id) VALUES (?)").run("project-1");
    const handoffStatements: string[] = [];
    const observedDb = {
      prepare(sql: string) {
        if (/cly_dev_handoffs/i.test(sql)) handoffStatements.push(sql.trim());
        return db.prepare(sql);
      },
    };
    const repository = createClyDevHandoffRepository({ db: observedDb });
    const envelope = validEnvelope();
    const first = repository.recordImport("project-1", envelope, {});
    const second = repository.recordImport("project-1", envelope, {});
    expect(first.duplicate).toBe(false);
    expect(second).toEqual({ record: first.record, duplicate: true });
    expect(handoffStatements[0]).toMatch(/^INSERT/i);
  });
});
