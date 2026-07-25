// @vitest-environment node
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createAgentConfigurationRepository } from "../agents/configuration-repository.js";
import { registerChatRoutes } from "../chat-routes.js";
import {
  canonicalJson,
  createContextRepository,
  sha256,
} from "./context-repository.js";
import { createResearchRepository } from "./repository.js";

const directories: string[] = [];
const clock = () => "2026-07-16T04:00:00.000Z";
const actor = {
  actorId: "researcher",
  producerProcess: "test-suite",
  producerModel: null,
};

function setup(
  options: {
    allowedGlobs?: string[];
    obligationService?: { safeEvaluateOperation: ReturnType<typeof vi.fn> };
  } = {},
) {
  const root = mkdtempSync(path.join(tmpdir(), "cly-context-"));
  directories.push(root);
  const projectOne = path.join(root, "one");
  const projectTwo = path.join(root, "two");
  mkdirSync(projectOne);
  mkdirSync(projectTwo);
  writeFileSync(path.join(projectOne, "notes.md"), "approved file content");
  writeFileSync(path.join(projectTwo, "secret.md"), "cross-project secret");
  const databasePath = path.join(root, "context.db");
  const db = getStateDatabase(databasePath);
  const research = createResearchRepository(db, {
    clock,
    createId: (() => {
      let n = 0;
      return () => `research-${++n}`;
    })(),
  });
  research.upsertProject({ id: "project-1", name: "One", path: projectOne });
  research.upsertProject({ id: "project-2", name: "Two", path: projectTwo });
  const source = research.createObject({
    projectId: "project-1",
    type: "source",
    title: "Dataset",
    description: "",
    payload: { kind: "source", sourceType: "dataset", citation: "Dataset" },
  });
  const otherSource = research.createObject({
    projectId: "project-2",
    type: "source",
    title: "Other dataset",
    description: "",
    payload: {
      kind: "source",
      sourceType: "dataset",
      citation: "Other dataset",
    },
  });
  db.prepare(
    `INSERT INTO chats
     (id, project_id, title, metadata, created_at, updated_at)
     VALUES ('chat-1', 'project-1', 'Conversation', '{}', ?, ?)`,
  ).run(clock(), clock());
  const configurations = createAgentConfigurationRepository({
    db,
    clock,
    createId: () => "configuration-1",
  });
  configurations.create("project-1", {
    name: "Context role",
    maxParallel: 1,
    maxTotalBudget: {
      maxInputTokens: 10000,
      maxOutputTokens: 1000,
      maxCostMinorUnits: 100,
      maxRuntimeMs: 10000,
    },
    partialFailurePolicy: "continue",
    roles: [
      {
        id: "researcher",
        role: "analysis",
        instanceCount: 1,
        maxParallel: 1,
        provider: "openai",
        model: "gpt-5",
        reasoningLevel: "high",
        budget: {
          maxInputTokens: 10000,
          maxOutputTokens: 1000,
          maxCostMinorUnits: 100,
          maxRuntimeMs: 10000,
        },
        allowedTools: [],
        allowedContextSources: ["project"],
        allowedFileGlobs: options.allowedGlobs ?? ["**/*.md", "*.md"],
        permissions: {
          canReadFiles: true,
          canWriteFiles: false,
          canRunCommands: false,
          canAccessNetwork: true,
          requiresApprovalForWrite: true,
          requiresApprovalForNetwork: true,
        },
        approvalCheckpoints: ["provider-transmission"],
      },
    ],
  });
  let id = 0;
  const repository = createContextRepository({
    db,
    now: clock,
    createId: () => `context-${++id}`,
    ...(options.obligationService
      ? { obligationService: options.obligationService }
      : {}),
  });
  return {
    db,
    databasePath,
    repository,
    projectOne,
    projectTwo,
    source,
    otherSource,
  };
}

const approvedId = (item: { approvedRevisionId: string | null }) => {
  if (!item.approvedRevisionId)
    throw new Error("Expected an approved revision.");
  return item.approvedRevisionId;
};

const approvedFact = (referenceId = "memory:claim") => ({
  originClass: "approved_fact" as const,
  referenceId,
  content: "The preregistered primary endpoint is recovery at day 30.",
  confidence: 0.99,
  evidenceRefs: [] as string[],
  lastCheckedAt: clock(),
  producerProcess: "manual-review",
  producerModel: null,
  verificationState: "verified" as const,
  sensitivity: "standard" as const,
});

const manifestRequest = {
  packId: "",
  configurationId: "configuration-1",
  roleId: "researcher",
  provider: "openai",
  model: "gpt-5",
  purpose: "research-assistance",
  collaborators: [] as string[],
  residency: null,
  license: null,
};

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

describe("agent context repository", () => {
  it("keeps approved memory immutable while inferred revisions remain proposals", () => {
    const { db, repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Primary endpoint",
      revision: approvedFact(),
      approve: true,
      actor,
    });
    const proposed = repository.proposeRevision("project-1", item.id, {
      expectedVersion: item.version,
      revision: {
        ...approvedFact(),
        originClass: "inferred_fact",
        content: "The primary endpoint might be recovery at day 14.",
        confidence: 0.55,
        producerProcess: "agent-inference",
        producerModel: "gpt-5",
        verificationState: "conflicted",
      },
      actor,
    });
    expect(proposed.approvedRevision?.content).toContain("day 30");
    expect(proposed.proposedRevisions[0]).toMatchObject({
      originClass: "inferred_fact",
      verificationState: "conflicted",
    });
    expect(() =>
      db
        .prepare("UPDATE agent_context_revisions SET content = 'tampered'")
        .run(),
    ).toThrow(/immutable/i);
    expect(() =>
      db.prepare("DELETE FROM agent_context_revisions").run(),
    ).toThrow(/immutable/i);
    expect(repository.listItems("project-2")).toEqual([]);
    expect(repository.getItem("project-2", item.id)).toBeNull();
  });

  it("audits optimistic pin/lock/delete/restore and rejects invalid locked transitions", () => {
    const { repository } = setup();
    let item = repository.createItem("project-1", {
      label: "Lifecycle",
      revision: approvedFact(),
      approve: true,
      actor,
    });
    item = repository.setLifecycle("project-1", item.id, {
      action: "pin",
      expectedVersion: item.version,
      actor,
    });
    item = repository.setLifecycle("project-1", item.id, {
      action: "lock",
      expectedVersion: item.version,
      actor,
    });
    expect(() =>
      repository.setLifecycle("project-1", item.id, {
        action: "delete",
        expectedVersion: item.version,
        actor,
      }),
    ).toThrow(/unlock/i);
    item = repository.setLifecycle("project-1", item.id, {
      action: "unlock",
      expectedVersion: item.version,
      actor,
    });
    item = repository.setLifecycle("project-1", item.id, {
      action: "delete",
      expectedVersion: item.version,
      actor,
    });
    expect(item.deletedAt).not.toBeNull();
    expect(() =>
      repository.setLifecycle("project-1", item.id, {
        action: "restore",
        expectedVersion: item.version - 1,
        actor,
      }),
    ).toThrow(/conflict/i);
    item = repository.setLifecycle("project-1", item.id, {
      action: "restore",
      expectedVersion: item.version,
      actor,
    });
    expect(item.deletedAt).toBeNull();
    expect(
      repository.listAudit("project-1").map((event) => event.action),
    ).toEqual(
      expect.arrayContaining([
        "context.pin",
        "context.lock",
        "context.unlock",
        "context.delete",
        "context.restore",
      ]),
    );
  });

  it("rolls approval state back when its immutable audit event cannot be written", () => {
    const { db, repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Atomic approval",
      revision: approvedFact(),
      approve: true,
      actor,
    });
    const proposal = repository.proposeRevision("project-1", item.id, {
      expectedVersion: item.version,
      revision: {
        ...approvedFact("memory:proposal"),
        originClass: "inferred_fact",
        content: "A proposed replacement",
      },
      actor,
    });
    expect(() =>
      db
        .prepare(
          `UPDATE agent_context_items
           SET approved_revision_id = ?, version = version + 1, updated_at = ?
           WHERE id = ? AND project_id = 'project-1'`,
        )
        .run(proposal.proposedRevisions[0].id, clock(), item.id),
    ).toThrow(/immutable approval audit/i);
    expect(repository.getItem("project-1", item.id).approvedRevisionId).toBe(
      item.approvedRevisionId,
    );
    db.exec(`
      CREATE TRIGGER fail_context_revision_approval_audit
      BEFORE INSERT ON agent_context_audit_events
      WHEN NEW.action = 'context.revision_approved'
      BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;
    `);
    expect(() =>
      repository.approveRevision(
        "project-1",
        item.id,
        proposal.proposedRevisions[0].id,
        { expectedVersion: proposal.version, actor },
      ),
    ).toThrow(/audit failure/i);
    expect(repository.getItem("project-1", item.id)).toMatchObject({
      approvedRevisionId: item.approvedRevisionId,
      version: proposal.version,
    });
    db.exec("DROP TRIGGER fail_context_revision_approval_audit");

    db.exec(`
      CREATE TRIGGER fail_context_transmission_approval_audit
      BEFORE INSERT ON agent_context_audit_events
      WHEN NEW.action = 'context.transmission_approved'
      BEGIN SELECT RAISE(ABORT, 'simulated audit failure'); END;
    `);
    expect(() =>
      repository.createTransmissionApproval("project-1", {
        manifestSha256: "a".repeat(64),
        provider: "openai",
        model: "gpt-5",
        restrictedReferenceIds: ["memory:restricted"],
        actorId: "researcher",
        rationale: "Must be atomic with its audit record",
        expiresAt: null,
      }),
    ).toThrow(/audit failure/i);
    expect(
      db
        .prepare(
          "SELECT COUNT(*) AS count FROM agent_context_transmission_approvals",
        )
        .get(),
    ).toEqual({ count: 0 });
  });

  it("pins exact ordered revisions in packs and rejects cross-project item/revision pairs", () => {
    const { repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Pack member",
      revision: approvedFact(),
      approve: true,
      actor,
    });
    const proposal = repository.proposeRevision("project-1", item.id, {
      expectedVersion: item.version,
      revision: { ...approvedFact(), content: "A later proposal" },
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Core evidence",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Approved project memory",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    const approved = repository.approveRevision(
      "project-1",
      item.id,
      proposal.proposedRevisions[0].id,
      { expectedVersion: proposal.version, actor },
    );
    expect(approved.approvedRevisionId).not.toBe(item.approvedRevisionId);
    expect(approved.previouslyApprovedRevisions).toEqual([
      expect.objectContaining({ id: item.approvedRevisionId }),
    ]);
    expect(approved.proposedRevisions).toEqual([]);
    expect(repository.listPacks("project-1")[0].entries[0].revisionId).toBe(
      item.approvedRevisionId,
    );
    expect(() =>
      repository.savePack("project-1", {
        ...pack,
        id: "cross-project-pack",
        expectedRevision: undefined,
        entries: [
          {
            itemId: "missing",
            revisionId: approvedId(item),
            representation: "raw",
            selectionReason: "invalid",
            sensitivity: "standard",
          },
        ],
        actor,
      }),
    ).toThrow();
  });

  it("blocks unapproved proposals at repository and raw-SQL pack boundaries until audited approval", () => {
    const { db, repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Human-approved memory",
      revision: approvedFact("memory:approved"),
      approve: true,
      actor,
    });
    const proposed = repository.proposeRevision("project-1", item.id, {
      expectedVersion: item.version,
      revision: {
        ...approvedFact("memory:proposal"),
        originClass: "inferred_fact",
        content: "Verified-looking but not human-approved inference",
      },
      actor,
    });
    const proposal = proposed.proposedRevisions[0];
    expect(() =>
      repository.savePack("project-1", {
        name: "Rejected proposal pack",
        configurationId: "configuration-1",
        roleId: "researcher",
        entries: [
          {
            itemId: item.id,
            revisionId: proposal.id,
            representation: "raw",
            selectionReason: "Must not leave the device",
            sensitivity: "standard",
          },
        ],
        actor,
      }),
    ).toThrow(/current approved/i);

    const empty = repository.savePack("project-1", {
      name: "Raw boundary",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [],
      actor,
    });
    const oldApprovedPack = repository.savePack("project-1", {
      name: "Old approved pointer",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Current before a later approval",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_context_pack_entries
           (pack_id, project_id, position, item_id, revision_id, representation,
            selection_reason, sensitivity) VALUES (?, ?, 0, ?, ?, 'raw', ?, 'standard')`,
        )
        .run(empty.id, "project-1", item.id, proposal.id, "raw SQL proposal"),
    ).toThrow(/current approved/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_context_pack_entries
           (pack_id, project_id, position, item_id, revision_id, representation,
            selection_reason, sensitivity) VALUES (?, ?, 0, ?, ?, 'raw', ?, 'restricted')`,
        )
        .run(
          empty.id,
          "project-1",
          item.id,
          approvedId(item),
          "spoofed sensitivity",
        ),
    ).toThrow(/exact sensitivity/i);
    expect(() =>
      db
        .prepare(
          `UPDATE agent_context_pack_entries SET revision_id = ?
           WHERE pack_id = ? AND project_id = 'project-1' AND position = 0`,
        )
        .run(proposal.id, oldApprovedPack.id),
    ).toThrow(/current approved/i);

    const approved = repository.approveRevision(
      "project-1",
      item.id,
      proposal.id,
      { expectedVersion: proposed.version, actor },
    );
    expect(() =>
      repository.previewManifest("project-1", {
        ...manifestRequest,
        packId: oldApprovedPack.id,
      }),
    ).toThrow(/current approved/i);
    const outbound = repository.savePack("project-1", {
      name: "Approved inference pack",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(approved),
          representation: "raw",
          selectionReason: "Approved after review",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    expect(
      repository.previewManifest("project-1", {
        ...manifestRequest,
        packId: outbound.id,
      }).entries,
    ).toEqual([expect.objectContaining({ revisionId: proposal.id })]);
    const deletedTarget = repository.savePack("project-1", {
      name: "Deleted raw boundary",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [],
      actor,
    });
    repository.setLifecycle("project-1", approved.id, {
      action: "delete",
      expectedVersion: approved.version,
      actor,
    });
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_context_pack_entries
           (pack_id, project_id, position, item_id, revision_id, representation,
            selection_reason, sensitivity) VALUES (?, 'project-1', 0, ?, ?, 'raw', ?, 'standard')`,
        )
        .run(
          deletedTarget.id,
          approved.id,
          approvedId(approved),
          "deleted item",
        ),
    ).toThrow(/non-deleted/i);
  });

  it("derives a stable canonical payload, exact tokens, exclusions, and selected object IDs", () => {
    const safeEvaluateOperation = vi.fn(() => ({
      decision: "allow",
      complete: true,
      evaluationHash: "e".repeat(64),
      alerts: [],
    }));
    const { databasePath, repository, source } = setup({
      obligationService: { safeEvaluateOperation },
    });
    const graph = repository.createItem("project-1", {
      label: "Dataset",
      revision: {
        ...approvedFact(source.id),
        originClass: "graph_object",
        referenceId: source.id,
        evidenceRefs: [`research-object:${source.id}`],
      },
      approve: true,
      actor,
    });
    const localCanary = repository.createItem("project-1", {
      label: "Secret",
      revision: {
        ...approvedFact("memory:secret"),
        content: "LOCAL_ONLY_CANARY_DO_NOT_SEND",
        sensitivity: "local_only",
      },
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Outbound",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: graph.id,
          revisionId: approvedId(graph),
          representation: "raw",
          selectionReason: "Exact evidence",
          sensitivity: "standard",
        },
        {
          itemId: localCanary.id,
          revisionId: approvedId(localCanary),
          representation: "raw",
          selectionReason: "Local notes",
          sensitivity: "local_only",
        },
      ],
      actor,
    });
    const request = {
      ...manifestRequest,
      packId: pack.id,
      purpose: "approved-purpose",
      collaborators: ["alice", "alice"],
      residency: "eu",
      license: "restricted-license",
    };
    const first = repository.previewManifest("project-1", request);
    const second = repository.previewManifest("project-1", {
      model: request.model,
      provider: request.provider,
      roleId: request.roleId,
      configurationId: request.configurationId,
      packId: request.packId,
      collaborators: ["alice", "alice"],
      purpose: "approved-purpose",
      residency: "eu",
      license: "restricted-license",
    });
    expect(second.sha256).toBe(first.sha256);
    expect(sha256(first.canonicalPayload)).toBe(first.sha256);
    expect(first.canonicalPayload).not.toContain("LOCAL_ONLY_CANARY");
    expect(first.entries).toHaveLength(1);
    expect(first.excluded).toEqual([
      expect.objectContaining({ referenceId: "memory:secret" }),
    ]);
    expect(first.totalTokens).toBe(first.entries[0].tokenEstimate);
    expect(safeEvaluateOperation).toHaveBeenCalledWith("project-1", {
      kind: "provider-transmission",
      integration: "agent-context",
      objectIds: [source.id],
      purpose: "approved-purpose",
      collaborators: ["alice"],
      provider: "openai",
      residency: "eu",
      license: "restricted-license",
      external: true,
    });
    const persisted = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "restart-stability",
      expectedSha256: first.sha256,
      transmissionApprovalId: null,
    });
    const changedScope = repository.previewManifest("project-1", {
      ...request,
      purpose: "different-purpose",
    });
    expect(changedScope.sha256).not.toBe(first.sha256);
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        purpose: "different-purpose",
        idempotencyKey: "restart-stability",
        expectedSha256: changedScope.sha256,
        transmissionApprovalId: null,
      }),
    ).toThrow(/idempotency key collision/i);
    closePersistedStateDatabase();
    const reopenedDatabase = new DatabaseSync(databasePath);
    reopenedDatabase.exec("PRAGMA foreign_keys = ON");
    const reopened = createContextRepository({
      db: reopenedDatabase,
      now: clock,
      obligationService: {
        safeEvaluateOperation: vi.fn(() => ({
          decision: "allow",
          complete: true,
          evaluationHash: "e".repeat(64),
          alerts: [],
        })),
      },
    });
    const restartedPreview = reopened.previewManifest("project-1", request);
    expect(restartedPreview.canonicalPayload).toBe(first.canonicalPayload);
    expect(restartedPreview.sha256).toBe(first.sha256);
    expect(
      reopened.loadManifestForEgress("project-1", persisted.id, {
        sha256: persisted.sha256,
        provider: persisted.provider,
        model: persisted.model,
        configurationId: persisted.configurationId,
        roleId: persisted.roleId,
      }).canonicalPayload,
    ).toBe(first.canonicalPayload);
    expect(reopened.listManifests("project-1")[0].obligationOperation).toEqual(
      first.obligationOperation,
    );
    reopenedDatabase.close();
  });

  it("requires a live exact-scope approval for restricted manifests and preserves idempotency", () => {
    const { db, repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Restricted",
      revision: {
        ...approvedFact("memory:restricted"),
        sensitivity: "restricted",
      },
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Restricted outbound",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "summary",
          selectionReason: "Needed for analysis",
          sensitivity: "restricted",
        },
      ],
      actor,
    });
    const request = { ...manifestRequest, packId: pack.id };
    const preview = repository.previewManifest("project-1", request);
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "transmission-1",
        expectedSha256: preview.sha256,
        transmissionApprovalId: null,
      }),
    ).toThrow(/approval/i);
    db.exec("PRAGMA ignore_check_constraints = ON");
    db.prepare(
      `INSERT INTO agent_context_transmission_approvals
       (id, project_id, manifest_sha256, provider, model,
        restricted_reference_ids_json, actor_id, rationale, state,
        expires_at, created_at, revoked_at)
       VALUES ('invalid-expiry', 'project-1', ?, 'openai', 'gpt-5', ?,
               'researcher', 'Malformed durable expiry', 'approved',
               'not-a-date', ?, NULL)`,
    ).run(
      preview.sha256,
      JSON.stringify(preview.restrictedReferenceIds),
      clock(),
    );
    db.exec("PRAGMA ignore_check_constraints = OFF");
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "invalid-expiry",
        expectedSha256: preview.sha256,
        transmissionApprovalId: "invalid-expiry",
      }),
    ).toThrow(/expiry is invalid/i);
    const wrongProject = repository.createTransmissionApproval("project-2", {
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: ["memory:restricted"],
      actorId: "researcher",
      rationale: "wrong project",
      expiresAt: null,
    });
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "wrong-project",
        expectedSha256: preview.sha256,
        transmissionApprovalId: wrongProject.id,
      }),
    ).toThrow(/missing/i);
    const expired = repository.createTransmissionApproval("project-1", {
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: ["memory:restricted"],
      actorId: "researcher",
      rationale: "expired",
      expiresAt: "2026-07-15T04:00:00.000Z",
    });
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "expired",
        expectedSha256: preview.sha256,
        transmissionApprovalId: expired.id,
      }),
    ).toThrow(/expired/i);
    const wrongDestination = repository.createTransmissionApproval(
      "project-1",
      {
        manifestSha256: preview.sha256,
        provider: "openai",
        model: "gpt-5-mini",
        restrictedReferenceIds: ["memory:restricted"],
        actorId: "researcher",
        rationale: "wrong destination",
        expiresAt: null,
      },
    );
    expect(() =>
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "wrong-destination",
        expectedSha256: preview.sha256,
        transmissionApprovalId: wrongDestination.id,
      }),
    ).toThrow(/scope/i);
    const approval = repository.createTransmissionApproval("project-1", {
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: ["memory:restricted"],
      actorId: "researcher",
      rationale: "Reviewed for this exact transmission",
      expiresAt: null,
    });
    const manifest = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "transmission-1",
      expectedSha256: preview.sha256,
      transmissionApprovalId: approval.id,
    });
    expect(
      repository.persistManifest("project-1", {
        ...request,
        idempotencyKey: "transmission-1",
        expectedSha256: preview.sha256,
        transmissionApprovalId: approval.id,
      }).id,
    ).toBe(manifest.id);
    repository.revokeTransmissionApproval("project-1", approval.id, {
      actorId: "researcher",
      rationale: "No longer approved",
    });
    expect(() =>
      repository.loadManifestForEgress("project-1", manifest.id, {
        sha256: manifest.sha256,
        provider: manifest.provider,
        model: manifest.model,
        configurationId: manifest.configurationId,
        roleId: manifest.roleId,
      }),
    ).toThrow(/revoked/i);
  });

  it("binds canonical hashes to entry order, representation, and selection reason", () => {
    const { repository } = setup();
    const first = repository.createItem("project-1", {
      label: "First",
      revision: approvedFact("memory:first"),
      approve: true,
      actor,
    });
    const second = repository.createItem("project-1", {
      label: "Second",
      revision: { ...approvedFact("memory:second"), content: "Second fact" },
      approve: true,
      actor,
    });
    const entry = (
      item: typeof first,
      reason: string,
      representation: "raw" | "summary" = "raw",
    ) => ({
      itemId: item.id,
      revisionId: approvedId(item),
      representation,
      selectionReason: reason,
      sensitivity: "standard" as const,
    });
    const hash = (name: string, entries: ReturnType<typeof entry>[]) => {
      const pack = repository.savePack("project-1", {
        name,
        configurationId: "configuration-1",
        roleId: "researcher",
        entries,
        actor,
      });
      return repository.previewManifest("project-1", {
        ...manifestRequest,
        packId: pack.id,
      }).sha256;
    };
    const baseline = hash("Baseline", [
      entry(first, "Primary"),
      entry(second, "Secondary"),
    ]);
    expect(
      hash("Reason changed", [
        entry(first, "Different reason"),
        entry(second, "Secondary"),
      ]),
    ).not.toBe(baseline);
    expect(
      hash("Representation changed", [
        entry(first, "Primary", "summary"),
        entry(second, "Secondary"),
      ]),
    ).not.toBe(baseline);
    expect(
      hash("Order changed", [
        entry(second, "Secondary"),
        entry(first, "Primary"),
      ]),
    ).not.toBe(baseline);
  });

  it("revalidates the current CLY-42 role policy before provider egress", () => {
    const { db, repository } = setup();
    const item = repository.createItem("project-1", {
      label: "Policy-bound",
      revision: approvedFact("memory:policy"),
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Policy-bound pack",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Policy-bound evidence",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    const request = { ...manifestRequest, packId: pack.id };
    const preview = repository.previewManifest("project-1", request);
    const manifest = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "policy-egress",
      expectedSha256: preview.sha256,
      transmissionApprovalId: null,
    });
    db.prepare(
      "UPDATE agent_configurations SET revision = revision + 1 WHERE id = 'configuration-1' AND project_id = 'project-1'",
    ).run();
    expect(() =>
      repository.loadManifestForEgress("project-1", manifest.id, {
        sha256: manifest.sha256,
        provider: manifest.provider,
        model: manifest.model,
        configurationId: manifest.configurationId,
        roleId: manifest.roleId,
      }),
    ).toThrow(/policy is stale/i);

    db.prepare(
      "UPDATE agent_configurations SET revision = revision - 1 WHERE id = 'configuration-1' AND project_id = 'project-1'",
    ).run();
    db.prepare(
      "UPDATE agent_role_configurations SET allowed_context_sources_json = '[]' WHERE configuration_id = 'configuration-1' AND project_id = 'project-1' AND id = 'researcher'",
    ).run();
    expect(() =>
      repository.loadManifestForEgress("project-1", manifest.id, {
        sha256: manifest.sha256,
        provider: manifest.provider,
        model: manifest.model,
        configurationId: manifest.configurationId,
        roleId: manifest.roleId,
      }),
    ).toThrow(/source is no longer allowed/i);
  });

  it("fails closed when project privacy or selected-item lifecycle tightens after persistence", () => {
    const { db, repository } = setup();
    let item = repository.createItem("project-1", {
      label: "Revocable outbound memory",
      revision: approvedFact("memory:revocable"),
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Revocable outbound pack",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Approved memory",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    const request = { ...manifestRequest, packId: pack.id };
    const preview = repository.previewManifest("project-1", request);
    const manifest = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "revocable-egress",
      expectedSha256: preview.sha256,
      transmissionApprovalId: null,
    });
    const expected = {
      sha256: manifest.sha256,
      provider: manifest.provider,
      model: manifest.model,
      configurationId: manifest.configurationId,
      roleId: manifest.roleId,
    };

    db.prepare("UPDATE projects SET metadata = ? WHERE id = 'project-1'").run(
      JSON.stringify({ localOnly: true }),
    );
    expect(() =>
      repository.loadManifestForEgress("project-1", manifest.id, expected),
    ).toThrow(/local-only/i);

    db.prepare(
      "UPDATE projects SET metadata = '{}' WHERE id = 'project-1'",
    ).run();
    item = repository.setLifecycle("project-1", item.id, {
      action: "delete",
      expectedVersion: item.version,
      actor,
    });
    expect(item.deletedAt).not.toBeNull();
    expect(() =>
      repository.loadManifestForEgress("project-1", manifest.id, expected),
    ).toThrow(/now deleted/i);
  });

  it("blocks raw incomplete, canonical-child-mismatched, and forged-object manifests before provider execution", async () => {
    const { db, repository, projectOne, source } = setup();
    const item = repository.createItem("project-1", {
      label: "Provider boundary",
      revision: {
        ...approvedFact("memory:provider-boundary"),
        evidenceRefs: [`research-object:${source.id}`],
      },
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Provider boundary pack",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Provider boundary",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    const request = { ...manifestRequest, packId: pack.id };
    const preview = repository.previewManifest("project-1", request);
    const valid = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "provider-boundary-valid",
      expectedSha256: preview.sha256,
      transmissionApprovalId: null,
    });
    const cloneManifest = ({
      id,
      canonicalPayload = valid.canonicalPayload,
      selectedObjectIds = valid.selectedObjectIds,
      obligationOperation = valid.obligationOperation,
      totalTokens = valid.totalTokens,
    }: {
      id: string;
      canonicalPayload?: string;
      selectedObjectIds?: string[];
      obligationOperation?: typeof valid.obligationOperation;
      totalTokens?: number;
    }) => {
      const digest = sha256(canonicalPayload);
      db.prepare(
        `INSERT INTO agent_context_manifests
         (id, project_id, pack_id, configuration_id, role_id, provider, model,
          schema_version, idempotency_key, canonical_payload, sha256, total_tokens,
          entry_count, excluded_json, privacy_warnings_json, selected_object_ids_json,
          obligation_operation_json, obligation_operation_hash,
          obligation_evaluation_hash, transmission_approval_id, created_at)
         SELECT ?, project_id, pack_id, configuration_id, role_id, provider, model,
                schema_version, ?, ?, ?, ?, entry_count, excluded_json,
                privacy_warnings_json, ?, ?, ?, obligation_evaluation_hash, NULL,
                created_at
         FROM agent_context_manifests WHERE id = ? AND project_id = 'project-1'`,
      ).run(
        id,
        id,
        canonicalPayload,
        digest,
        totalTokens,
        JSON.stringify(selectedObjectIds),
        canonicalJson(obligationOperation),
        sha256(canonicalJson(obligationOperation)),
        valid.id,
      );
      return digest;
    };
    const sealManifest = (manifestId: string) =>
      db
        .prepare(
          `INSERT INTO agent_context_audit_events
           (id, project_id, manifest_id, action, actor_id, producer_process,
            metadata_json, created_at)
           VALUES (?, 'project-1', ?, 'context.manifest_persisted', 'raw-test',
                   'raw-test', '{}', ?)`,
        )
        .run(`audit-${manifestId}`, manifestId, clock());
    const insertBenignChildAndSeal = (
      manifestId: string,
      tokenEstimate?: number,
    ) => {
      const entry = valid.entries[0];
      if (!entry?.itemId) throw new Error("Expected a durable manifest entry.");
      db.prepare(
        `INSERT INTO agent_context_manifest_entries
         (manifest_id, project_id, position, item_id, revision_id, kind,
          reference_id, representation, token_estimate, selection_reason, sensitivity)
         VALUES (?, 'project-1', 0, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).run(
        manifestId,
        entry.itemId,
        entry.revisionId,
        entry.kind,
        entry.referenceId,
        entry.representation,
        tokenEstimate ?? entry.tokenEstimate,
        entry.selectionReason,
        entry.sensitivity,
      );
      sealManifest(manifestId);
    };

    const zeroChildHash = cloneManifest({ id: "raw-zero-child" });
    expect(() => sealManifest("raw-zero-child")).toThrow(
      /every canonical child row/i,
    );
    const restrictedCanonical = JSON.parse(valid.canonicalPayload);
    restrictedCanonical.entries[0].sensitivity = "restricted";
    restrictedCanonical.entries[0].content = "RESTRICTED CANARY";
    const mismatchPayload = canonicalJson(restrictedCanonical);
    const mismatchHash = cloneManifest({
      id: "raw-canonical-mismatch",
      canonicalPayload: mismatchPayload,
    });
    insertBenignChildAndSeal("raw-canonical-mismatch");

    const forgedOperation = {
      ...valid.obligationOperation,
      objectIds: [],
    };
    const forgedPayloadObject = JSON.parse(valid.canonicalPayload);
    forgedPayloadObject.obligationOperation = forgedOperation;
    const forgedPayload = canonicalJson(forgedPayloadObject);
    const forgedHash = cloneManifest({
      id: "raw-forged-object-ids",
      canonicalPayload: forgedPayload,
      selectedObjectIds: [],
      obligationOperation: forgedOperation,
    });
    insertBenignChildAndSeal("raw-forged-object-ids");
    const forgedTokenPayloadObject = JSON.parse(valid.canonicalPayload);
    forgedTokenPayloadObject.entries[0].tokenEstimate = 0;
    const forgedTokenPayload = canonicalJson(forgedTokenPayloadObject);
    const forgedTokenHash = cloneManifest({
      id: "raw-forged-token-estimate",
      canonicalPayload: forgedTokenPayload,
      totalTokens: 0,
    });
    insertBenignChildAndSeal("raw-forged-token-estimate", 0);
    const leakedPayloadObject = JSON.parse(valid.canonicalPayload);
    leakedPayloadObject.leak = "CANARY";
    leakedPayloadObject.destination.unknown = "nested-canary";
    const leakedPayload = canonicalJson(leakedPayloadObject);
    const leakedPayloadHash = cloneManifest({
      id: "raw-extra-canonical-fields",
      canonicalPayload: leakedPayload,
    });
    insertBenignChildAndSeal("raw-extra-canonical-fields");

    const openai = vi.fn(() => new Response("must-not-run"));
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => db,
      getObligationService: () => ({ safeEvaluateOperation: vi.fn() }),
      getContextRepository: () => repository,
      resolveProjectPath: () => null,
      providerValidators: {
        openai: async () => null,
        opencode: async () => null,
        cursor: async () => null,
        anthropic: async () => null,
      },
      providerStreams: {
        openai,
        opencode: vi.fn(),
        cursor: vi.fn(),
        anthropic: vi.fn(),
      },
    });
    const requestManagedManifest = (manifestId: string, digest: string) =>
      app.request(
        new Request("http://127.0.0.1/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            messages: [],
            model: "gpt-5",
            projectId: "project-1",
            projectPath: projectOne,
            provider: "openai",
            managedContext: {
              manifestId,
              sha256: digest,
              configurationId: "configuration-1",
              roleId: "researcher",
            },
          }),
        }),
      );

    const validResponse = await requestManagedManifest(valid.id, valid.sha256);
    expect(validResponse.status).toBe(200);
    expect(openai).toHaveBeenCalledTimes(1);

    for (const [manifestId, digest] of [
      ["raw-zero-child", zeroChildHash],
      ["raw-canonical-mismatch", mismatchHash],
      ["raw-forged-object-ids", forgedHash],
      ["raw-forged-token-estimate", forgedTokenHash],
      ["raw-extra-canonical-fields", leakedPayloadHash],
    ] as const) {
      const response = await requestManagedManifest(manifestId, digest);
      expect(response.status).toBe(409);
    }
    db.prepare("UPDATE projects SET metadata = ? WHERE id = 'project-1'").run(
      JSON.stringify({ localOnly: true }),
    );
    expect((await requestManagedManifest(valid.id, valid.sha256)).status).toBe(
      409,
    );
    db.prepare(
      "UPDATE projects SET metadata = '{}' WHERE id = 'project-1'",
    ).run();
    repository.setLifecycle("project-1", item.id, {
      action: "delete",
      expectedVersion: item.version,
      actor,
    });
    expect((await requestManagedManifest(valid.id, valid.sha256)).status).toBe(
      409,
    );
    expect(openai).toHaveBeenCalledTimes(1);
  });

  it("enforces durable role, manifest-approval, and immutable approval bindings with raw SQL", () => {
    const { db, repository } = setup();
    db.exec(`
      INSERT INTO agent_configurations
      SELECT 'configuration-2', project_id, 'Other configuration', max_parallel,
             max_input_tokens, max_output_tokens, max_cost_minor_units,
             max_runtime_ms, partial_failure_policy, revision, created_at, updated_at
      FROM agent_configurations WHERE id = 'configuration-1';
      INSERT INTO agent_role_configurations
             (configuration_id, project_id, id, position, role,
              instance_count, max_parallel, provider, model, reasoning_level,
              reasoning_effort, max_input_tokens, max_output_tokens,
              max_cost_minor_units, max_runtime_ms, allowed_tools_json,
              allowed_context_sources_json, allowed_file_globs_json,
              permissions_json, approval_checkpoints_json, fallback_model)
      SELECT 'configuration-2', project_id, 'other-role', position, role,
             instance_count, max_parallel, provider, model, reasoning_level,
             reasoning_effort, max_input_tokens, max_output_tokens, max_cost_minor_units,
             max_runtime_ms, allowed_tools_json, allowed_context_sources_json,
             allowed_file_globs_json, permissions_json, approval_checkpoints_json,
             fallback_model
      FROM agent_role_configurations
      WHERE configuration_id = 'configuration-1' AND id = 'researcher';
    `);
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_context_packs
           (id, project_id, name, configuration_id, role_id, revision, created_at, updated_at)
           VALUES ('bad-role-pack', 'project-1', 'Bad role pack', 'configuration-1',
                   'other-role', 1, ?, ?)`,
        )
        .run(clock(), clock()),
    ).toThrow(/foreign key/i);

    const item = repository.createItem("project-1", {
      label: "Binding source",
      revision: approvedFact("memory:binding"),
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Binding pack",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: item.id,
          revisionId: approvedId(item),
          representation: "raw",
          selectionReason: "Binding test",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    const request = { ...manifestRequest, packId: pack.id };
    const preview = repository.previewManifest("project-1", request);
    const base = repository.persistManifest("project-1", {
      ...request,
      idempotencyKey: "binding-base",
      expectedSha256: preview.sha256,
      transmissionApprovalId: null,
    });
    const crossProject = repository.createTransmissionApproval("project-2", {
      manifestSha256: base.sha256,
      provider: base.provider,
      model: base.model,
      restrictedReferenceIds: ["memory:binding"],
      actorId: "researcher",
      rationale: "Cross-project approval",
      expiresAt: null,
    });
    const wrongHash = repository.createTransmissionApproval("project-1", {
      manifestSha256: "b".repeat(64),
      provider: base.provider,
      model: base.model,
      restrictedReferenceIds: ["memory:binding"],
      actorId: "researcher",
      rationale: "Wrong hash approval",
      expiresAt: null,
    });
    const expired = repository.createTransmissionApproval("project-1", {
      manifestSha256: base.sha256,
      provider: base.provider,
      model: base.model,
      restrictedReferenceIds: ["memory:binding"],
      actorId: "researcher",
      rationale: "Expired binding approval",
      expiresAt: "2020-01-01T00:00:00.000Z",
    });
    const exact = repository.createTransmissionApproval("project-1", {
      manifestSha256: base.sha256,
      provider: base.provider,
      model: base.model,
      restrictedReferenceIds: ["memory:binding"],
      actorId: "researcher",
      rationale: "Exact binding approval",
      expiresAt: null,
    });
    const copyManifest = (
      id: string,
      idempotencyKey: string,
      configurationId: string,
      roleId: string,
      approvalId: string | null,
    ) =>
      db
        .prepare(
          `INSERT INTO agent_context_manifests
           (id, project_id, pack_id, configuration_id, role_id, provider, model,
            schema_version, idempotency_key, canonical_payload, sha256, total_tokens,
            entry_count, excluded_json, privacy_warnings_json, selected_object_ids_json,
            obligation_operation_json, obligation_operation_hash,
            obligation_evaluation_hash, transmission_approval_id, created_at)
           SELECT ?, project_id, pack_id, ?, ?, provider, model, schema_version, ?,
                  canonical_payload, sha256, total_tokens, entry_count, excluded_json,
                  privacy_warnings_json, selected_object_ids_json,
                  obligation_operation_json, obligation_operation_hash,
                  obligation_evaluation_hash, ?, created_at
           FROM agent_context_manifests WHERE id = ? AND project_id = 'project-1'`,
        )
        .run(id, configurationId, roleId, idempotencyKey, approvalId, base.id);

    expect(() =>
      copyManifest(
        "bad-pack-policy",
        "bad-pack-policy",
        "configuration-2",
        "other-role",
        null,
      ),
    ).toThrow(/policy must match/i);
    expect(() =>
      copyManifest(
        "missing-approval",
        "missing-approval",
        "configuration-1",
        "researcher",
        "missing",
      ),
    ).toThrow();
    expect(() =>
      copyManifest(
        "cross-approval",
        "cross-approval",
        "configuration-1",
        "researcher",
        crossProject.id,
      ),
    ).toThrow();
    expect(() =>
      copyManifest(
        "wrong-hash-approval",
        "wrong-hash-approval",
        "configuration-1",
        "researcher",
        wrongHash.id,
      ),
    ).toThrow(/approval must match/i);
    expect(() =>
      copyManifest(
        "expired-approval",
        "expired-approval",
        "configuration-1",
        "researcher",
        expired.id,
      ),
    ).toThrow(/approval must match/i);
    expect(
      copyManifest(
        "exact-approval",
        "exact-approval",
        "configuration-1",
        "researcher",
        exact.id,
      ).changes,
    ).toBe(1);
    const insertCopiedEntry = (
      position: number,
      kind: string,
      referenceId: string,
      sensitivity: string,
    ) =>
      db
        .prepare(
          `INSERT INTO agent_context_manifest_entries
           (manifest_id, project_id, position, item_id, revision_id, kind,
            reference_id, representation, token_estimate, selection_reason, sensitivity)
           VALUES ('exact-approval', 'project-1', ?, ?, ?, ?, ?, 'raw', 1,
                   'raw copied entry', ?)`,
        )
        .run(
          position,
          item.id,
          approvedId(item),
          kind,
          referenceId,
          sensitivity,
        );
    expect(() =>
      insertCopiedEntry(0, "inferred_fact", "memory:binding", "standard"),
    ).toThrow(/copy the current approved/i);
    expect(() =>
      insertCopiedEntry(0, "approved_fact", "memory:spoofed", "standard"),
    ).toThrow(/copy the current approved/i);
    expect(() =>
      insertCopiedEntry(0, "approved_fact", "memory:binding", "restricted"),
    ).toThrow(/copy the current approved/i);
    expect(
      insertCopiedEntry(0, "approved_fact", "memory:binding", "standard")
        .changes,
    ).toBe(1);
    expect(() =>
      insertCopiedEntry(1, "approved_fact", "memory:binding", "standard"),
    ).toThrow(/sealed canonical entry count/i);

    const mutations: Array<[string, string]> = [
      ["id", `${exact.id}-changed`],
      ["project_id", "project-2"],
      ["manifest_sha256", "c".repeat(64)],
      ["provider", "anthropic"],
      ["model", "other-model"],
      ["restricted_reference_ids_json", '["other"]'],
      ["actor_id", "other-actor"],
      ["rationale", "changed rationale"],
      ["expires_at", "2027-01-01T00:00:00.000Z"],
      ["created_at", "2027-01-01T00:00:00.000Z"],
    ];
    for (const [column, value] of mutations)
      expect(() =>
        db
          .prepare(
            `UPDATE agent_context_transmission_approvals SET ${column} = ? WHERE id = ? AND project_id = 'project-1'`,
          )
          .run(value, exact.id),
      ).toThrow(/scope is immutable/i);
    expect(() =>
      db
        .prepare(
          "UPDATE agent_context_transmission_approvals SET state = 'revoked', revoked_at = ? WHERE id = ? AND project_id = 'project-1'",
        )
        .run(clock(), exact.id),
    ).toThrow(/audited/i);
    expect(() =>
      db
        .prepare(
          "DELETE FROM agent_context_transmission_approvals WHERE id = ? AND project_id = 'project-1'",
        )
        .run(exact.id),
    ).toThrow(/cannot be deleted/i);
    expect(() =>
      db
        .prepare(
          `INSERT INTO agent_context_transmission_approvals
           (id, project_id, manifest_sha256, provider, model,
            restricted_reference_ids_json, actor_id, rationale, state,
            expires_at, created_at, revoked_at)
           VALUES ('already-revoked', 'project-1', ?, 'openai', 'gpt-5', '[]',
                   'actor', 'invalid initial state', 'revoked', NULL, ?, ?)`,
        )
        .run("d".repeat(64), clock(), clock()),
    ).toThrow(/begin approved/i);

    expect(
      repository.revokeTransmissionApproval("project-1", exact.id, {
        actorId: "researcher",
        rationale: "Audited revocation",
      }),
    ).toEqual({ id: exact.id, state: "revoked" });
    expect(() =>
      db
        .prepare(
          "UPDATE agent_context_transmission_approvals SET state = 'approved', revoked_at = NULL WHERE id = ? AND project_id = 'project-1'",
        )
        .run(exact.id),
    ).toThrow();
  });

  it("enforces provider/model, file allowlists, traversal, and symlink confinement", () => {
    const { repository, projectOne, projectTwo } = setup({
      allowedGlobs: ["notes.md"],
    });
    const file = repository.createItem("project-1", {
      label: "File",
      revision: {
        ...approvedFact("notes.md"),
        originClass: "file",
        referenceId: "notes.md",
      },
      approve: true,
      actor,
    });
    const pack = repository.savePack("project-1", {
      name: "Files",
      configurationId: "configuration-1",
      roleId: "researcher",
      entries: [
        {
          itemId: file.id,
          revisionId: approvedId(file),
          representation: "raw",
          selectionReason: "Source file",
          sensitivity: "standard",
        },
      ],
      actor,
    });
    expect(() =>
      repository.previewManifest("project-1", {
        ...manifestRequest,
        packId: pack.id,
        model: "wrong-model",
      }),
    ).toThrow(/destination/i);
    expect(() =>
      repository.createItem("project-1", {
        label: "Traversal",
        revision: {
          ...approvedFact("../two/secret.md"),
          originClass: "file",
          referenceId: "../two/secret.md",
        },
        approve: true,
        actor,
      }),
    ).toThrow(/confined/i);
    symlinkSync(
      path.join(projectTwo, "secret.md"),
      path.join(projectOne, "link.md"),
    );
    expect(() =>
      repository.createItem("project-1", {
        label: "Symlink",
        revision: {
          ...approvedFact("link.md"),
          originClass: "file",
          referenceId: "link.md",
        },
        approve: true,
        actor,
      }),
    ).toThrow(/outside/i);
  });
});
