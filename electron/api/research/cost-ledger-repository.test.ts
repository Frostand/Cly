// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it } from "vitest";

import { AWS_CUR_REQUIRED_COLUMNS } from "./aws-cur.js";
import { createCostLedgerRepository } from "./cost-ledger-repository.js";

let database: DatabaseSync;
let id = 0;

function seedObject(
  objectId: string,
  projectId: string,
  type: "run" | "experiment" | "artifact" | "claim",
  payload: Record<string, unknown>,
  createdAt = "2026-07-01T00:00:00.000Z",
) {
  database
    .prepare(
      `INSERT INTO research_objects
       (id, project_id, type, title, description, payload, created_at, updated_at)
       VALUES (?, ?, ?, ?, '', ?, ?, ?)`,
    )
    .run(
      objectId,
      projectId,
      type,
      objectId,
      JSON.stringify(payload),
      createdAt,
      createdAt,
    );
}

function relate(
  relationshipId: string,
  projectId: string,
  from: string,
  to: string,
  type: string,
) {
  database
    .prepare(
      `INSERT INTO research_relationships
       (id, project_id, from_object_id, to_object_id, type, created_at)
       VALUES (?, ?, ?, ?, ?, '2026-07-01T00:00:00.000Z')`,
    )
    .run(relationshipId, projectId, from, to, type);
}

function manual(
  repository: ReturnType<typeof createCostLedgerRepository>,
  overrides: Partial<Parameters<typeof repository.createManualEntry>[0]> = {},
) {
  return repository.createManualEntry({
    amountMinor: 1250,
    category: "gpu",
    confidenceBps: 9000,
    currency: "USD",
    description: "A100 runtime",
    endedAt: "2026-07-01T01:00:00.000Z",
    projectId: "project-1",
    runId: "run-1",
    startedAt: "2026-07-01T00:00:00.000Z",
    ...overrides,
  });
}

function awsCsv(runId: string, lineItemId = "line-item-1") {
  return `${AWS_CUR_REQUIRED_COLUMNS.join(",")}\n${[
    lineItemId,
    runId,
    "2026-07-01T00:00:00Z",
    "2026-07-01T01:00:00Z",
    "2.345",
    "USD",
    "AmazonEC2",
    "USE1-BoxUsage:p4d.24xlarge",
    "i-123",
  ].join(",")}\n`;
}

beforeEach(() => {
  id = 0;
  database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, description TEXT NOT NULL, payload TEXT NOT NULL,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE cost_entries (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, run_id TEXT NOT NULL,
      source TEXT NOT NULL, provider_entry_id TEXT, dedup_key TEXT NOT NULL,
      amount_minor INTEGER NOT NULL, currency TEXT NOT NULL, category TEXT NOT NULL,
      started_at TEXT NOT NULL, ended_at TEXT NOT NULL, confidence_bps INTEGER NOT NULL,
      description TEXT NOT NULL, raw_json TEXT NOT NULL, created_at TEXT NOT NULL,
      UNIQUE(project_id, dedup_key)
    );
    INSERT INTO projects (id) VALUES ('project-1'), ('project-2');
  `);
  seedObject("run-1", "project-1", "run", {
    kind: "run",
    status: "completed",
  });
  seedObject("run-2", "project-2", "run", {
    kind: "run",
    status: "completed",
  });
});

describe("cost ledger repository", () => {
  it("stores complete manual traceability and enforces project isolation", () => {
    const repository = createCostLedgerRepository(database, {
      clock: () => "2026-07-13T12:00:00.000Z",
      createId: () => `cost-${++id}`,
    });

    expect(manual(repository)).toMatchObject({
      amountMinor: 1250,
      category: "gpu",
      confidenceBps: 9000,
      currency: "USD",
      projectId: "project-1",
      raw: { schema: "cly.manual-cost.v1" },
      runId: "run-1",
      source: "manual",
    });
    expect(() =>
      manual(repository, { projectId: "project-1", runId: "run-2" }),
    ).toThrow("does not belong");
    expect(() => manual(repository, { amountMinor: 1.5 })).toThrow();
  });

  it("imports AWS CUR idempotently within a project and preserves raw rows", () => {
    const repository = createCostLedgerRepository(database, {
      clock: () => "2026-07-13T12:00:00.000Z",
      createId: () => `cost-${++id}`,
    });

    const first = repository.importAwsCur({
      projectId: "project-1",
      csv: awsCsv("run-1"),
      fileName: "cur.csv",
    });
    const repeated = repository.importAwsCur({
      projectId: "project-1",
      csv: awsCsv("run-1"),
      fileName: "cur-copy.csv",
    });
    const otherProject = repository.importAwsCur({
      projectId: "project-2",
      csv: awsCsv("run-2"),
      fileName: "cur.csv",
    });

    expect(first).toMatchObject({ importedCount: 1, duplicateCount: 0 });
    expect(first.ledger.entries[0]).toMatchObject({
      amountMinor: 235,
      providerEntryId: "line-item-1",
      raw: { fileName: "cur.csv", rowNumber: 2 },
    });
    expect(repeated).toMatchObject({ importedCount: 0, duplicateCount: 1 });
    expect(otherProject).toMatchObject({ importedCount: 1, duplicateCount: 0 });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM cost_entries").get(),
    ).toEqual({
      count: 2,
    });
  });

  it("deduplicates a shared run while aggregating artifact evidence to a claim", () => {
    const repository = createCostLedgerRepository(database, {
      clock: () => "2026-07-13T12:00:00.000Z",
      createId: () => `cost-${++id}`,
    });
    seedObject("artifact-1", "project-1", "artifact", { kind: "artifact" });
    seedObject("artifact-2", "project-1", "artifact", { kind: "artifact" });
    seedObject("claim-1", "project-1", "claim", {
      kind: "claim",
      status: "supported",
    });
    relate("generated-1", "project-1", "run-1", "artifact-1", "generated-by");
    relate("generated-2", "project-1", "run-1", "artifact-2", "generated-by");
    relate("supports-1", "project-1", "artifact-1", "claim-1", "supports");
    relate("supports-2", "project-1", "artifact-2", "claim-1", "supports");
    manual(repository);
    manual(repository, {
      amountMinor: 900,
      category: "storage",
      currency: "EUR",
    });

    expect(repository.getClaimCosts("project-1", "claim-1")).toMatchObject({
      conversionState: "unsupported-mixed-currency",
      runIds: ["run-1"],
      totals: [
        { amountMinor: 900, currency: "EUR" },
        { amountMinor: 1250, currency: "USD" },
      ],
    });
    expect(
      repository.getClaimCosts("project-1", "claim-1").entries,
    ).toHaveLength(2);
  });

  it("flags failed, duplicated, abandoned, unused, repeated, and stale reruns", () => {
    const repository = createCostLedgerRepository(database, {
      clock: () => "2026-07-13T12:00:00.000Z",
      createId: () => `cost-${++id}`,
    });
    database.prepare("DELETE FROM research_objects WHERE id = 'run-1'").run();
    seedObject(
      "run-old",
      "project-1",
      "run",
      { kind: "run", status: "failed", commitSha: "abc1234" },
      "2026-07-01T00:00:00.000Z",
    );
    seedObject(
      "run-copy",
      "project-1",
      "run",
      { kind: "run", status: "completed", commitSha: "abc1234" },
      "2026-07-02T00:00:00.000Z",
    );
    seedObject(
      "run-abandoned",
      "project-1",
      "run",
      { kind: "run", status: "running" },
      "2026-07-01T00:00:00.000Z",
    );
    seedObject("experiment-1", "project-1", "experiment", {
      kind: "experiment",
    });
    relate(
      "old-experiment",
      "project-1",
      "run-old",
      "experiment-1",
      "generated-by",
    );
    relate(
      "copy-experiment",
      "project-1",
      "run-copy",
      "experiment-1",
      "generated-by",
    );
    for (const runId of ["run-old", "run-copy", "run-abandoned"]) {
      manual(repository, { runId });
    }

    const entries = Object.fromEntries(
      repository
        .listLedger("project-1")
        .entries.map((entry) => [entry.runId, entry]),
    );
    expect(entries["run-old"].waste).toEqual(
      expect.arrayContaining(["failed", "unused", "stale-rerun"]),
    );
    expect(entries["run-copy"].waste).toEqual(
      expect.arrayContaining(["duplicated", "repeated", "unused"]),
    );
    expect(entries["run-abandoned"].waste).toEqual(
      expect.arrayContaining(["abandoned", "unused"]),
    );
  });
});
