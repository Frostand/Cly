import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createOnboardingDraft,
  type OnboardingDiagnostics,
  type OnboardingDraft,
  updateOnboardingDraft,
} from "../domain/onboarding";
import { localIntegrationService } from "../services/local-integrations";
import { OnboardingScreen, onboardingTestFixtures } from "./onboarding";

const project = {
  id: "project-onboarding",
  name: "Imported research",
  path: "/research/imported",
  question: "",
  hypothesis: "",
  phase: "Setup",
  description: "Local project",
  localOnly: true,
  updatedAt: "2026-07-21T12:00:00.000Z",
};

const renderOnboarding = (
  initialDraft = createOnboardingDraft(),
  diagnostics: OnboardingDiagnostics = onboardingTestFixtures.emptyDiagnostics,
) => {
  const props = {
    initialDraft,
    diagnostics,
    onChooseProject: vi.fn().mockResolvedValue({
      project,
      selection: {
        id: project.id,
        name: project.name,
        path: project.path,
        mode: "import",
      },
    }),
    onProjectSelected: vi.fn(),
    onRunDiagnostics: vi.fn().mockResolvedValue(diagnostics),
    onComplete: vi.fn(),
    onOpenDestination: vi.fn(),
  } as const;
  render(<OnboardingScreen {...props} />);
  return props;
};

describe("first-run onboarding", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.spyOn(localIntegrationService, "refreshProvider").mockResolvedValue();
  });
  afterEach(() => {
    vi.restoreAllMocks();
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: undefined,
      writable: true,
    });
  });

  it("hydrates the durable draft before autosave can write an empty render", async () => {
    let resolveLoad: ((draft: OnboardingDraft) => void) | undefined;
    const durable = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "research",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
        topic: "Durable topic",
        primaryQuestion: "Will this survive a different renderer origin?",
      },
    );
    const saveDraft = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: {
        isElectron: true,
        loadOnboardingDraft: vi.fn(
          () =>
            new Promise<OnboardingDraft>((resolve) => {
              resolveLoad = resolve;
            }),
        ),
        saveOnboardingDraft: saveDraft,
      },
      writable: true,
    });

    render(
      <OnboardingScreen
        activeProjectId="project-onboarding"
        onChooseProject={vi.fn()}
        onRunDiagnostics={vi.fn()}
        onComplete={vi.fn()}
        onOpenDestination={vi.fn()}
      />,
    );
    expect(screen.getByLabelText("Loading saved setup")).toBeVisible();
    expect(saveDraft).not.toHaveBeenCalled();

    resolveLoad?.(durable);
    expect(await screen.findByLabelText("Research topic")).toHaveValue(
      "Durable topic",
    );
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(saveDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: "" }),
    );
  });

  it("blocks autosave on a transient durable read failure and retries the same draft", async () => {
    const user = userEvent.setup();
    const durable = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "research",
        topic: "Durable topic after retry",
        primaryQuestion: "Does retry preserve the SQLite draft?",
      },
    );
    const loadDraft = vi
      .fn()
      .mockRejectedValueOnce(new Error("SQLITE_BUSY"))
      .mockResolvedValueOnce(durable);
    const saveDraft = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: {
        isElectron: true,
        loadOnboardingDraft: loadDraft,
        saveOnboardingDraft: saveDraft,
      },
      writable: true,
    });

    render(
      <OnboardingScreen
        activeProjectId="project-onboarding"
        onChooseProject={vi.fn()}
        onRunDiagnostics={vi.fn()}
        onComplete={vi.fn()}
        onOpenDestination={vi.fn()}
      />,
    );

    expect(
      await screen.findByRole("heading", {
        name: "Saved setup could not be loaded",
      }),
    ).toBeVisible();
    expect(screen.getByText(/durable draft was not replaced/i)).toBeVisible();
    expect(saveDraft).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: /try again/i }));
    expect(await screen.findByLabelText("Research topic")).toHaveValue(
      "Durable topic after retry",
    );
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    expect(saveDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({ topic: "" }),
    );
  });

  it("persists project setup before the durable completion marker and navigation", async () => {
    const user = userEvent.setup();
    let resolveProjectSetup: (() => void) | undefined;
    const projectSetup = new Promise<void>((resolve) => {
      resolveProjectSetup = resolve;
    });
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: {
        isElectron: true,
        loadOnboardingDraft: vi.fn(),
        saveOnboardingDraft: vi.fn().mockResolvedValue(true),
      },
      writable: true,
    });
    const draft = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "finish",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
        starterPlan: {
          objective: "Preserve onboarding state",
          hypothesis: "SQLite survives renderer origin changes",
          tasks: ["Persist the draft"],
          generatedAt: "2026-07-21T16:00:00.000Z",
        },
      },
    );
    const props = renderOnboarding(draft);
    props.onComplete.mockImplementation(() => projectSetup);

    await waitFor(() =>
      expect(window.dream?.saveOnboardingDraft).toHaveBeenCalled(),
    );
    const desktop = window.dream;
    if (!desktop) throw new Error("Desktop onboarding bridge is unavailable.");
    vi.mocked(desktop.saveOnboardingDraft).mockClear();

    await user.click(
      screen.getByRole("button", { name: /Add the first source/ }),
    );
    expect(props.onComplete).toHaveBeenCalledWith(
      expect.objectContaining({ completed: false }),
    );
    expect(window.dream?.saveOnboardingDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({ completed: true }),
    );
    expect(props.onOpenDestination).not.toHaveBeenCalled();

    resolveProjectSetup?.();
    await waitFor(() =>
      expect(window.dream?.saveOnboardingDraft).toHaveBeenCalledWith(
        expect.objectContaining({ completed: true }),
      ),
    );
    expect(props.onOpenDestination).toHaveBeenCalledWith("sources");
  });

  it("rewrites an incomplete draft when project setup persistence fails", async () => {
    const user = userEvent.setup();
    const saveDraft = vi.fn().mockResolvedValue(true);
    Object.defineProperty(window, "dream", {
      configurable: true,
      value: {
        isElectron: true,
        loadOnboardingDraft: vi.fn(),
        saveOnboardingDraft: saveDraft,
      },
      writable: true,
    });
    const draft = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "finish",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
        starterPlan: {
          objective: "Persist the project",
          hypothesis: "Failure remains resumable",
          tasks: ["Retry"],
          generatedAt: "2026-07-21T16:00:00.000Z",
        },
      },
    );
    const props = renderOnboarding(draft);
    props.onComplete.mockRejectedValue(new Error("Project setup write failed"));
    await waitFor(() => expect(saveDraft).toHaveBeenCalled());
    saveDraft.mockClear();

    await user.click(screen.getByRole("button", { name: /Open claims/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Project setup write failed",
    );
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ completed: false, currentStep: "finish" }),
    );
    expect(saveDraft).not.toHaveBeenCalledWith(
      expect.objectContaining({ completed: true }),
    );
    expect(props.onOpenDestination).not.toHaveBeenCalled();
  });

  it.each([
    ["Open claims", "claims"],
    ["Inspect graph", "graph"],
  ] as const)("completes setup before %s navigates", async (label, destination) => {
    const user = userEvent.setup();
    const draft = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "finish",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
        starterPlan: {
          objective: "Navigate visibly",
          hypothesis: "The gate opens after persistence",
          tasks: ["Navigate"],
          generatedAt: "2026-07-21T16:00:00.000Z",
        },
      },
    );
    const props = renderOnboarding(draft);

    await user.click(screen.getByRole("button", { name: label }));

    await waitFor(() =>
      expect(props.onOpenDestination).toHaveBeenCalledWith(destination),
    );
    expect(props.onComplete).toHaveBeenCalledBefore(props.onOpenDestination);
  });

  it("starts empty with a clear local persistence boundary", () => {
    renderOnboarding();
    expect(
      screen.getByRole("heading", {
        name: "Your Cly workspace starts empty",
      }),
    ).toBeVisible();
    expect(screen.getByText("No preloaded project")).toBeVisible();
    expect(screen.getByText("Saved on this Mac")).toBeVisible();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled();
    expect(
      screen.queryByText("Neural surrogate reliability"),
    ).not.toBeInTheDocument();
  });

  it("offers local use or an explicit provider sign-in during setup", async () => {
    const user = userEvent.setup();
    renderOnboarding();

    await user.click(screen.getByRole("button", { name: /Continue/ }));

    expect(
      screen.getByRole("heading", {
        name: "Choose local-only use or connect an AI provider",
      }),
    ).toBeVisible();
    expect(
      screen.getByRole("radio", { name: /^Use Cly locally/ }),
    ).toBeChecked();
    expect(screen.getByText(/does not require a cloud account/i)).toBeVisible();

    await user.click(
      screen.getByRole("radio", { name: /^Connect an AI provider/ }),
    );
    expect(screen.getByText("Codex CLI")).toBeVisible();
    expect(screen.getByText("Claude Code CLI")).toBeVisible();
  });

  it("imports a repository and scopes the interrupted setup", async () => {
    const user = userEvent.setup();
    const props = renderOnboarding(
      updateOnboardingDraft(createOnboardingDraft(), {
        currentStep: "project",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /Open an existing folder/ }),
    );
    await waitFor(() =>
      expect(props.onProjectSelected).toHaveBeenCalledWith(project),
    );
    expect(
      screen.getByRole("heading", { name: /Define the question/ }),
    ).toBeVisible();
    expect(
      localStorage.getItem("cly:onboarding:v1:project-onboarding"),
    ).toContain("Imported research");
  });

  it("resumes a populated draft and restart preserves its data", async () => {
    const user = userEvent.setup();
    renderOnboarding(
      updateOnboardingDraft(createOnboardingDraft("project-onboarding"), {
        currentStep: "research",
        topic: "Persisted topic",
        primaryQuestion: "Does the local draft survive?",
      }),
    );
    expect(screen.getByLabelText("Research topic")).toHaveValue(
      "Persisted topic",
    );
    await user.click(screen.getByRole("button", { name: "Restart" }));
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(
      screen.getByRole("heading", {
        name: "Choose local-only use or connect an AI provider",
      }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(screen.getByRole("heading", { name: /Where should/ })).toBeVisible();
    expect(
      localStorage.getItem("cly:onboarding:v1:project-onboarding"),
    ).toContain("Persisted topic");
  });

  it("blocks external transmission by default and records local-only completion", async () => {
    const user = userEvent.setup();
    renderOnboarding(
      updateOnboardingDraft(createOnboardingDraft("project-onboarding"), {
        currentStep: "privacy",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "create",
        },
      }),
    );
    expect(screen.getByText("External transmission blocked")).toBeVisible();
    expect(screen.getByRole("button", { name: /Continue/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Continue/ }));
    expect(
      screen.getByRole("heading", { name: "Check the project environment" }),
    ).toBeVisible();
  });

  it("requires review before it displays generated starter work", async () => {
    const user = userEvent.setup();
    renderOnboarding(
      updateOnboardingDraft(createOnboardingDraft("project-onboarding"), {
        currentStep: "review",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "create",
        },
        topic: "Calibration",
        primaryQuestion: "Which method stays calibrated?",
      }),
    );
    expect(
      screen.queryByText("Objective", { exact: true }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Prepare workspace/ }));
    expect(screen.getByText("Objective", { exact: true })).toBeVisible();
    expect(screen.getAllByText(/Which method stays calibrated/)).toHaveLength(
      2,
    );
  });

  it.each([
    ["permission-denied", "Permission denied", "Grant read and write access"],
    ["offline", "Offline", "Reconnect before enabling an integration"],
    ["failed", "Provider CLI", "Install a supported provider CLI"],
  ] as const)("renders the %s readiness state with an actionable fix", (status, label, fix) => {
    renderOnboarding(
      updateOnboardingDraft(createOnboardingDraft("project-onboarding"), {
        currentStep: "readiness",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
      }),
      {
        state: "ready",
        repositorySize: "normal",
        checks: [
          {
            id:
              status === "permission-denied"
                ? "filesystem"
                : status === "offline"
                  ? "integrations"
                  : "provider-cli",
            label,
            status,
            detail: `${label} needs attention.`,
            fix,
          },
        ],
      },
    );
    expect(screen.getByText(label)).toBeVisible();
    expect(screen.getByText(fix)).toBeVisible();
  });

  it("renders loading, error, large-repository, and narrow-window states", () => {
    const draft = updateOnboardingDraft(
      createOnboardingDraft("project-onboarding"),
      {
        currentStep: "readiness",
        project: {
          id: project.id,
          name: project.name,
          path: project.path,
          mode: "import",
        },
      },
    );
    const { rerender } = render(
      <OnboardingScreen
        activeProjectId={project.id}
        initialDraft={draft}
        diagnostics={{
          state: "loading",
          checks: [],
          repositorySize: "unknown",
        }}
        onChooseProject={vi.fn()}
        onRunDiagnostics={vi.fn()}
        onComplete={vi.fn()}
        onOpenDestination={vi.fn()}
      />,
    );
    expect(
      screen.getByLabelText("Checking the local project environment"),
    ).toBeVisible();
    rerender(
      <OnboardingScreen
        activeProjectId={project.id}
        initialDraft={draft}
        diagnostics={{
          state: "error",
          checks: [],
          repositorySize: "unknown",
          error: "Local service unavailable",
        }}
        onChooseProject={vi.fn()}
        onRunDiagnostics={vi.fn()}
        onComplete={vi.fn()}
        onOpenDestination={vi.fn()}
      />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Local service unavailable",
    );
    rerender(
      <OnboardingScreen
        activeProjectId={project.id}
        initialDraft={draft}
        diagnostics={onboardingTestFixtures.largeDiagnostics}
        onChooseProject={vi.fn()}
        onRunDiagnostics={vi.fn()}
        onComplete={vi.fn()}
        onOpenDestination={vi.fn()}
      />,
    );
    expect(
      screen.getByText("125,000 files detected", { exact: false }),
    ).toBeVisible();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 540,
    });
    fireEvent(window, new Event("resize"));
    expect(
      screen.getByRole("navigation", { name: "Setup progress" }),
    ).toBeVisible();
  });
});
