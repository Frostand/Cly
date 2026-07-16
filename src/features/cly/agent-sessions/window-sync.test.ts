import { describe, expect, it } from "vitest";
import { createAgentSessionFixtures } from "./fixtures";
import {
  applyWorkspaceSnapshot,
  deriveWorkspaceSnapshotFields,
} from "./window-sync";

describe("workspace window synchronization", () => {
  it("derives selection without copying the renderer store", () => {
    const session = createAgentSessionFixtures()[0];
    expect(deriveWorkspaceSnapshotFields(session)).toMatchObject({
      activeWorkbenchTabId: session.activeWorkbenchTabId,
      selectedDiffId: expect.any(String),
      selectedFileId: expect.any(String),
      workspaceMode: "inline",
    });
  });

  it("applies a revised snapshot without disturbing conversation state", () => {
    const session = createAgentSessionFixtures()[0];
    const next = applyWorkspaceSnapshot(session, {
      sessionId: session.id,
      revision: 4,
      selectedFileId: "src/new-live-file.ts",
      selectedDiffId: "src/new-diff.ts",
      pendingApprovalIds: [],
      workspaceMode: "detached",
      activeWorkbenchTabId: "diff-main",
    });

    expect(next.messages).toBe(session.messages);
    expect(next.workspaceMode).toBe("detached-workspace");
    expect(next.activeWorkbenchTabId).toBe("diff-main");
    expect(deriveWorkspaceSnapshotFields(next)).toMatchObject({
      selectedFileId: "src/new-live-file.ts",
      selectedDiffId: "src/new-diff.ts",
    });
  });

  it.each([
    "agent-only",
    "external-editor",
  ] as const)("preserves renderer-owned %s mode when Core reports its default inline state", (workspaceMode) => {
    const session = {
      ...createAgentSessionFixtures()[0],
      workspaceMode,
    };

    const next = applyWorkspaceSnapshot(session, {
      sessionId: session.id,
      revision: 1,
      selectedFileId: null,
      selectedDiffId: null,
      pendingApprovalIds: [],
      workspaceMode: "inline",
      activeWorkbenchTabId: null,
    });

    expect(next.workspaceMode).toBe(workspaceMode);
  });

  it("applies a genuine Core reattach transition to a detached session", () => {
    const session = {
      ...createAgentSessionFixtures()[0],
      workspaceMode: "detached-workspace" as const,
    };

    const next = applyWorkspaceSnapshot(session, {
      sessionId: session.id,
      revision: 2,
      selectedFileId: null,
      selectedDiffId: null,
      pendingApprovalIds: [],
      workspaceMode: "inline",
      activeWorkbenchTabId: null,
    });

    expect(next.workspaceMode).toBe("inline-workspace");
  });

  it("does not revive a prior detached snapshot over a renderer-owned mode", () => {
    const session = {
      ...createAgentSessionFixtures()[0],
      workspaceMode: "agent-only" as const,
    };

    const next = applyWorkspaceSnapshot(session, {
      sessionId: session.id,
      revision: 3,
      selectedFileId: null,
      selectedDiffId: null,
      pendingApprovalIds: [],
      workspaceMode: "detached",
      activeWorkbenchTabId: null,
    });

    expect(next.workspaceMode).toBe("agent-only");
  });
});
