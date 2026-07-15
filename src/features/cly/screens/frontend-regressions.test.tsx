import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { projectServices } from "../services/project-services";
import { useClyStore } from "../store/cly-store";
import { GraphScreen } from "./experiments-graph";
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

  it("offers a keyboard-operable integration details action", async () => {
    const user = userEvent.setup();
    render(<IntegrationsScreen />);

    const details = screen.getByRole("button", {
      name: "View GitHub details",
    });
    details.focus();
    await user.keyboard("{Enter}");

    expect(useClyStore.getState().selectedId).toBe("int-github");
    expect(
      screen.getAllByText("Not connected")[0].closest("[data-tone]"),
    ).toHaveAttribute("data-tone", "danger");
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
});
