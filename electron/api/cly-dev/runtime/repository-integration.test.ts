// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../../persisted-state.js";
import { createClyDevSessionRepository } from "../session-repository.js";
import { createApprovalGate } from "./approval-gate.js";
import {
  createClyDevExecutionRuntime,
  deriveTransferableContextSummary,
} from "./execution-runtime.js";
import { createDeterministicMockProvider } from "./mock-provider.js";

const NOW = "2026-07-16T12:00:00.000Z";

afterEach(() => closePersistedStateDatabase());

describe("Cly Dev runtime with the durable session repository", () => {
  it("records and sends only the normalized provider envelope", async () => {
    const databasePath = path.join(
      mkdtempSync(path.join(tmpdir(), "cly-dev-runtime-integration-")),
      "state.sqlite",
    );
    const database = getStateDatabase(databasePath);
    database
      .prepare(
        `INSERT INTO projects
          (id, path, normalized_path, name, status, sort_order, metadata, created_at, updated_at)
         VALUES (?, ?, ?, ?, 'open', 0, '{}', ?, ?)`,
      )
      .run(
        "project-1",
        "/tmp/project-1",
        "/tmp/project-1",
        "Project 1",
        NOW,
        NOW,
      );
    const repository = createClyDevSessionRepository({
      db: database,
      now: () => NOW,
    });
    const { session } = repository.createSessionAggregate("project-1", {
      workspace: {
        schemaVersion: 1,
        idempotencyKey: "workspace-key",
        id: "workspace-1",
        name: "Main worktree",
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch: "main" },
        machine: { id: "machine-1", platform: "darwin" },
        localOnly: {
          repositoryPath: "/tmp/project-1",
          worktreePath: "/tmp/project-1",
        },
      },
      contextManifest: {
        schemaVersion: 1,
        idempotencyKey: "manifest-key",
        id: "manifest-1",
        localOnly: {
          absolutePaths: ["/tmp/project-1"],
          environmentVariableNames: ["PRIVATE_TOKEN"],
          notes: ["local only"],
          uncommittedFilePaths: [],
        },
        transferable: {
          summary: "Arbitrary persisted source summary",
          entries: [
            { kind: "note", title: "file:///Users/alice/private.txt" },
            { kind: "note", title: "glpat-1234567890abcdef" },
            { kind: "note", title: "hf_1234567890abcdef" },
            { kind: "note", title: "ya29.a0AfH6SMBprivate" },
            { kind: "commit", commitSha: "a".repeat(40) },
          ],
        },
      },
      task: {
        schemaVersion: 1,
        idempotencyKey: "task-key",
        id: "task-1",
        title: "Runtime integration",
        objective: "Normalize provider context",
        researchObjectIds: [],
      },
      session: {
        schemaVersion: 1,
        idempotencyKey: "session-key",
        id: "session-1",
        title: "Runtime integration",
        provider: { id: "deterministic-mock", model: "mock-model" },
        commit: { sha: "a".repeat(40) },
        state: "running",
      },
    });
    let providerRequest: Record<string, unknown> | undefined;
    const runtime = createClyDevExecutionRuntime({
      repository,
      provider: createDeterministicMockProvider((received) => {
        providerRequest = received;
        return [{ type: "completed" }];
      }),
      approvalGate: createApprovalGate({ projectPolicy: { default: "deny" } }),
      executeTool: vi.fn(),
      durableToolEffects: {
        executeOnce: vi.fn(() => {
          throw new Error("No tool effect was expected.");
        }),
      },
      now: () => NOW,
    });

    await expect(
      runtime.execute({
        schemaVersion: 1,
        payloadVersion: 1,
        projectId: "project-1",
        sessionId: session.id,
        requestId: "request-1",
        prompt: "Normalize context",
        model: "mock-model",
      }),
    ).resolves.toMatchObject({ status: "completed" });

    const expectedEntries = [{ kind: "commit", commitSha: "a".repeat(40) }];
    const expectedEnvelope = {
      schemaVersion: 1,
      kind: "cly.context_manifest",
      manifest: {
        id: "manifest-1",
        schemaVersion: 1,
        summary: deriveTransferableContextSummary(expectedEntries),
        entries: expectedEntries,
      },
      provenance: {
        repository: { id: "repo-1" },
        worktree: { id: "worktree-1", branch: "main" },
        commit: { sha: "a".repeat(40) },
        machine: { id: "machine-1", platform: "darwin" },
        provider: { id: "deterministic-mock", model: "mock-model" },
        research: { objectIds: [] },
      },
    };
    const expectedBytes = JSON.stringify(expectedEnvelope);
    const expectedHash = createHash("sha256")
      .update(expectedBytes)
      .digest("hex");
    expect(providerRequest).toMatchObject({
      context: expectedEnvelope,
      contextBytes: expectedBytes,
      contextHash: expectedHash,
    });
    const contextEvent = repository
      .listEvents("project-1", session.id, 0, 100)
      .find((event) => event.type === "context.manifest.recorded");
    expect(contextEvent).toMatchObject({
      outboundEnvelope: expectedEnvelope,
      outboundSha256: expectedHash,
    });
  });
});
