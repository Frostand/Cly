// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ResumeTaskDialog } from "./resume-task-dialog";

const envelope = {
  protocol: "cly.dev.handoff" as const,
  schemaVersion: 1 as const,
  minimumReaderVersion: 1 as const,
  exportedAt: "2026-07-16T12:00:00.000Z",
  payload: {
    task: {
      id: "task-a",
      title: "Resume evidence audit",
      sessionId: "session-a",
      state: "resumable",
    },
    conversationSync: "excluded" as const,
    messages: [],
    summaries: [
      {
        id: "summary-a",
        title: "Progress",
        sections: ["Reviewed sources"],
        createdAt: "2026-07-16T12:00:00.000Z",
      },
    ],
    goal: { objective: "Continue safely", successCriteria: [] },
    plan: { steps: [{ id: "review", text: "Review", status: "pending" }] },
    progress: { status: "in_progress", completedItems: [] },
    remainingWork: [],
    contextManifest: {
      id: "context-a",
      summary: "Approved context",
      entries: [],
    },
    repository: {
      id: "repo-a",
      remoteUrl: "https://github.com/cly/repo",
      branch: "feature/resume",
      worktreeId: "worktree-a",
      commitSha: "a".repeat(40),
      files: [],
      symbols: [],
    },
    approvals: [],
    permissions: {
      evidenceOnly: true as const,
      filesystem: "workspace-write",
      network: "restricted",
      commands: ["*"],
    },
    constraints: [],
    diffs: [],
    tests: [],
    failures: [],
    costs: { currency: "USD", totalMinor: 0, items: [] },
    research: { objects: [], impact: [] },
    providerRequirements: { required: true, capabilities: ["streaming"] },
  },
  integrity: {
    algorithm: "sha256" as const,
    canonicalization: "cly-json-v1" as const,
    digest: "b".repeat(64),
  },
};

const staleInspection = {
  compatible: true,
  stale: [
    {
      code: "repository_branch_changed",
      message: "Branch diverges from the handoff.",
      recoveryAction: "Review Git state and re-run tests.",
    },
  ],
  conflicts: [],
  explanations: [
    {
      code: "repository_branch_changed",
      message: "Branch diverges from the handoff.",
      recoveryAction: "Review Git state and re-run tests.",
    },
  ],
  envelope,
  payload: envelope.payload,
  authority: {
    source: "target-project" as const,
    permissions: {},
    authorizedApprovalIds: [],
  },
};

function api(patch: Record<string, unknown> = {}) {
  return {
    fetchReceivedClyDevHandoffs: vi.fn().mockResolvedValue([]),
    inspectClyDevHandoff: vi.fn().mockResolvedValue(staleInspection),
    resumeClyDevHandoff: vi.fn(),
    ...patch,
  };
}

describe("ResumeTaskDialog", () => {
  it("loads an encrypted handoff and requires stale state review", async () => {
    const client = api({
      fetchReceivedClyDevHandoffs: vi.fn().mockResolvedValue([
        {
          envelopeId: "encrypted-1",
          receivedAt: "2026-07-16T12:30:00.000Z",
          envelope,
        },
      ]),
    });
    const user = userEvent.setup();
    render(
      <ResumeTaskDialog
        projectId="project-a"
        open
        onClose={vi.fn()}
        api={client as never}
      />,
    );

    expect(
      await screen.findByLabelText("Versioned handoff JSON"),
    ).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Inspect handoff" }));

    expect(
      await screen.findByText("Branch diverges from the handoff."),
    ).toBeVisible();
    expect(
      screen.getByText("Review Git state and re-run tests."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Resume task" })).toBeDisabled();
  });

  it("switches providers only after compatibility inspection", async () => {
    const compatible = { ...staleInspection, stale: [], explanations: [] };
    const client = api({
      inspectClyDevHandoff: vi.fn().mockResolvedValue(compatible),
      resumeClyDevHandoff: vi
        .fn()
        .mockResolvedValue({ inspection: compatible }),
    });
    const onResumed = vi.fn();
    const user = userEvent.setup();
    render(
      <ResumeTaskDialog
        projectId="project-a"
        open
        onClose={vi.fn()}
        onResumed={onResumed}
        api={client as never}
      />,
    );
    await screen.findByLabelText("Versioned handoff JSON");
    fireEvent.change(screen.getByLabelText("Versioned handoff JSON"), {
      target: { value: JSON.stringify(envelope) },
    });
    await user.selectOptions(
      screen.getByLabelText("Resume with provider"),
      "anthropic-claude",
    );
    await user.click(screen.getByRole("button", { name: "Inspect handoff" }));
    await user.click(
      await screen.findByRole("button", { name: "Resume task" }),
    );

    await waitFor(() =>
      expect(client.resumeClyDevHandoff).toHaveBeenCalledWith(
        "project-a",
        envelope,
        { id: "anthropic-claude" },
      ),
    );
    expect(onResumed).toHaveBeenCalledOnce();
  });

  it("rejects malformed or non-handoff JSON before any API call", async () => {
    const client = api();
    render(
      <ResumeTaskDialog
        projectId="project-a"
        open
        onClose={vi.fn()}
        api={client as never}
      />,
    );
    const input = await screen.findByLabelText("Versioned handoff JSON");
    fireEvent.change(input, {
      target: { value: JSON.stringify({ token: "must-not-transfer" }) },
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "valid cly.dev.handoff",
    );
    expect(
      screen.getByRole("button", { name: "Inspect handoff" }),
    ).toBeDisabled();
    expect(client.inspectClyDevHandoff).not.toHaveBeenCalled();
  });
});
