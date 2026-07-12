// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it, vi } from "vitest";

// The local service is also used by Electron, but this smoke suite exercises
// its HTTP contract in a standalone Node process.
vi.mock("electron", () => ({
  app: { getPath: () => tmpdir() },
}));

import { API_SESSION_TOKEN_HEADER, startApiServer } from "./api/app.js";
import {
  closePersistedStateDatabase,
  getStateDatabase,
} from "./persisted-state.js";

const apiToken = "local-service-smoke-token";
let temporaryDirectory: string | undefined;
let previousDatabasePath: string | undefined;

async function request(port: number, pathname: string, init: RequestInit = {}) {
  return fetch(`http://127.0.0.1:${port}${pathname}`, {
    ...init,
    headers: {
      [API_SESSION_TOKEN_HEADER]: apiToken,
      "content-type": "application/json",
      ...init.headers,
    },
  });
}

afterEach(async () => {
  closePersistedStateDatabase();
  if (previousDatabasePath === undefined) {
    delete process.env.DREAM_DB_PATH;
  } else {
    process.env.DREAM_DB_PATH = previousDatabasePath;
  }
  previousDatabasePath = undefined;
  if (temporaryDirectory) {
    await rm(temporaryDirectory, { force: true, recursive: true });
    temporaryDirectory = undefined;
  }
});

describe("local service smoke suite", () => {
  it("migrates local storage and preserves a research provenance flow across a restart", async () => {
    temporaryDirectory = await mkdtemp(path.join(tmpdir(), "cly-smoke-"));
    const databasePath = path.join(temporaryDirectory, "cly.db");
    previousDatabasePath = process.env.DREAM_DB_PATH;
    process.env.DREAM_DB_PATH = databasePath;

    // Seed the pre-relational store; opening it must retain the workspace while
    // applying the bundled relational migrations.
    const legacyDatabase = new DatabaseSync(databasePath);
    legacyDatabase.exec(
      "CREATE TABLE app_state (key TEXT PRIMARY KEY, value TEXT NOT NULL)",
    );
    legacyDatabase
      .prepare("INSERT INTO app_state (key, value) VALUES (?, ?)")
      .run(
        "ide-state",
        JSON.stringify({
          chats: [
            {
              id: "legacy-chat",
              projectId: "research-project",
              title: "Migrated research chat",
            },
          ],
          projects: [
            {
              id: "research-project",
              name: "research-project",
              path: "/tmp/research-project",
            },
          ],
        }),
      );
    legacyDatabase.close();

    const database = getStateDatabase();
    expect(
      database
        .prepare("SELECT id FROM projects WHERE id = ?")
        .get("research-project"),
    ).toEqual({ id: "research-project" });
    expect(
      database
        .prepare(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'provenance_events'",
        )
        .get(),
    ).toEqual({ name: "provenance_events" });

    const service = await startApiServer({ apiToken, port: 0 });
    const source = await request(
      service.port,
      "/api/projects/research-project/research/objects",
      {
        body: JSON.stringify({
          type: "source",
          title: "Local source",
          payload: { kind: "source", url: "https://example.test/source" },
        }),
        method: "POST",
      },
    );
    expect(source.status).toBe(201);
    const sourceObject = await source.json();

    const claim = await request(
      service.port,
      "/api/projects/research-project/research/objects",
      {
        body: JSON.stringify({
          type: "claim",
          title: "The local service persists evidence",
          payload: { kind: "claim", status: "supported" },
        }),
        method: "POST",
      },
    );
    expect(claim.status).toBe(201);
    const claimObject = await claim.json();

    const relationship = await request(
      service.port,
      "/api/projects/research-project/research/relationships",
      {
        body: JSON.stringify({
          fromObjectId: sourceObject.id,
          toObjectId: claimObject.id,
          type: "supports",
        }),
        method: "POST",
      },
    );
    expect(relationship.status).toBe(201);
    await service.close();

    const restartedService = await startApiServer({ apiToken, port: 0 });
    const research = await request(
      restartedService.port,
      "/api/projects/research-project/research",
    );
    expect(research.status).toBe(200);
    await expect(research.json()).resolves.toMatchObject({
      objects: expect.arrayContaining([
        expect.objectContaining({ id: sourceObject.id }),
        expect.objectContaining({ id: claimObject.id }),
      ]),
      relationships: [
        expect.objectContaining({
          fromObjectId: sourceObject.id,
          toObjectId: claimObject.id,
          type: "supports",
        }),
      ],
    });
    expect(
      database.prepare("SELECT COUNT(*) AS count FROM provenance_events").get(),
    ).toEqual({ count: 3 });
    await restartedService.close();
  });
});
