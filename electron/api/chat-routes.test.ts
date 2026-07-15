// @vitest-environment node
import { DatabaseSync } from "node:sqlite";
import { Hono } from "hono";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerChatRoutes } from "./chat-routes.js";

let database: DatabaseSync;

const createChatRequest = (body: Record<string, unknown>) =>
  new Request("http://127.0.0.1/api/chat", {
    body: JSON.stringify({
      messages: [],
      model: "test-model",
      projectPath: "/tmp",
      provider: "openai",
      ...body,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const createApp = (safeEvaluateOperation: ReturnType<typeof vi.fn>) => {
  const app = new Hono();
  registerChatRoutes(app, {
    getDatabase: () => database,
    getObligationService: () => ({ safeEvaluateOperation }),
    resolveProjectPath: () => null,
  });
  return app;
};

describe("chat project authority", () => {
  beforeEach(() => {
    database = new DatabaseSync(":memory:");
    database.exec(`
      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        path TEXT NOT NULL,
        normalized_path TEXT NOT NULL
      );
      INSERT INTO projects (id, path, normalized_path)
      VALUES
        ('project-a', '/tmp', '/tmp'),
        ('project-b', '/', '/');
    `);
  });

  afterEach(() => {
    database.close();
  });

  it("rejects an unknown project id instead of authorizing its submitted path", async () => {
    const safeEvaluateOperation = vi.fn();
    const response = await createApp(safeEvaluateOperation).request(
      createChatRequest({ projectId: "missing-project" }),
    );

    expect(response.status).toBe(409);
    expect(safeEvaluateOperation).not.toHaveBeenCalled();
  });

  it("rejects a project id that does not own the resolved path", async () => {
    const safeEvaluateOperation = vi.fn();
    const response = await createApp(safeEvaluateOperation).request(
      createChatRequest({ projectId: "project-b" }),
    );

    expect(response.status).toBe(409);
    expect(safeEvaluateOperation).not.toHaveBeenCalled();
  });

  it("binds legacy path-only requests to the matching persisted project", async () => {
    const safeEvaluateOperation = vi.fn(() => ({
      alerts: [],
      decision: "block",
    }));
    const response = await createApp(safeEvaluateOperation).request(
      createChatRequest({}),
    );

    expect(response.status).toBe(409);
    expect(safeEvaluateOperation).toHaveBeenCalledWith(
      "project-a",
      expect.objectContaining({ kind: "provider-transmission" }),
    );
  });
});
