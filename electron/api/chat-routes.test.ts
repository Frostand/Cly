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
      projectId: "project-a",
      projectPath: "/tmp",
      provider: "openai",
      ...body,
    }),
    headers: { "content-type": "application/json" },
    method: "POST",
  });

const resolveProjectPath = ({ projectId }: { projectId?: string }) =>
  projectId === "project-a" ? "/tmp" : projectId === "project-b" ? "/" : null;

const createApp = (safeEvaluateOperation: ReturnType<typeof vi.fn>) => {
  const app = new Hono();
  registerChatRoutes(app, {
    getDatabase: () => database,
    getObligationService: () => ({ safeEvaluateOperation }),
    resolveProjectPath,
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

    expect(response.status).toBe(404);
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

  it("rejects legacy path-only requests", async () => {
    const safeEvaluateOperation = vi.fn(() => ({
      alerts: [],
      decision: "block",
    }));
    const response = await createApp(safeEvaluateOperation).request(
      createChatRequest({ projectId: undefined }),
    );

    expect(response.status).toBe(400);
    expect(safeEvaluateOperation).not.toHaveBeenCalled();
  });

  it("rejects absolute, traversal, missing, and mismatched project references", async () => {
    const openai = vi.fn(() => new Response("must-not-run"));
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => database,
      getObligationService: () => ({
        safeEvaluateOperation: vi.fn(() => ({ alerts: [], decision: "allow" })),
      }),
      resolveProjectPath,
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

    for (const reference of [
      { kind: "file", path: "/etc/passwd" },
      { kind: "file", path: "../etc/passwd" },
      { kind: "file", path: "cly-reference-that-does-not-exist" },
      { kind: "folder", path: "package.json" },
    ]) {
      const response = await app.request(
        createChatRequest({ projectReferences: [reference] }),
      );
      expect(response.status).toBe(400);
    }
    expect(openai).not.toHaveBeenCalled();
  });

  it("loads only a persisted byte-identical managed manifest and rejects renderer broadening", async () => {
    const canonicalPayload =
      '{"destination":{"model":"test-model","provider":"openai"},"entries":[],"schemaVersion":1}';
    const loadManifestForEgress = vi.fn(() => ({ canonicalPayload }));
    const openai = vi.fn(() => new Response("managed-response"));
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => database,
      getObligationService: () => ({ safeEvaluateOperation: vi.fn() }),
      getContextRepository: () => ({ loadManifestForEgress }),
      resolveProjectPath,
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
    const managedContext = {
      manifestId: "manifest-1",
      sha256: "a".repeat(64),
      configurationId: "configuration-1",
      roleId: "researcher",
    };
    const response = await app.request(
      createChatRequest({ projectId: "project-a", managedContext }),
    );
    expect(response.status).toBe(200);
    expect(loadManifestForEgress).toHaveBeenCalledWith(
      "project-a",
      "manifest-1",
      {
        sha256: "a".repeat(64),
        provider: "openai",
        model: "test-model",
        configurationId: "configuration-1",
        roleId: "researcher",
      },
    );
    expect(openai).toHaveBeenCalledWith(
      expect.objectContaining({ projectReferencesPrompt: canonicalPayload }),
    );

    const broadened = await app.request(
      createChatRequest({
        projectId: "project-a",
        managedContext,
        projectReferences: [{ kind: "file", path: "/tmp/broader.txt" }],
      }),
    );
    expect(broadened.status).toBe(400);
    expect(openai).toHaveBeenCalledTimes(1);
  });

  it("fails closed when a managed manifest binding is mismatched", async () => {
    const loadManifestForEgress = vi.fn(() => {
      throw new Error("Persisted context manifest egress binding mismatch.");
    });
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => database,
      getObligationService: () => ({ safeEvaluateOperation: vi.fn() }),
      getContextRepository: () => ({ loadManifestForEgress }),
      resolveProjectPath,
    });
    const response = await app.request(
      createChatRequest({
        projectId: "project-a",
        managedContext: {
          manifestId: "manifest-1",
          sha256: "b".repeat(64),
          configurationId: "configuration-1",
          roleId: "researcher",
        },
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({
      error: "Persisted context manifest egress binding mismatch.",
    });
  });

  it.each([
    "Persisted context manifest cannot leave a local-only project.",
    "Persisted context manifest references context that is now deleted.",
  ])("never calls the provider after managed-context revocation: %s", async (message) => {
    const openai = vi.fn(() => new Response("must-not-run"));
    const app = new Hono();
    registerChatRoutes(app, {
      getDatabase: () => database,
      getObligationService: () => ({ safeEvaluateOperation: vi.fn() }),
      getContextRepository: () => ({
        loadManifestForEgress: vi.fn(() => {
          throw new Error(message);
        }),
      }),
      resolveProjectPath,
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
    const response = await app.request(
      createChatRequest({
        projectId: "project-a",
        managedContext: {
          manifestId: "manifest-1",
          sha256: "c".repeat(64),
          configurationId: "configuration-1",
          roleId: "researcher",
        },
      }),
    );
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: message });
    expect(openai).not.toHaveBeenCalled();
  });
});
