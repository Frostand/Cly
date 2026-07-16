import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentContextSnapshot,
  ContextManifestPreview,
} from "../domain/agent-context";
import { createFixtureRepository } from "../fixtures/repository";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";
import { ContextScreen } from "./context";

const timestamp = "2026-07-16T04:00:00.000Z";
const revision = (
  id: string,
  itemId: string,
  originClass: "approved_fact" | "inferred_fact" | "file",
  verificationState: "verified" | "stale" | "conflicted",
  content: string,
) => ({
  id,
  projectId: "project-cly",
  itemId,
  revision: Number(id.at(-1)) || 1,
  originClass,
  referenceId: originClass === "file" ? "src/model.ts" : `memory:${itemId}`,
  content,
  confidence: 0.87,
  evidenceRefs: ["research-object:claim-1"],
  lastCheckedAt: timestamp,
  producerProcess: "agent-review",
  producerModel: "gpt-5",
  verificationState,
  sensitivity:
    originClass === "file" ? ("local_only" as const) : ("standard" as const),
  createdAt: timestamp,
});

const approved = revision(
  "revision-1",
  "item-memory",
  "approved_fact",
  "verified",
  "Approved endpoint is recovery at day 30.",
);
const proposal = revision(
  "revision-2",
  "item-memory",
  "inferred_fact",
  "conflicted",
  "Agent proposes recovery at day 14.",
);
const historical = {
  ...revision(
    "revision-4",
    "item-memory",
    "approved_fact",
    "verified",
    "Previously approved endpoint was recovery at day 60.",
  ),
  revision: 4,
};
const fileRevision = revision(
  "revision-3",
  "item-file",
  "file",
  "stale",
  "LOCAL_ONLY_SOURCE_CANARY",
);

const snapshot: AgentContextSnapshot = {
  items: [
    {
      id: "item-memory",
      projectId: "project-cly",
      label: "Primary endpoint",
      approvedRevisionId: approved.id,
      pinned: true,
      locked: false,
      deletedAt: null,
      version: 2,
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedRevision: approved,
      proposedRevisions: [proposal],
      previouslyApprovedRevisions: [historical],
      revisions: [proposal, approved, historical],
    },
    {
      id: "item-file",
      projectId: "project-cly",
      label: "Local implementation",
      approvedRevisionId: fileRevision.id,
      pinned: false,
      locked: false,
      deletedAt: null,
      version: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      approvedRevision: fileRevision,
      proposedRevisions: [],
      previouslyApprovedRevisions: [],
      revisions: [fileRevision],
    },
  ],
  packs: [
    {
      id: "pack-1",
      projectId: "project-cly",
      name: "Review context",
      configurationId: "configuration-1",
      roleId: "reviewer",
      revision: 1,
      createdAt: timestamp,
      updatedAt: timestamp,
      entries: [
        {
          position: 0,
          itemId: "item-memory",
          revisionId: approved.id,
          originClass: "approved_fact",
          referenceId: approved.referenceId,
          representation: "raw",
          selectionReason: "Human-approved primary outcome",
          sensitivity: "standard",
          verificationState: "verified",
        },
      ],
    },
  ],
  manifests: [],
};

const configuration = {
  id: "configuration-1",
  projectId: "project-cly",
  name: "Review",
  maxParallel: 1,
  maxTotalBudget: {
    maxInputTokens: 1000,
    maxOutputTokens: 100,
    maxCostMinorUnits: 10,
    maxRuntimeMs: 1000,
  },
  partialFailurePolicy: "continue" as const,
  roles: [
    {
      id: "reviewer",
      role: "review" as const,
      instanceCount: 1,
      maxParallel: 1,
      provider: "openai",
      model: "gpt-5",
      reasoningLevel: "high" as const,
      budget: {
        maxInputTokens: 1000,
        maxOutputTokens: 100,
        maxCostMinorUnits: 10,
        maxRuntimeMs: 1000,
      },
      allowedTools: [],
      allowedContextSources: ["project"],
      allowedFileGlobs: ["src/**"],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canRunCommands: false,
        canAccessNetwork: true,
        requiresApprovalForWrite: true,
        requiresApprovalForNetwork: true,
      },
      approvalCheckpoints: [],
    },
  ],
  revision: 1,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const restrictedPreview = (): ContextManifestPreview => ({
  canonicalPayload: '{"schemaVersion":1}',
  sha256: "a".repeat(64),
  entryCount: 1,
  totalTokens: 42,
  entries: [
    {
      kind: "approved_fact",
      referenceId: approved.referenceId,
      revisionId: approved.id,
      representation: "raw",
      tokenEstimate: 42,
      selectionReason: "Human-approved primary outcome",
      sensitivity: "standard",
    },
  ],
  excluded: [
    {
      referenceId: fileRevision.referenceId,
      reason: "Local-only context is never eligible for provider transmission.",
    },
  ],
  privacyWarnings: [
    {
      code: "RESTRICTED_APPROVAL_REQUIRED",
      message: "Approval required.",
      referenceIds: [approved.referenceId],
    },
  ],
  selectedObjectIds: ["claim-1"],
  obligationOperation: {
    kind: "provider-transmission",
    integration: "agent-context",
    objectIds: ["claim-1"],
    purpose: "research-assistance",
    collaborators: [],
    provider: "openai",
    residency: null,
    license: null,
    external: true,
  },
  obligationOperationHash: "b".repeat(64),
  restrictedReferenceIds: [approved.referenceId],
  obligationEvaluation: {
    decision: "review",
    complete: true,
    evaluationHash: "evaluation",
  },
});

describe("inspectable context screen", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: {
        ...createFixtureRepository("active"),
        agentConfigurations: [configuration],
      },
      agentContext: snapshot,
      agentContextProjectId: "project-cly",
      agentContextLoading: false,
      agentContextError: null,
      selectedId: null,
      toasts: [],
    });
  });

  it("separates approved memory from proposals and exposes provenance, status, reasons, and ordering", async () => {
    render(<ContextScreen />);
    expect(
      screen.getByRole("heading", { name: /Approved project memory/ }),
    ).toBeVisible();
    expect(
      screen.getByRole("heading", { name: /Project files/ }),
    ).toBeVisible();
    expect(
      screen.getByText("Approved endpoint is recovery at day 30."),
    ).toBeVisible();
    expect(
      screen.getByText("Agent proposes recovery at day 14."),
    ).toBeVisible();
    expect(
      screen.getByText("Previously approved endpoint was recovery at day 60."),
    ).toBeVisible();
    expect(screen.getByText(/Previously approved r4/)).toBeVisible();
    expect(screen.getByText("conflicted")).toBeVisible();
    expect(screen.getByText("stale")).toBeVisible();
    expect(
      screen.getAllByText(/agent-review · gpt-5/).length,
    ).toBeGreaterThanOrEqual(2);
    expect(
      screen.getAllByText("research-object:claim-1").length,
    ).toBeGreaterThan(0);
    expect(screen.getByText("Human-approved primary outcome")).toBeVisible();
    expect(screen.getByText(/exact revision revision-1/)).toBeVisible();
    expect(screen.getByText("Excluded by construction")).toBeVisible();
  });

  it("calls durable lifecycle and proposal approval services with optimistic versions", async () => {
    const lifecycle = vi
      .spyOn(projectServices.context, "setLifecycle")
      .mockResolvedValue(snapshot.items[0]);
    const approve = vi
      .spyOn(projectServices.context, "approveRevision")
      .mockResolvedValue(snapshot.items[0]);
    const user = userEvent.setup();
    render(<ContextScreen />);

    const controls = screen.getByLabelText(
      "Lifecycle controls for Primary endpoint",
    );
    await user.click(within(controls).getByRole("button", { name: "Unpin" }));
    expect(lifecycle).toHaveBeenCalledWith(
      "project-cly",
      "item-memory",
      "unpin",
      2,
      expect.objectContaining({ actorId: "local-user" }),
    );
    await user.click(screen.getByRole("button", { name: "Approve r2" }));
    expect(approve).toHaveBeenCalledWith(
      "project-cly",
      "item-memory",
      "revision-2",
      2,
      expect.objectContaining({ producerProcess: "cly-renderer" }),
    );
  });

  it("shows exact provider destination, server token totals, hash, exclusions, and privacy warnings", async () => {
    vi.spyOn(projectServices.context, "preview").mockResolvedValue(
      restrictedPreview(),
    );
    const user = userEvent.setup();
    render(<ContextScreen />);
    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    expect(await screen.findByText("openai / gpt-5")).toBeVisible();
    expect(screen.getByText("42 tokens")).toBeVisible();
    expect(screen.getByText("a".repeat(64))).toBeVisible();
    expect(screen.getByText("RESTRICTED_APPROVAL_REQUIRED")).toBeVisible();
    expect(screen.getByText("1 excluded")).toBeVisible();
  });

  it("discards a late preview after switching projects", async () => {
    let resolvePreview: (preview: ContextManifestPreview) => void = () =>
      undefined;
    vi.spyOn(projectServices.context, "preview").mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ContextScreen />);
    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    act(() => {
      useClyStore.setState({ activeProjectId: "project-cells" });
    });
    await act(async () => {
      resolvePreview(restrictedPreview());
      await Promise.resolve();
    });
    expect(screen.queryByText("a".repeat(64))).not.toBeInTheDocument();
  });

  it("discards late approval and persistence after operation scope changes", async () => {
    const preview = restrictedPreview();
    vi.spyOn(projectServices.context, "preview").mockResolvedValue(preview);
    let resolveApproval: (
      approval: Awaited<
        ReturnType<typeof projectServices.context.createTransmissionApproval>
      >,
    ) => void = () => undefined;
    vi.spyOn(
      projectServices.context,
      "createTransmissionApproval",
    ).mockReturnValue(
      new Promise((resolve) => {
        resolveApproval = resolve;
      }),
    );
    const user = userEvent.setup();
    render(<ContextScreen />);
    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    expect(
      screen.getByRole("button", { name: "Persist immutable manifest" }),
    ).toBeDisabled();
    await user.type(
      screen.getByLabelText("Restricted approval rationale"),
      "Exact review",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Approve exact restricted preview",
      }),
    );
    await user.clear(screen.getByLabelText("Transmission purpose"));
    await user.type(
      screen.getByLabelText("Transmission purpose"),
      "changed-purpose",
    );
    await act(async () => {
      resolveApproval({
        id: "stale-approval",
        projectId: "project-cly",
        manifestSha256: preview.sha256,
        provider: "openai",
        model: "gpt-5",
        restrictedReferenceIds: preview.restrictedReferenceIds,
        actorId: "local-user",
        rationale: "Exact review",
        state: "approved",
        expiresAt: null,
      });
      await Promise.resolve();
    });
    expect(screen.queryByText(/stale-approval/)).not.toBeInTheDocument();

    const standardPreview = {
      ...preview,
      restrictedReferenceIds: [],
      privacyWarnings: [],
    };
    vi.mocked(projectServices.context.preview).mockResolvedValue(
      standardPreview,
    );
    let resolvePersist: (
      manifest: Awaited<ReturnType<typeof projectServices.context.persist>>,
    ) => void = () => undefined;
    vi.spyOn(projectServices.context, "persist").mockReturnValue(
      new Promise((resolve) => {
        resolvePersist = resolve;
      }),
    );
    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    await user.click(
      screen.getByRole("button", { name: "Persist immutable manifest" }),
    );
    await user.type(
      screen.getByLabelText("Transmission collaborators"),
      "alice",
    );
    await act(async () => {
      resolvePersist({
        ...standardPreview,
        id: "stale-manifest",
        projectId: "project-cly",
        packId: "pack-1",
        configurationId: "configuration-1",
        roleId: "reviewer",
        provider: "openai",
        model: "gpt-5",
        schemaVersion: 1,
        idempotencyKey: "stale",
        obligationEvaluationHash:
          standardPreview.obligationEvaluation.evaluationHash,
        transmissionApprovalId: null,
        createdAt: timestamp,
      });
      await Promise.resolve();
    });
    expect(screen.queryByText(/stale-manifest/)).not.toBeInTheDocument();
  });

  it("creates, persists, and revokes an exact restricted approval through typed production services", async () => {
    const preview = restrictedPreview();
    vi.spyOn(projectServices.context, "preview").mockResolvedValue(preview);
    const approval = {
      id: "approval-1",
      projectId: "project-cly",
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: preview.restrictedReferenceIds,
      actorId: "local-user",
      rationale: "Reviewed exact restricted scope",
      state: "approved" as const,
      expiresAt: null,
    };
    const createApproval = vi
      .spyOn(projectServices.context, "createTransmissionApproval")
      .mockResolvedValue(approval);
    const persist = vi
      .spyOn(projectServices.context, "persist")
      .mockResolvedValue({
        ...preview,
        id: "manifest-1",
        projectId: "project-cly",
        packId: "pack-1",
        configurationId: "configuration-1",
        roleId: "reviewer",
        provider: "openai",
        model: "gpt-5",
        schemaVersion: 1,
        idempotencyKey: "context-test",
        obligationEvaluationHash: preview.obligationEvaluation.evaluationHash,
        transmissionApprovalId: approval.id,
        createdAt: timestamp,
      });
    const revoke = vi
      .spyOn(projectServices.context, "revokeTransmissionApproval")
      .mockResolvedValue({ id: approval.id, state: "revoked" });
    const user = userEvent.setup();
    render(<ContextScreen />);

    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    await user.type(
      await screen.findByLabelText("Restricted approval rationale"),
      "Reviewed exact restricted scope",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Approve exact restricted preview",
      }),
    );
    expect(createApproval).toHaveBeenCalledWith("project-cly", {
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: preview.restrictedReferenceIds,
      actorId: "local-user",
      rationale: "Reviewed exact restricted scope",
      expiresAt: null,
    });
    expect(
      await screen.findByText(/Approval approval-1: approved/),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Persist immutable manifest" }),
    );
    expect(persist).toHaveBeenCalledWith(
      "project-cly",
      expect.objectContaining({
        packId: "pack-1",
        configurationId: "configuration-1",
        roleId: "reviewer",
        expectedSha256: preview.sha256,
        transmissionApprovalId: approval.id,
        purpose: "research-assistance",
      }),
    );
    expect(
      await screen.findByText(/Manifest manifest-1 persisted/),
    ).toBeVisible();

    await user.click(
      screen.getByRole("button", { name: "Revoke transmission approval" }),
    );
    expect(revoke).toHaveBeenCalledWith("project-cly", approval.id, {
      actorId: "local-user",
      rationale: "Revoked from Context Composer",
    });
    expect(
      await screen.findByText(/Approval approval-1: revoked/),
    ).toBeVisible();
  });

  it.each([
    "Transmission approval is missing or revoked.",
    "Transmission approval has expired.",
    "Transmission approval scope does not match the manifest.",
  ])("surfaces fail-closed restricted persistence errors: %s", async (message) => {
    const preview = restrictedPreview();
    vi.spyOn(projectServices.context, "preview").mockResolvedValue(preview);
    vi.spyOn(
      projectServices.context,
      "createTransmissionApproval",
    ).mockResolvedValue({
      id: "approval-negative",
      projectId: "project-cly",
      manifestSha256: preview.sha256,
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: preview.restrictedReferenceIds,
      actorId: "local-user",
      rationale: "Exact review",
      state: "approved",
      expiresAt: null,
    });
    const persist = vi
      .spyOn(projectServices.context, "persist")
      .mockRejectedValue(new Error(message));
    const user = userEvent.setup();
    render(<ContextScreen />);
    await user.click(
      screen.getByRole("button", { name: /Preview transmission/ }),
    );
    await user.type(
      screen.getByLabelText("Restricted approval rationale"),
      "Exact review",
    );
    await user.click(
      screen.getByRole("button", {
        name: "Approve exact restricted preview",
      }),
    );
    await user.click(
      screen.getByRole("button", { name: "Persist immutable manifest" }),
    );
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
    expect(persist).toHaveBeenCalledOnce();
    expect(screen.queryByText(/Manifest .* persisted/)).not.toBeInTheDocument();
  });

  it("renders truthful loading, hydration error with retry, and empty success states", async () => {
    const originalLoadFromApi = useClyStore.getState().loadFromApi;
    useClyStore.setState({
      agentContext: { items: [], packs: [], manifests: [] },
      agentContextProjectId: null,
      agentContextLoading: true,
      agentContextError: null,
      fixtureMode: "empty",
    });
    const { unmount } = render(<ContextScreen />);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Loading durable project context",
    );
    expect(
      screen.queryByText("No durable context yet"),
    ).not.toBeInTheDocument();
    unmount();

    const retry = vi.fn().mockResolvedValue(true);
    useClyStore.setState({
      loadFromApi: retry,
      agentContextLoading: false,
      agentContextError: "Context endpoint unavailable.",
    });
    const errorView = render(<ContextScreen />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Context endpoint unavailable.",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Retry context loading" }),
    );
    expect(retry).toHaveBeenCalledWith("project-cly");
    errorView.unmount();

    useClyStore.setState({
      agentContextProjectId: "project-cly",
      agentContextLoading: false,
      agentContextError: null,
    });
    render(<ContextScreen />);
    expect(screen.getByText("No durable context yet")).toBeVisible();
    useClyStore.setState({ loadFromApi: originalLoadFromApi });
  });

  it("surfaces API failures without silently changing local context", async () => {
    vi.spyOn(projectServices.context, "setLifecycle").mockRejectedValue(
      new Error("Agent context revision conflict."),
    );
    render(<ContextScreen />);
    await userEvent.click(
      within(
        screen.getByLabelText("Lifecycle controls for Primary endpoint"),
      ).getByRole("button", { name: "Unpin" }),
    );
    await waitFor(() =>
      expect(screen.getByRole("alert")).toHaveTextContent(
        "Agent context revision conflict.",
      ),
    );
    expect(useClyStore.getState().agentContext.items[0].pinned).toBe(true);
  });

  it("resets composer selection to the newly hydrated project pack", async () => {
    render(<ContextScreen />);
    const initial = screen.getByRole("checkbox", { name: "Primary endpoint" });
    expect(initial).toBeChecked();
    await userEvent.click(initial);
    expect(initial).not.toBeChecked();

    act(() => {
      useClyStore.setState({
        activeProjectId: "project-cells",
        agentContext: {
          ...snapshot,
          items: snapshot.items.map((item) => ({
            ...item,
            projectId: "project-cells",
            revisions: item.revisions.map((candidate) => ({
              ...candidate,
              projectId: "project-cells",
            })),
            approvedRevision: item.approvedRevision
              ? { ...item.approvedRevision, projectId: "project-cells" }
              : null,
            proposedRevisions: item.proposedRevisions.map((candidate) => ({
              ...candidate,
              projectId: "project-cells",
            })),
          })),
          packs: snapshot.packs.map((pack) => ({
            ...pack,
            projectId: "project-cells",
          })),
        },
        agentContextProjectId: "project-cells",
      });
    });

    await waitFor(() =>
      expect(
        screen.getByRole("checkbox", { name: "Primary endpoint" }),
      ).toBeChecked(),
    );
  });
});
