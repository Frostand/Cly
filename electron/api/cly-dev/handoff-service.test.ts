// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  type ClyDevHandoffError,
  createClyDevHandoffService,
  createMemoryHandoffTransport,
} from "./handoff-service.js";

const source = () => ({
  workspace: {
    repository: { id: "repo-1", remoteUrl: "git@github.com:cly/repo.git" },
    worktree: { id: "wt-1", branch: "feature/resume", baseRef: "main" },
    machine: { id: "machine-a", platform: "darwin" },
    localOnly: {
      repositoryPath: "/Users/a/repo",
      worktreePath: "/Users/a/repo",
    },
  },
  task: {
    id: "task-1",
    title: "Resume safely",
    objective: "Continue without restating work",
    researchObjectIds: ["claim-1"],
  },
  session: {
    id: "session-1",
    title: "Cross-device task",
    provider: { id: "openai", model: "gpt-5" },
    commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    state: "resumable",
    createdAt: "2026-07-16T10:00:00.000Z",
    updatedAt: "2026-07-16T11:00:00.000Z",
  },
  context: {
    preview: {
      schemaVersion: 1,
      kind: "cly.context_manifest",
      manifest: {
        id: "manifest-1",
        schemaVersion: 1,
        summary: "Safe context",
        entries: [],
      },
      provenance: {
        repository: { id: "repo-1" },
        worktree: { id: "wt-1", branch: "feature/resume" },
        commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
        machine: { id: "machine-a", platform: "darwin" },
        provider: { id: "openai", model: "gpt-5" },
        research: { objectIds: ["claim-1"] },
      },
    },
  },
  events: [
    {
      id: "event-local",
      sequence: 1,
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: "local-1",
      type: "tool.recorded",
      transferability: "local-only",
      occurredAt: "2026-07-16T10:10:00.000Z",
      actor: { kind: "tool", id: "shell" },
      payload: { path: "/Users/a/repo/private.txt" },
      recordedAt: "2026-07-16T10:10:01.000Z",
    },
    {
      id: "event-transferable",
      sequence: 2,
      schemaVersion: 1,
      payloadVersion: 1,
      idempotencyKey: "message-1",
      type: "message.recorded",
      transferability: "transferable",
      occurredAt: "2026-07-16T10:20:00.000Z",
      actor: { kind: "user", id: "user-1" },
      payload: {
        messageId: "message-1",
        role: "user",
        content: "Continue the approved plan.",
      },
      recordedAt: "2026-07-16T10:20:01.000Z",
    },
  ],
});

const repository = {
  getHandoffSource: () => source(),
};

describe("Cly Dev handoff service", () => {
  it("publishes only transferable state with compare-and-swap revision", async () => {
    const transport = createMemoryHandoffTransport();
    const service = createClyDevHandoffService({ repository, transport });
    await service.pairDevice({ deviceId: "machine-a", pairingCode: "123456" });
    const published = await service.publish("project-1", "session-1", {
      deviceId: "machine-a",
      expectedRevision: 0,
    });

    expect(published.revision).toBe(1);
    expect(published.events).toHaveLength(1);
    expect(published.events[0]).toMatchObject({ id: "event-transferable" });
    const serialized = JSON.stringify(published);
    for (const prohibited of [
      "localOnly",
      "repositoryPath",
      "worktreePath",
      "uncommittedFilePaths",
      "/Users/a/repo",
    ]) {
      expect(serialized).not.toContain(prohibited);
    }
  });

  it("reports concurrent publication instead of overwriting", async () => {
    const transport = createMemoryHandoffTransport();
    const service = createClyDevHandoffService({ repository, transport });
    await service.pairDevice({ deviceId: "machine-a", pairingCode: "123456" });
    await service.publish("project-1", "session-1", {
      deviceId: "machine-a",
      expectedRevision: 0,
    });
    await expect(
      service.publish("project-1", "session-1", {
        deviceId: "machine-a",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code: "handoff-conflict" });
  });

  it.each([
    ["offline", { online: false }, "transport-offline"],
    [
      "authentication",
      { authenticated: false },
      "provider-authentication-failed",
    ],
  ])("fails closed for %s transport", async (_name, options, code) => {
    const service = createClyDevHandoffService({
      repository,
      transport: createMemoryHandoffTransport(options),
    });
    await expect(
      service.publish("project-1", "session-1", {
        deviceId: "machine-a",
        expectedRevision: 0,
      }),
    ).rejects.toMatchObject({ code });
  });

  it("fails closed for a revoked device", async () => {
    const transport = createMemoryHandoffTransport();
    const service = createClyDevHandoffService({ repository, transport });
    await service.pairDevice({ deviceId: "machine-a", pairingCode: "123456" });
    transport.revokeDevice("machine-a");
    await expect(
      service.publish("project-1", "session-1", {
        deviceId: "machine-a",
        expectedRevision: 0,
      }),
    ).rejects.toEqual(
      expect.objectContaining<ClyDevHandoffError>({ code: "device-revoked" }),
    );
  });
});
