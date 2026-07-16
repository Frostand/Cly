// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { Hono } from "hono";
import { afterEach, describe, expect, it } from "vitest";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "../../persisted-state.js";
import { createResearchRepository } from "../research/repository.js";
import { createAgentConfigurationRepository } from "./configuration-repository.js";
import { registerAgentConfigurationRoutes } from "./configuration-routes.js";

const directories: string[] = [];

const budget = {
  maxInputTokens: 1_000,
  maxOutputTokens: 500,
  maxCostMinorUnits: 250,
  maxRuntimeMs: 60_000,
};

const configurationInput = {
  name: "Research delivery team",
  maxParallel: 3,
  maxTotalBudget: {
    maxInputTokens: 10_000,
    maxOutputTokens: 4_000,
    maxCostMinorUnits: 2_000,
    maxRuntimeMs: 300_000,
  },
  partialFailurePolicy: "continue" as const,
  roles: [
    {
      id: "implementation",
      role: "implementation" as const,
      instanceCount: 2,
      maxParallel: 2,
      provider: "openai",
      model: "gpt-5",
      reasoningLevel: "high" as const,
      budget,
      allowedTools: ["readFile", "writeFile"],
      allowedContextSources: ["project", "context-pack:core"],
      allowedFileGlobs: ["src/**", "electron/**"],
      permissions: {
        canReadFiles: true,
        canWriteFiles: true,
        canRunCommands: true,
        canAccessNetwork: false,
        requiresApprovalForWrite: true,
        requiresApprovalForNetwork: true,
      },
      approvalCheckpoints: ["write", "network"],
      fallbackModel: "gpt-5-mini",
    },
    {
      id: "review",
      role: "review" as const,
      instanceCount: 1,
      maxParallel: 1,
      provider: "anthropic",
      model: "claude-sonnet",
      reasoningLevel: "medium" as const,
      budget: { ...budget, maxCostMinorUnits: 400 },
      allowedTools: ["readFile"],
      allowedContextSources: ["project"],
      allowedFileGlobs: ["**/*"],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canRunCommands: false,
        canAccessNetwork: false,
        requiresApprovalForWrite: true,
        requiresApprovalForNetwork: true,
      },
      approvalCheckpoints: ["final-review"],
    },
  ],
};

function databasePath() {
  const directory = mkdtempSync(path.join(tmpdir(), "cly-agent-config-"));
  directories.push(directory);
  return path.join(directory, "cly.db");
}

function setup() {
  const db = getStateDatabase(databasePath());
  const research = createResearchRepository(db, {
    clock: () => "2026-07-15T12:00:00.000Z",
    createId: (() => {
      let sequence = 0;
      return () => `research-${++sequence}`;
    })(),
  });
  for (const projectId of ["project-1", "project-2"]) {
    research.upsertProject({
      id: projectId,
      name: projectId,
      path: `/tmp/${projectId}`,
    });
  }
  let sequence = 0;
  const repository = createAgentConfigurationRepository({
    db,
    clock: () => "2026-07-15T12:30:00.000Z",
    createId: () => `configuration-${++sequence}`,
  });
  return { db, repository };
}

afterEach(() => {
  closePersistedStateDatabase();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { force: true, recursive: true });
  }
});

describe("agent configuration repository", () => {
  it("round-trips every field and isolates list/get by project", () => {
    const { repository } = setup();
    const created = repository.create("project-1", configurationInput);

    expect(created).toEqual({
      id: "configuration-1",
      projectId: "project-1",
      ...configurationInput,
      revision: 1,
      createdAt: "2026-07-15T12:30:00.000Z",
      updatedAt: "2026-07-15T12:30:00.000Z",
    });
    expect(repository.list("project-1")).toEqual([created]);
    expect(repository.get("project-1", created.id)).toEqual(created);
    expect(repository.list("project-2")).toEqual([]);
    expect(repository.get("project-2", created.id)).toBeNull();
  });

  it("updates and removes only with the expected monotonic revision", () => {
    const { repository } = setup();
    const created = repository.create("project-1", configurationInput);
    const updated = repository.update("project-1", created.id, 1, {
      ...configurationInput,
      name: "Research delivery team v2",
      partialFailurePolicy: "cancel_remaining",
    });

    expect(updated).toMatchObject({
      id: created.id,
      name: "Research delivery team v2",
      partialFailurePolicy: "cancel_remaining",
      revision: 2,
    });
    expect(() =>
      repository.update("project-1", created.id, 1, configurationInput),
    ).toThrow(/revision conflict/i);
    expect(() => repository.remove("project-2", created.id, 2)).toThrow(
      /revision conflict/i,
    );
    expect(repository.remove("project-1", created.id, 2)).toEqual({
      id: created.id,
      revision: 2,
    });
    expect(repository.get("project-1", created.id)).toBeNull();
  });

  it("rejects invalid role counts before opening a transaction", () => {
    const { db, repository } = setup();
    const begin = db.exec.bind(db);
    let began = false;
    db.exec = ((sql: string) => {
      if (sql.includes("BEGIN")) began = true;
      return begin(sql);
    }) as typeof db.exec;

    expect(() =>
      repository.create("project-1", {
        ...configurationInput,
        roles: [{ ...configurationInput.roles[0], instanceCount: 0 }],
      }),
    ).toThrow(/instanceCount/i);
    expect(began).toBe(false);
  });

  it("rejects invalid expected revisions before opening a transaction", () => {
    const { db, repository } = setup();
    const begin = db.exec.bind(db);
    let began = false;
    db.exec = ((sql: string) => {
      if (sql.includes("BEGIN")) began = true;
      return begin(sql);
    }) as typeof db.exec;

    expect(() => repository.remove("project-1", "configuration-1", 0)).toThrow(
      /expectedRevision/i,
    );
    expect(began).toBe(false);
  });

  it("rejects role parallelism above its instance count", () => {
    const { repository } = setup();
    expect(() =>
      repository.create("project-1", {
        ...configurationInput,
        roles: [
          {
            ...configurationInput.roles[0],
            instanceCount: 1,
            maxParallel: 2,
          },
        ],
      }),
    ).toThrow(/maxParallel.*instanceCount/i);
  });

  it("rejects aggregate role parallelism above the global maximum", () => {
    const { repository } = setup();
    expect(() =>
      repository.create("project-1", {
        ...configurationInput,
        maxParallel: 2,
      }),
    ).toThrow(/aggregate.*maxParallel/i);
  });

  it("serves project-scoped CRUD, estimates, and revision conflicts", async () => {
    const { repository } = setup();
    const app = new Hono();
    registerAgentConfigurationRoutes(app, { getRepository: () => repository });
    const base = "/api/projects/project-1/agent-configurations";

    const createResponse = await app.request(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(configurationInput),
    });
    expect(createResponse.status).toBe(201);
    const created = await createResponse.json();

    const listResponse = await app.request(base);
    expect(await listResponse.json()).toEqual([created]);

    const estimateResponse = await app.request(
      `${base}/${created.id}/estimate`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          availableContextSources: ["project"],
          availableTools: ["readFile"],
        }),
      },
    );
    expect(await estimateResponse.json()).toMatchObject({
      inputTokens: 3_000,
      outputTokens: 1_500,
      costMinorUnits: 900,
      inaccessibleContext: ["context-pack:core"],
      inaccessibleTools: ["writeFile"],
      reasons: expect.arrayContaining([
        expect.stringMatching(/writeFile/),
        expect.stringMatching(/context-pack:core/),
      ]),
    });

    const conflictResponse = await app.request(`${base}/${created.id}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...configurationInput, expectedRevision: 99 }),
    });
    expect(conflictResponse.status).toBe(409);
    expect(await repository.get("project-1", created.id)).toEqual(created);
  });
});
