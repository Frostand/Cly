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
          id: "relationship-new",
          projectId: "project-cly",
          fromObjectId: "src-01",
          toObjectId: "claim-01",
          type: "contradicts",
          confidence: null,
          reviewState: "unreviewed",
          createdAt: "2026-07-14T12:00:00.000Z",
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
    await user.click(screen.getByRole("button", { name: "Link source" }));

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(fetchMock.mock.calls[0]?.[0]).toContain(
      "/api/projects/project-cly/research/relationships",
    );
    expect(useClyStore.getState().data.claims[0]).toMatchObject({
      contradictingSourceIds: expect.arrayContaining(["src-01"]),
    });
    expect(useClyStore.getState().data.graphEdges).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "relationship-new",
          relation: "contradicts",
        }),
      ]),
    );
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
});
