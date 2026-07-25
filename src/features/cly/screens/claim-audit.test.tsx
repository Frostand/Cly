import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";
import { ReproducibilityScreen } from "./integrity";
import { ClaimsScreen } from "./research-workspaces";

describe("claim audit and reproducibility board", () => {
  beforeEach(() => {
    localStorage.clear();
    useClyStore.setState({
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      activeProjectId: "project-cly",
      selectedId: "claim-01",
      toasts: [],
    });
    vi.unstubAllGlobals();
  });

  afterEach(() => vi.restoreAllMocks());

  it("creates an edited planned experiment and persists its claim relationship", async () => {
    const experiment = {
      ...useClyStore.getState().data.experiments[0],
      id: "experiment-planned",
      name: "Edited discriminating test",
      status: "Planned" as const,
    };
    const create = vi
      .spyOn(projectServices.experiments, "create")
      .mockResolvedValue(experiment);
    const linkExperiment = vi
      .spyOn(projectServices.claims, "linkExperiment")
      .mockResolvedValue();
    const user = userEvent.setup();
    render(<ClaimsScreen />);

    await user.click(screen.getByRole("radio", { name: "Detail" }));
    await user.click(
      screen.getByRole("button", { name: "Generate experiment" }),
    );
    fireEvent.change(screen.getByLabelText("Name"), {
      target: { value: "Edited discriminating test" },
    });
    await user.click(
      screen.getByRole("button", { name: "Create and link experiment" }),
    );

    await waitFor(() => expect(create).toHaveBeenCalled());
    expect(create.mock.calls[0]?.[0].name).toBe("Edited discriminating test");
    expect(linkExperiment).toHaveBeenCalledWith(
      "claim-01",
      "experiment-planned",
    );
  });

  it("defaults to the comparison table and persists a contradictory evidence link", async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          duplicate: false,
          evidence: {
            id: "evidence-new",
            projectId: "project-cly",
            type: "evidence",
            title: "Evidence at Results, p. 4",
            description: "",
            payload: {
              kind: "evidence",
              sourceId: "src-01",
              quote: "Coverage weakened under compound shift.",
              locator: "Results, p. 4",
              contentHash: "abc",
              verificationState: "unverified",
            },
            origin: "human",
            reviewState: "unreviewed",
            reviewedBy: null,
            reviewedAt: null,
            version: 1,
            createdAt: "2026-07-14T12:00:00.000Z",
            updatedAt: "2026-07-14T12:00:00.000Z",
          },
          containsRelationship: {
            id: "contains-new",
            fromObjectId: "src-01",
            toObjectId: "evidence-new",
            type: "contains",
            confidence: null,
            origin: "human",
            reviewState: "unreviewed",
            reviewedBy: null,
            reviewedAt: null,
            version: 1,
          },
          claimRelationship: {
            id: "relationship-new",
            fromObjectId: "evidence-new",
            toObjectId: "claim-01",
            type: "contradicts",
            confidence: null,
            origin: "human",
            reviewState: "unreviewed",
            reviewedBy: null,
            reviewedAt: null,
            version: 1,
          },
        }),
        { status: 201, headers: { "Content-Type": "application/json" } },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    render(<ClaimsScreen />);

    expect(screen.getByRole("table")).toBeVisible();
    await user.click(screen.getByRole("radio", { name: "Detail" }));
    await user.click(screen.getByRole("button", { name: "Add contradiction" }));
    expect(
      screen.getByRole("dialog", { name: "Record contradictory evidence" }),
    ).toBeVisible();
    await user.type(
      screen.getByLabelText("Exact evidence passage"),
      "Coverage weakened under compound shift.",
    );
    await user.type(
      screen.getByLabelText("Page, section, or locator"),
      "Results, p. 4",
    );
    await user.click(screen.getByRole("button", { name: "Link source" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/projects/project-cly/research/evidence-links",
    );
    expect(useClyStore.getState().data.claims[0]).toMatchObject({
      contradictingSourceIds: expect.arrayContaining(["src-01"]),
    });
    expect(useClyStore.getState().data.graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "relationship-new",
          relation: "contradicts",
          source: "evidence-new",
        }),
      ]),
    );
    expect(
      screen.getByText(/Coverage weakened under compound shift/),
    ).toBeVisible();
    expect(screen.getByText("Contradicts")).toBeVisible();
  });

  it("keeps the exact passage available for retry when the local service is offline", async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Local service offline")),
    );

    render(<ClaimsScreen />);
    await user.click(screen.getByRole("radio", { name: "Detail" }));
    await user.click(
      screen.getByRole("button", { name: "Add supporting passage" }),
    );
    await user.type(
      screen.getByLabelText("Exact evidence passage"),
      "Keep this exact passage available for retry.",
    );
    await user.click(screen.getByRole("button", { name: "Link source" }));

    await waitFor(() =>
      expect(
        useClyStore
          .getState()
          .toasts.some(
            (toast) => toast.title === "Evidence relationship was not saved",
          ),
      ).toBe(true),
    );
    expect(
      screen.getByRole("dialog", { name: "Link supporting evidence" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Exact evidence passage")).toHaveValue(
      "Keep this exact passage available for retry.",
    );
    expect(useClyStore.getState().data.evidencePassages).toHaveLength(0);
  });

  it("keeps inferred evidence visibly unverified until human review", async () => {
    const user = userEvent.setup();
    const data = createFixtureRepository("active");
    data.evidencePassages = [
      {
        id: "evidence-inferred",
        sourceId: "src-01",
        quote: "An agent inferred this exact supporting passage.",
        locator: "Abstract",
        contentHash: "inferred-hash",
        verificationState: "unverified",
        origin: "inferred",
        reviewedBy: null,
        reviewedAt: null,
        version: 1,
        createdAt: "2026-07-19T12:00:00.000Z",
        updatedAt: "2026-07-19T12:00:00.000Z",
      },
    ];
    data.graphEdges.push({
      id: "relationship-inferred",
      source: "evidence-inferred",
      target: "claim-01",
      relation: "supports",
      confidence: 0.74,
      approved: false,
      origin: "inferred",
      reviewState: "unreviewed",
      reviewedBy: null,
      reviewedAt: null,
      version: 1,
    });
    useClyStore.setState({ data });

    render(<ClaimsScreen />);
    await user.click(screen.getByRole("radio", { name: "Detail" }));

    expect(screen.getByText("AI inferred · unverified")).toBeVisible();
    expect(screen.getByRole("button", { name: "Approve link" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Reject link" })).toBeVisible();
  });

  it("replaces fixture findings with a generated six-area audit", async () => {
    const user = userEvent.setup();
    render(<ReproducibilityScreen />);

    await user.click(screen.getByRole("button", { name: "Run audit" }));

    await waitFor(() =>
      expect(useClyStore.getState().data.audits[0].areas).toHaveLength(6),
    );
    expect(
      screen.getAllByText("Claim needs review after upstream changes").length,
    ).toBeGreaterThan(0);
    expect(useClyStore.getState().data.findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          area: "Outputs",
          recommendedFix: expect.any(String),
        }),
      ]),
    );
  });

  it("keeps one primary action visible in empty claim and audit states", () => {
    useClyStore.setState({
      data: createFixtureRepository("empty"),
      fixtureMode: "empty",
      selectedId: null,
    });

    const claims = render(<ClaimsScreen />);
    expect(
      screen.getByRole("heading", { name: "No claims to audit" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "New claim" })).toHaveLength(
      1,
    );
    claims.unmount();

    render(<ReproducibilityScreen />);
    expect(
      screen.getByRole("heading", { name: "No reproducibility audit" }),
    ).toBeVisible();
    expect(screen.getAllByRole("button", { name: "Run audit" })).toHaveLength(
      1,
    );
  });
});
