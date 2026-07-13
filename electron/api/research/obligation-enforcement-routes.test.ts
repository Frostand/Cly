// @vitest-environment node
import { readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { Hono } from "hono";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerChatRoutes } from "../chat-routes.js";
import { createObligationService } from "./obligation-service.js";
import { registerResearchRoutes } from "./routes.js";

const migrationPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../drizzle/0010_data_obligations.sql",
);
let database: DatabaseSync;
let obligationService: ReturnType<typeof createObligationService>;

const baseInput = {
  consentProtocolScope: "Protocol P-17",
  approvedPurposes: ["peer-review", "research-assistance"],
  permittedCollaborators: [],
  externalProcessing: "blocked" as const,
  permittedProviders: ["openai"],
  residency: [],
  retentionExpiresAt: null,
  deletionDueAt: null,
  license: "DUA-Research-Only",
  owner: "Data steward",
  reviewDate: null,
  provenanceSource: "Signed data-use agreement",
  notes: "",
  actorId: "researcher-a",
};

beforeEach(() => {
  database = new DatabaseSync(":memory:");
  database.exec(`
    PRAGMA foreign_keys = ON;
    CREATE TABLE projects (id TEXT PRIMARY KEY, path TEXT, normalized_path TEXT);
    CREATE TABLE research_objects (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, type TEXT NOT NULL,
      title TEXT NOT NULL, payload TEXT NOT NULL DEFAULT '{}'
    );
    CREATE TABLE research_relationships (
      id TEXT PRIMARY KEY, project_id TEXT NOT NULL, from_object_id TEXT NOT NULL,
      to_object_id TEXT NOT NULL, type TEXT NOT NULL
    );
    INSERT INTO projects VALUES ('project-a', '/tmp', '/tmp');
    INSERT INTO research_objects VALUES
      ('dataset-a', 'project-a', 'source', 'Restricted cohort', '{"kind":"source"}'),
      ('claim-a', 'project-a', 'claim', 'Outcome claim', '{"kind":"claim"}');
    INSERT INTO research_relationships VALUES
      ('supports-a', 'project-a', 'dataset-a', 'claim-a', 'supports');
  `);
  database.exec(
    readFileSync(migrationPath, "utf8").replaceAll(
      "--> statement-breakpoint",
      "",
    ),
  );
  obligationService = createObligationService(database, {
    appendProvenance: (event) => event,
  });
  obligationService.saveObligation("project-a", "dataset-a", baseInput);
});

describe("obligation route enforcement", () => {
  it("blocks reviewer-capsule bytes, then allows the exact approved warning", async () => {
    const preview = vi.fn(() => ({
      html: "<!doctype html>",
      sha256: "a".repeat(64),
      manifest: { selectedClaimIds: ["claim-a"], included: [], omitted: [] },
    }));
    const app = new Hono();
    registerResearchRoutes(app, {
      getObligationService: () => obligationService,
      getReviewerCapsuleService: () => ({ preview, export: preview }),
    });
    const request = () =>
      app.request("/api/projects/project-a/reviewer-capsule/preview", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ claimIds: ["claim-a"] }),
      });

    const blocked = await request();
    expect(blocked.status).toBe(409);
    expect(preview).not.toHaveBeenCalled();

    obligationService.saveObligation("project-a", "dataset-a", {
      ...baseInput,
      externalProcessing: "review",
    });
    const operation = {
      kind: "export" as const,
      integration: "reviewer-capsule",
      objectIds: ["claim-a"],
      purpose: "peer-review",
      collaborators: [],
      provider: null,
      residency: null,
      license: null,
      external: true,
    };
    obligationService.approveOperation("project-a", operation, {
      actorId: "principal-investigator",
      rationale: "Reviewed the exact capsule audience and license terms.",
    });

    const allowed = await request();
    expect(allowed.status).toBe(200);
    expect(preview).toHaveBeenCalledTimes(1);
  });

  it("blocks provider transmission before invoking a provider", async () => {
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => database,
      getObligationService: () => obligationService,
      resolveProjectPath: () => "/tmp",
    });
    const response = await app.request("/api/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [],
        model: "gpt-test",
        projectId: "project-a",
        projectPath: "/tmp",
        provider: "openai",
      }),
    });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: "Provider transmission blocked by research-data obligations.",
      evaluation: {
        decision: "block",
        alerts: [expect.objectContaining({ category: "external-processing" })],
      },
    });
  });
});
