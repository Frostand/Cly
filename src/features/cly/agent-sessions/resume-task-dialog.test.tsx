import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ApiRequestError } from "../services/api-client";
import { ResumeTaskDialog } from "./resume-task-dialog";

const blocked = {
  envelope: {
    handoffId: "project-a:session-a",
    projectId: "project-a",
    sessionId: "session-a",
    revision: 2,
    sourceMachine: { id: "Research Mac", platform: "darwin" as const },
    repository: { id: "repo-a", remoteUrl: "https://github.com/cly/repo.git" },
    worktree: { id: "worktree-a", branch: "feature/resume" },
    commit: { sha: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa" },
    task: {
      id: "task-a",
      title: "Resume evidence audit",
      objective: "Continue safely",
      researchObjectIds: ["claim-a"],
    },
    session: { id: "session-a", title: "Audit", state: "resumable" as const },
  },
  readiness: {
    status: "divergent-branch",
    blocking: true,
    checks: [
      {
        id: "remote",
        status: "pass" as const,
        summary: "Repository remote matches.",
      },
      {
        id: "divergent-branch",
        status: "fail" as const,
        summary: "Branch diverges from the handoff.",
      },
    ],
    actions: ["create-worktree", "inspect-changes", "defer"] as const,
  },
};

describe("ResumeTaskDialog", () => {
  it("re-renders readiness when resume becomes blocked after inspection", async () => {
    const user = userEvent.setup();
    const ready = {
      ...blocked,
      readiness: {
        status: "ready",
        blocking: false,
        checks: [],
        actions: [],
      },
    };
    const api = {
      pairClyDevDevice: vi
        .fn()
        .mockResolvedValue({ deviceId: "device", state: "paired" }),
      inspectClyDevHandoff: vi.fn().mockResolvedValue(ready),
      resumeClyDevHandoff: vi
        .fn()
        .mockRejectedValue(
          new ApiRequestError(JSON.stringify(blocked), 412, blocked),
        ),
    };
    render(<ResumeTaskDialog open onClose={vi.fn()} api={api as never} />);
    await user.type(screen.getByLabelText("Handoff ID"), "project-a:session-a");
    await user.type(screen.getByLabelText("Pairing code"), "123456");
    await user.type(
      screen.getByLabelText("Local repository or worktree"),
      "/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Inspect destination" }),
    );
    await user.click(
      await screen.findByRole("button", { name: "Resume task" }),
    );

    expect(
      await screen.findByText("Branch diverges from the handoff."),
    ).toBeVisible();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(JSON.stringify(blocked))).not.toBeInTheDocument();
  });

  it("explains restricted context and exposes only safe mismatch actions", async () => {
    const user = userEvent.setup();
    const api = {
      pairClyDevDevice: vi
        .fn()
        .mockResolvedValue({ deviceId: "device", state: "paired" }),
      inspectClyDevHandoff: vi
        .fn()
        .mockRejectedValue(new ApiRequestError("Blocked", 412, blocked)),
      resumeClyDevHandoff: vi.fn(),
    };
    render(<ResumeTaskDialog open onClose={vi.fn()} api={api as never} />);
    await user.type(screen.getByLabelText("Handoff ID"), "project-a:session-a");
    await user.type(screen.getByLabelText("Pairing code"), "123456");
    await user.type(
      screen.getByLabelText("Local repository or worktree"),
      "/repo",
    );
    await user.click(
      screen.getByRole("button", { name: "Inspect destination" }),
    );

    expect(
      await screen.findByRole("region", { name: "Resume readiness" }),
    ).toBeVisible();
    expect(
      screen.getByText(
        /Uncommitted files and restricted context are never copied/,
      ),
    ).toBeVisible();
    expect(screen.getByText("Branch diverges from the handoff.")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Create worktree" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Inspect local changes" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Defer" })).toBeVisible();
    expect(screen.queryByRole("button", { name: "Resume task" })).toBeNull();
  });
});
