import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createResearchObject } from "../../research/domain/research-object";
import { apiClient } from "../services/api-client";
import { useClyStore } from "../store/cly-store";
import { createProductionRepository } from "../store/production-repository";
import { ObjectivesScreen } from "./objectives";

const loadFromApi = useClyStore.getState().loadFromApi;
const project = {
  id: "project-1",
  name: "Structured research",
  path: "/tmp/structured",
  question: "",
  hypothesis: "",
  phase: "Setup",
  description: "Project lifecycle",
  localOnly: true,
  updatedAt: "2026-07-21T20:00:00.000Z",
};
const objective = createResearchObject(
  {
    id: "objective-1",
    projectId: project.id,
    title: "Establish calibration",
    description: "Define a defensible result.",
    payload: { kind: "objective", status: "active" },
  },
  new Date("2026-07-21T20:00:00.000Z"),
);
const method = createResearchObject(
  {
    id: "method-1",
    projectId: project.id,
    title: "Calibration benchmark",
    payload: { kind: "method", status: "draft" },
  },
  new Date("2026-07-21T20:00:00.000Z"),
);

describe("project structure workspace", () => {
  beforeEach(() => {
    const data = createProductionRepository([project]);
    data.researchObjects = [objective, method];
    data.researchRelationships = [
      {
        id: "relationship-1",
        projectId: project.id,
        fromObjectId: method.id,
        toObjectId: objective.id,
        type: "implements",
        origin: "human",
        reviewState: "unreviewed",
        confidence: null,
        reviewedBy: null,
        reviewedAt: null,
        version: 1,
        createdAt: "2026-07-21T20:00:00.000Z",
      },
    ];
    useClyStore.setState({
      data,
      activeProjectId: project.id,
      fixtureMode: "empty",
      researchDataLoading: false,
      researchDataError: null,
      loadFromApi,
    });
  });

  afterEach(() => vi.restoreAllMocks());

  it("renders partial project structure with versions and graph linkage", () => {
    render(<ObjectivesScreen />);

    expect(screen.getByRole("heading", { name: "Objectives" })).toBeVisible();
    expect(screen.getByText("Project structure is partial")).toBeVisible();
    expect(screen.getByText("Establish calibration")).toBeVisible();
    expect(screen.getAllByText("Version 1")).toHaveLength(2);
    expect(screen.getByText("implements")).toBeVisible();
    expect(screen.getByText("method-1")).toBeVisible();
  });

  it("renders actionable loading, empty, and failure recovery states", async () => {
    const retry = vi.fn().mockResolvedValue(true);
    useClyStore.setState((state) => ({
      data: { ...state.data, researchObjects: [], researchRelationships: [] },
      researchDataLoading: true,
      loadFromApi: retry,
    }));
    const { rerender } = render(<ObjectivesScreen />);
    expect(screen.getByLabelText("Loading project structure")).toBeVisible();

    useClyStore.setState({
      researchDataLoading: false,
      researchDataError: "SQLite unavailable",
    });
    rerender(<ObjectivesScreen />);
    expect(
      screen.getByRole("heading", {
        name: "Project structure could not be loaded",
      }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledWith(project.id);

    useClyStore.setState({ researchDataError: null });
    rerender(<ObjectivesScreen />);
    expect(screen.getByText("No structured project records yet")).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Add the first record" }),
    ).toBeEnabled();
  });

  it("creates every record through the project-scoped object API", async () => {
    const user = userEvent.setup();
    const create = vi.spyOn(apiClient, "createObject").mockResolvedValue(
      createResearchObject({
        id: "risk-1",
        projectId: project.id,
        title: "Distribution shift",
        payload: { kind: "risk", status: "draft" },
      }),
    );
    useClyStore.setState({ loadFromApi: vi.fn().mockResolvedValue(true) });
    render(<ObjectivesScreen />);

    await user.click(screen.getByRole("button", { name: "New record" }));
    const dialog = screen.getByRole("dialog", { name: "New project record" });
    await user.selectOptions(
      within(dialog).getByLabelText("Record type"),
      "risk",
    );
    await user.type(
      within(dialog).getByLabelText("Title"),
      "Distribution shift",
    );
    await user.click(
      within(dialog).getByRole("button", { name: "Create record" }),
    );

    await waitFor(() =>
      expect(create).toHaveBeenCalledWith(project.id, {
        type: "risk",
        title: "Distribution shift",
        description: "",
        payload: { kind: "risk", status: "draft" },
      }),
    );
  });

  it("updates with the visible version, links records, and recovers a failed save", async () => {
    const user = userEvent.setup();
    const update = vi
      .spyOn(apiClient, "updateObject")
      .mockRejectedValueOnce(new Error("Version conflict"))
      .mockResolvedValueOnce({ ...objective, version: 2 });
    const link = vi.spyOn(apiClient, "createRelationship").mockResolvedValue({
      id: "relationship-2",
      projectId: project.id,
      fromObjectId: objective.id,
      toObjectId: method.id,
      type: "depends-on",
      origin: "human",
      reviewState: "unreviewed",
      confidence: null,
      reviewedBy: null,
      reviewedAt: null,
      version: 1,
      createdAt: "2026-07-21T20:00:00.000Z",
    });
    useClyStore.setState({ loadFromApi: vi.fn().mockResolvedValue(true) });
    render(<ObjectivesScreen />);

    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Version conflict",
    );
    await user.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(update).toHaveBeenCalledTimes(2));
    expect(update).toHaveBeenLastCalledWith(
      project.id,
      objective.id,
      expect.objectContaining({
        expectedVersion: 1,
        payload: { status: "active", ownerId: null },
      }),
    );

    await user.click(screen.getByRole("button", { name: "Add dependency" }));
    await waitFor(() =>
      expect(link).toHaveBeenCalledWith(project.id, {
        fromObjectId: objective.id,
        toObjectId: method.id,
        type: "depends-on",
      }),
    );
  });
});
