import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  AgentConfiguration,
  AgentConfigurationInput,
} from "../agent-sessions/types";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { getCapability } from "./capabilities";
import { projectServices } from "./project-services";

describe("production Cly capability boundaries", () => {
  it.each([
    "notebooks.import",
    "integrations.configure",
    "planner.update",
    "decisions.create",
  ])("classifies %s as unavailable with an explanation", (id) => {
    expect(getCapability(id)).toMatchObject({
      state: "unavailable",
      reason: expect.any(String),
      service: null,
      api: null,
    });
  });

  it("classifies reproducibility auditing as a production capability", () => {
    expect(getCapability("reproducibility.audit")).toMatchObject({
      state: "production",
      service: "projectServices.reproducibility",
      api: expect.stringContaining("reproducibility-audits"),
      reason: null,
    });
  });

  it("classifies durable context editing as a production capability", () => {
    expect(getCapability("context.edit")).toMatchObject({
      state: "production",
      service: "projectServices.context",
      api: expect.stringContaining("agent-context"),
      reason: null,
    });
  });
});

const input: AgentConfigurationInput = {
  name: "Delivery team",
  maxParallel: 1,
  maxTotalBudget: {
    maxInputTokens: 1_000,
    maxOutputTokens: 500,
    maxCostMinorUnits: 100,
    maxRuntimeMs: 10_000,
  },
  partialFailurePolicy: "continue",
  roles: [
    {
      id: "implementation",
      role: "implementation",
      instanceCount: 1,
      maxParallel: 1,
      provider: "openai",
      model: "gpt-5",
      reasoningLevel: "medium",
      budget: {
        maxInputTokens: 1_000,
        maxOutputTokens: 500,
        maxCostMinorUnits: 100,
        maxRuntimeMs: 10_000,
      },
      allowedTools: ["readFile"],
      allowedContextSources: ["project"],
      allowedFileGlobs: ["**/*"],
      permissions: {
        canReadFiles: true,
        canWriteFiles: false,
        canRunCommands: false,
        canAccessNetwork: false,
        requiresApprovalForWrite: true,
        requiresApprovalForNetwork: true,
      },
      approvalCheckpoints: [],
    },
  ],
};

const persisted: AgentConfiguration = {
  ...input,
  id: "configuration-1",
  projectId: "project-cly",
  revision: 1,
  createdAt: "2026-07-15T00:00:00.000Z",
  updatedAt: "2026-07-15T00:00:00.000Z",
};

describe("project agent configuration services", () => {
  beforeEach(() => {
    const data = createFixtureRepository("active");
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: { ...data, agentConfigurations: [persisted] },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses the normal renderer estimate shape and returns inaccessible reasons", async () => {
    const estimate = {
      inputTokens: 900,
      outputTokens: 400,
      costMinorUnits: 75,
      runtimeMs: 8_000,
      inaccessibleContext: ["unknown-context"],
      inaccessibleTools: ["unknownTool"],
      reasons: ["Tool “unknownTool” is unavailable."],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response(JSON.stringify(estimate)));
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      projectServices.agents.estimateConfiguration(
        "project-cly",
        "draft",
        input,
      ),
    ).resolves.toEqual(estimate);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/projects/project-cly/agent-configurations/draft/estimate",
    );
    expect(JSON.parse(request.body)).toEqual({ configuration: input });
    expect(request.body).not.toContain("availableTools");
    expect(request.body).not.toContain("availableContextSources");
  });

  it("preserves local state when an optimistic update conflicts", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: "Agent configuration revision conflict.",
          }),
          { status: 409 },
        ),
      ),
    );

    await expect(
      projectServices.agents.saveConfiguration("project-cly", persisted),
    ).rejects.toThrow(/revision conflict/i);

    expect(useClyStore.getState().data.agentConfigurations).toEqual([
      persisted,
    ]);
  });

  it("deletes the expected revision before removing local state", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ id: persisted.id, revision: 1 })),
      );
    vi.stubGlobal("fetch", fetchMock);

    await projectServices.agents.removeConfiguration(
      "project-cly",
      persisted.id,
      persisted.revision,
    );

    expect(useClyStore.getState().data.agentConfigurations).toEqual([]);
    const [url, request] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "/api/projects/project-cly/agent-configurations/configuration-1",
    );
    expect(request.method).toBe("DELETE");
    expect(JSON.parse(request.body)).toEqual({ expectedRevision: 1 });
  });
});

describe("project context approval services", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends exact typed approval and revocation payloads through the production API", async () => {
    const approval = {
      id: "approval-1",
      projectId: "project-cly",
      manifestSha256: "a".repeat(64),
      provider: "openai",
      model: "gpt-5",
      restrictedReferenceIds: ["source-1"],
      actorId: "user-1",
      rationale: "Approved exact preview",
      state: "approved" as const,
      expiresAt: null,
      createdAt: "2026-07-16T00:00:00.000Z",
      revokedAt: null,
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(approval)))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: approval.id, state: "revoked" })),
      );
    vi.stubGlobal("fetch", fetchMock);

    const input = {
      manifestSha256: approval.manifestSha256,
      provider: approval.provider,
      model: approval.model,
      restrictedReferenceIds: approval.restrictedReferenceIds,
      actorId: approval.actorId,
      rationale: approval.rationale,
      expiresAt: approval.expiresAt,
    };
    await expect(
      projectServices.context.createTransmissionApproval("project-cly", input),
    ).resolves.toEqual(approval);
    await expect(
      projectServices.context.revokeTransmissionApproval(
        "project-cly",
        approval.id,
        { actorId: "user-1", rationale: "No longer needed" },
      ),
    ).resolves.toEqual({ id: approval.id, state: "revoked" });

    expect(fetchMock.mock.calls).toEqual([
      [
        "/api/projects/project-cly/agent-context/approvals",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify(input),
        }),
      ],
      [
        "/api/projects/project-cly/agent-context/approvals/approval-1/revoke",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({
            actorId: "user-1",
            rationale: "No longer needed",
          }),
        }),
      ],
    ]);
  });

  it.each([
    "Transmission approval is missing or revoked.",
    "Transmission approval has expired.",
    "Transmission approval scope does not match the manifest.",
  ])("propagates fail-closed manifest persistence errors: %s", async (message) => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify({ error: message }), { status: 400 }),
        ),
    );

    await expect(
      projectServices.context.persist("project-cly", {
        packId: "pack-1",
        configurationId: "configuration-1",
        roleId: "researcher",
        provider: "openai",
        model: "gpt-5",
        purpose: "research-assistance",
        collaborators: [],
        residency: null,
        license: null,
        idempotencyKey: "negative-approval",
        expectedSha256: "a".repeat(64),
        transmissionApprovalId: "approval-1",
      }),
    ).rejects.toThrow(message);
  });
});
