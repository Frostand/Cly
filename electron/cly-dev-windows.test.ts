import { describe, expect, it } from "vitest";
import {
  authorizeClyDevSession,
  clampWindowBounds,
  createClyDevWorkspaceCore,
} from "./cly-dev-windows.js";

describe("Cly Dev IPC session ownership", () => {
  it("allows agent windows to address sessions and confines workspaces to their binding", () => {
    expect(
      authorizeClyDevSession({ role: "agent", sessionId: null }, "session-2"),
    ).toBe("session-2");
    expect(
      authorizeClyDevSession(
        { role: "workspace", sessionId: "session-1" },
        "session-1",
      ),
    ).toBe("session-1");
    expect(
      authorizeClyDevSession(
        { role: "workspace", sessionId: "session-1" },
        "session-2",
      ),
    ).toBeNull();
    expect(
      authorizeClyDevSession(
        { role: "workspace", sessionId: "session-1" },
        "session-1",
        { agentOnly: true },
      ),
    ).toBeNull();
  });
});

describe("Cly Dev workspace Core", () => {
  it("accepts an intent once and returns the same snapshot for a duplicate", () => {
    const core = createClyDevWorkspaceCore();
    const first = core.dispatchIntent("agent", {
      mutationId: "select-1",
      sessionId: "session-1",
      baseRevision: 0,
      type: "select_file",
      payload: { selectedFileId: "src/app.tsx" },
    });
    const duplicate = core.dispatchIntent("workspace", {
      mutationId: "select-1",
      sessionId: "session-1",
      baseRevision: 0,
      type: "select_file",
      payload: { selectedFileId: "src/app.tsx" },
    });

    expect(first).toMatchObject({
      accepted: true,
      duplicate: false,
      snapshot: { revision: 1, selectedFileId: "src/app.tsx" },
    });
    expect(duplicate).toEqual({ ...first, duplicate: true });
  });

  it("rejects stale mutations with the current snapshot", () => {
    const core = createClyDevWorkspaceCore();
    core.dispatchIntent("agent", {
      mutationId: "select-1",
      sessionId: "session-1",
      baseRevision: 0,
      type: "select_diff",
      payload: { selectedDiffId: "src/first.ts" },
    });

    expect(
      core.dispatchIntent("workspace", {
        mutationId: "select-2",
        sessionId: "session-1",
        baseRevision: 0,
        type: "select_diff",
        payload: { selectedDiffId: "src/stale.ts" },
      }),
    ).toMatchObject({
      accepted: false,
      reason: "stale-revision",
      snapshot: { revision: 1, selectedDiffId: "src/first.ts" },
    });
  });

  it("keeps approval authority in the agent window", () => {
    const core = createClyDevWorkspaceCore();
    expect(
      core.dispatchIntent("workspace", {
        mutationId: "approval-1",
        sessionId: "session-1",
        baseRevision: 0,
        type: "resolve_approval",
        payload: { approvalId: "approval-a", state: "approved" },
      }),
    ).toMatchObject({ accepted: false, reason: "agent-window-required" });
  });
});

describe("Cly Dev window layout", () => {
  it("clamps missing-display bounds into the primary work area", () => {
    expect(
      clampWindowBounds(
        { x: 5000, y: -900, width: 900, height: 700 },
        [{ id: 1, workArea: { x: 0, y: 0, width: 1440, height: 900 } }],
        999,
        { width: 640, height: 480 },
      ),
    ).toEqual({ x: 540, y: 0, width: 900, height: 700, displayId: 1 });
  });
});
