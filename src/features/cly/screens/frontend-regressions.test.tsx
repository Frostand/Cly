import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { localIntegrationService } from "../services/local-integrations";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";
import { ExperimentsScreen, GraphScreen } from "./experiments-graph";
import { ProvenanceScreen } from "./integrity";
import { CodeLinkerScreen } from "./research-workspaces";
import { IntegrationsScreen } from "./system";

describe("frontend interaction regressions", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      activeProjectId: "project-cly",
      selectedId: null,
      inspectorOpen: true,
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("offers a keyboard-operable integration refresh action", async () => {
    const user = userEvent.setup();
    const refresh = vi
      .spyOn(localIntegrationService, "refreshProvider")
      .mockResolvedValue(undefined);
    vi.spyOn(localIntegrationService, "detectEditors").mockResolvedValue([]);
    render(<IntegrationsScreen />);

    const refreshAll = screen.getByRole("button", { name: "Refresh all" });
    await waitFor(() => expect(refreshAll).toBeEnabled());
    refresh.mockClear();
    refreshAll.focus();
    await user.keyboard("{Enter}");

    expect(refresh).toHaveBeenCalledWith();
    expect(screen.queryByText("NotebookLM")).not.toBeInTheDocument();
  });

  it("creates a graph relationship with distinct endpoints", async () => {
    const createRelationship = vi
      .spyOn(projectServices.graph, "createRelationship")
      .mockImplementation(async (input) => ({ ...input, id: "edge-new" }));
    render(<GraphScreen />);

    await userEvent.click(
      screen.getByRole("button", { name: "New relationship" }),
    );

    await waitFor(() => expect(createRelationship).toHaveBeenCalledOnce());
    const input = createRelationship.mock.calls[0][0];
    expect(input.source).not.toBe(input.target);
  });

  it("reports graph relationship persistence failures", async () => {
    vi.spyOn(projectServices.graph, "createRelationship").mockRejectedValue(
      new Error("Relationship endpoint rejected."),
    );
    render(<GraphScreen />);

    await userEvent.click(
      screen.getByRole("button", { name: "New relationship" }),
    );

    await waitFor(() =>
      expect(useClyStore.getState().toasts.at(-1)).toMatchObject({
        title: "Relationship was not created",
        detail: "Relationship endpoint rejected.",
      }),
    );
  });

  it("keeps only implemented Code Linker views and removes placeholder actions", () => {
    render(<CodeLinkerScreen />);
    expect(screen.getByRole("radio", { name: "Files" })).toBeVisible();
    expect(
      screen.queryByRole("radio", { name: "Objectives" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: "Claims" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Link object" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Request review" }),
    ).not.toBeInTheDocument();
  });

  it("exposes experiment output and provenance cards as keyboard buttons", async () => {
    const user = userEvent.setup();
    const experimentView = render(<ExperimentsScreen />);
    await user.click(screen.getByRole("radio", { name: "Outputs" }));
    const output = screen.getAllByRole("button", { name: /Open output/ })[0];
    output.focus();
    await user.keyboard("{Enter}");
    expect(useClyStore.getState().selectedId).toBeTruthy();
    experimentView.unmount();

    render(<ProvenanceScreen />);
    await user.click(screen.getByRole("radio", { name: "Gallery" }));
    const provenance = screen.getAllByRole("button", {
      name: /Open provenance for/,
    })[0];
    provenance.focus();
    await user.keyboard(" ");
    expect(useClyStore.getState().selectedId).toBeTruthy();
  });

  it("does not request provenance before a project is selected", async () => {
    useClyStore.setState({ activeProjectId: "", fixtureMode: "empty" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<ProvenanceScreen />);

    expect(screen.getByText("Choose a project")).toBeVisible();
    await waitFor(() => expect(fetchMock).not.toHaveBeenCalled());
  });
});
