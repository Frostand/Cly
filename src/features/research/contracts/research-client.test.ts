import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { Attachment, AttachRequest, ResearchResult } from "./index";

describe("standalone research client contract", () => {
  it("represents every supported computational attachment", () => {
    const attachments: Attachment[] = [
      { kind: "code", uri: "file:///src/model.ts", revision: "abc1234" },
      {
        kind: "commit",
        repository: "https://example.test/repo",
        sha: "abc1234",
      },
      { kind: "notebook", uri: "file:///analysis.ipynb", cellIds: ["cell-1"] },
      { kind: "run", runId: "run-1", status: "completed" },
      { kind: "artifact", uri: "file:///figure.png", mediaType: "image/png" },
    ];
    expect(attachments.map((item) => item.kind)).toEqual([
      "code",
      "commit",
      "notebook",
      "run",
      "artifact",
    ]);
  });

  it("requires authorization and provenance for mutations", () => {
    const request: AttachRequest = {
      target: { projectId: "project-1", objectId: "claim-1" },
      attachment: { kind: "run", runId: "run-1", status: "failed" },
      authorization: {
        actorId: "user-1",
        client: "jupyter",
        capabilities: ["attachment:write"],
      },
      provenance: {
        occurredAt: "2026-07-12T00:00:00.000Z",
        operationId: "op-1",
        origin: { client: "jupyter" },
      },
    };
    expect(request.authorization.capabilities).toContain("attachment:write");
    expect(request.provenance.operationId).toBe("op-1");
  });

  it("makes failure and retry behavior discriminated", () => {
    const result: ResearchResult<never> = {
      ok: false,
      error: {
        code: "unavailable",
        message: "Local service is offline",
        retryable: true,
      },
    };
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.retryable).toBe(true);
  });

  it("imports no editor, Electron, React, or UI state", () => {
    const directory = dirname(fileURLToPath(import.meta.url));
    const sources = readdirSync(directory)
      .filter((name) => name.endsWith(".ts") && !name.endsWith(".test.ts"))
      .map((name) => readFileSync(join(directory, name), "utf8"))
      .join("\n");
    expect(sources).not.toMatch(
      /from\s+["'][^"']*(components\/ide|electron|react|zustand|features\/cly)/,
    );
  });
});
