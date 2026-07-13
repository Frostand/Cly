// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { beforeEach, describe, expect, it } from "vitest";
import { registerObligationRoutes } from "./obligation-routes.js";
import { createObligationService } from "./obligation-service.js";

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle/0010_data_obligations.sql",
);

let database: DatabaseSync;
let provenance: Array<Record<string, unknown>>;

function seedDatabase() {
  database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys = ON");
  database.exec(`
    CREATE TABLE projects (id TEXT PRIMARY KEY);
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL
    );
    INSERT INTO projects VALUES ('project-a'), ('project-b');
    INSERT INTO research_objects VALUES
      ('dataset-a', 'project-a', 'source', 'Participant cohort', '{"kind":"source"}'),
      ('artifact-a', 'project-a', 'artifact', 'Analysis table', '{"kind":"artifact"}'),
      ('claim-a', 'project-a', 'claim', 'Primary outcome', '{"kind":"claim"}'),
      ('dataset-b', 'project-b', 'source', 'Other cohort', '{"kind":"source"}');
    INSERT INTO research_relationships VALUES
      ('edge-1', 'project-a', 'dataset-a', 'artifact-a', 'uses'),
      ('edge-2', 'project-a', 'artifact-a', 'claim-a', 'supports'),
      ('edge-loop', 'project-a', 'claim-a', 'dataset-a', 'implements');
  `);
  database.exec(
    readFileSync(migrationPath, "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
  provenance = [];
}

const obligationInput = {
  consentProtocolScope:
    "Protocol P-17; consent permits approved analysis only.",
  approvedPurposes: ["peer-review", "research-assistance"],
  permittedCollaborators: ["reviewer@example.org"],
  externalProcessing: "review" as const,
  permittedProviders: ["openai"],
  residency: ["US"],
  retentionExpiresAt: "2027-07-01",
  deletionDueAt: "2027-07-31",
  license: "DUA-Research-Only",
  owner: "Data steward",
  reviewDate: "2026-08-01",
  provenanceSource: "IRB approval letter dated 2026-06-01",
  notes: "Reconfirm scope after protocol amendment.",
  actorId: "researcher-a",
};

function service(now = "2026-07-13T12:00:00.000Z") {
  let sequence = 0;
  return createObligationService(database, {
    clock: () => now,
    createId: () => `generated-${++sequence}`,
    appendProvenance: (event) => {
      provenance.push(event);
      return event;
    },
  });
}

beforeEach(seedDatabase);

describe("research-data obligations", () => {
  it("migrates project-isolated tables and rejects cross-project datasets", () => {
    const repository = service();
    expect(() =>
      repository.saveObligation("project-a", "dataset-b", obligationInput),
    ).toThrow("does not belong");

    expect(() =>
      database
        .prepare(
          `INSERT INTO dataset_obligations
           (id, project_id, dataset_object_id, consent_protocol_scope,
            approved_purposes_json, permitted_collaborators_json,
            external_processing, permitted_providers_json, residency_json,
            license, owner, provenance_source, created_by, updated_by,
            created_at, updated_at)
           VALUES ('bad', 'project-a', 'dataset-b', 'scope', '[]', '[]',
                   'review', '[]', '[]', 'license', 'owner', 'source',
                   'actor', 'actor', '2026-07-13', '2026-07-13')`,
        )
        .run(),
    ).toThrow("must belong to its project");
  });

  it("stores validated obligations, audits revisions, and propagates once through loops", () => {
    const repository = service();
    const first = repository.saveObligation(
      "project-a",
      "dataset-a",
      obligationInput,
    );
    repository.saveObligation("project-a", "dataset-a", {
      ...obligationInput,
      notes: "Reviewed with the data steward.",
    });

    const summary = repository.getSummary("project-a");
    expect(first).toMatchObject({
      datasetTitle: "Participant cohort",
      revision: 1,
    });
    expect(summary.obligations[0]).toMatchObject({ revision: 2 });
    expect(summary.inheritedRestrictions["claim-a"]).toHaveLength(1);
    expect(summary.inheritedRestrictions["artifact-a"]).toHaveLength(1);
    expect(provenance.map((event) => event.action)).toEqual([
      "dataset-obligation.created",
      "dataset-obligation.updated",
    ]);
  });

  it("blocks hard conflicts and requires durable human approval for warnings", () => {
    const repository = service();
    repository.saveObligation("project-a", "dataset-a", obligationInput);
    const operation = {
      kind: "export" as const,
      integration: "reviewer-capsule",
      objectIds: ["claim-a"],
      purpose: "peer-review",
      collaborators: ["reviewer@example.org"],
      provider: null,
      residency: "US",
      license: "DUA-Research-Only",
      external: true,
    };

    expect(repository.evaluateOperation("project-a", operation)).toMatchObject({
      decision: "review",
      alerts: expect.arrayContaining([
        expect.objectContaining({ category: "external-processing" }),
      ]),
    });
    const approved = repository.approveOperation("project-a", operation, {
      actorId: "principal-investigator",
      rationale: "The named reviewer and purpose match the protocol.",
    });
    expect(approved.evaluation).toMatchObject({
      decision: "allow",
      approval: { actorId: "principal-investigator" },
    });

    const blocked = repository.evaluateOperation("project-a", {
      ...operation,
      kind: "provider-transmission",
      integration: "agent-chat",
      provider: "anthropic",
    });
    expect(blocked.decision).toBe("block");
    expect(blocked.alerts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ category: "provider", severity: "critical" }),
      ]),
    );
    expect(() =>
      repository.approveOperation("project-a", blocked.operation, {
        actorId: "principal-investigator",
        rationale: "Approve anyway",
      }),
    ).toThrow("Hard obligation conflicts cannot be approved");
  });

  it("preserves operations for projects without obligations and fails closed on errors", () => {
    const repository = service();
    expect(
      repository.evaluateOperation("project-b", {
        kind: "export",
        objectIds: ["dataset-b"],
      }),
    ).toMatchObject({ decision: "allow", alerts: [] });
    expect(
      repository.safeEvaluateOperation("missing-project", {
        kind: "provider-transmission",
      }),
    ).toMatchObject({
      decision: "block",
      complete: false,
      alerts: [expect.objectContaining({ category: "evaluation" })],
    });
  });

  it("exposes reviewable route evaluation and acknowledgement workflow", async () => {
    const repository = service();
    repository.saveObligation("project-a", "dataset-a", obligationInput);
    const app = new Hono();
    registerObligationRoutes(app, { getService: () => repository });

    const response = await app.request(
      "/api/projects/project-a/obligations/evaluate",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind: "export",
          integration: "reviewer-capsule",
          objectIds: ["claim-a"],
          purpose: "peer-review",
          collaborators: ["reviewer@example.org"],
          residency: "US",
          license: "DUA-Research-Only",
        }),
      },
    );
    expect(response.status).toBe(200);
    const evaluation = await response.json();
    expect(evaluation.decision).toBe("review");

    const transition = await app.request(
      `/api/projects/project-a/obligations/alerts/${evaluation.alerts[0].id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          state: "acknowledged",
          actorId: "reviewer-a",
          note: "Reviewed; approval will be recorded for the operation.",
        }),
      },
    );
    expect(transition.status).toBe(200);
    expect(await transition.json()).toMatchObject({ state: "acknowledged" });
  });
});
