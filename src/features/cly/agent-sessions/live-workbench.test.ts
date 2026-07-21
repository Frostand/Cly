import { describe, expect, it } from "vitest";
import { eventProcessLines } from "./live-workbench-output";
import type { ClyDevSessionEvent } from "./types";

const processEvent = (payload: Record<string, unknown>) =>
  ({
    id: "event-process-1",
    projectId: "project-1",
    sessionId: "session-1",
    sequence: 1,
    recordedAt: "2026-07-21T12:00:00.000Z",
    schemaVersion: 1,
    payloadVersion: 1,
    idempotencyKey: "provider:run-command:process",
    type: "process.recorded",
    transferability: "local-only",
    occurredAt: "2026-07-21T12:00:00.000Z",
    actor: { kind: "tool", id: "cly-dev-tool-runtime" },
    payload,
    provenance: {
      repository: { id: "repo-1" },
      worktree: { id: "worktree-1", branch: "main" },
      commit: { sha: "a".repeat(40) },
      machine: { id: "machine-1", platform: "darwin" },
      provider: { id: "anthropic-claude", model: "claude-sonnet-4-6" },
      research: { objectIds: [] },
    },
    outboundEnvelope: null,
    outboundSha256: null,
  }) as ClyDevSessionEvent;

describe("live Cly Dev workbench command output", () => {
  it("renders durable provider command stdout, stderr, and exit status", () => {
    expect(
      eventProcessLines([
        processEvent({
          command: "pnpm test:unit",
          stdout: "Tests 2 passed",
          stderr: "warning: experimental",
          status: "completed",
          exitCode: 0,
        }),
      ]),
    ).toEqual([
      "$ pnpm test:unit",
      "Tests 2 passed",
      "warning: experimental",
      "[completed; exit 0]",
    ]);
  });
});
