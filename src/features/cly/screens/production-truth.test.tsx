import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { useClyStore } from "../store/cly-store";
import { createProductionRepository } from "../store/production-repository";
import { ObjectivesScreen } from "./platform-workspaces";
import { LiteratureScreen } from "./research-workspaces";

const unrelatedProject = {
  id: "project-unrelated",
  name: "Urban tree canopy study",
  path: "/tmp/urban-tree-canopy",
  question: "How does tree canopy affect neighborhood temperature?",
  hypothesis: "More canopy reduces peak summer temperature.",
  phase: "Exploration",
  description: "An unrelated environmental research project.",
  localOnly: true,
  updatedAt: "2026-07-24T12:00:00.000Z",
};

describe("production research truthfulness", () => {
  beforeEach(() => {
    useClyStore.setState({
      activeProjectId: unrelatedProject.id,
      data: createProductionRepository([unrelatedProject]),
      fixtureMode: "empty",
    });
  });

  it("does not fabricate fixture objectives for an unrelated project", () => {
    render(<ObjectivesScreen />);
    expect(
      screen.getByRole("heading", {
        name: "How does tree canopy affect neighborhood temperature?",
      }),
    ).toBeVisible();
    expect(screen.getByText("0 of 4 gates complete")).toBeVisible();
    expect(screen.getByText(/not scientific completion/i)).toBeVisible();
    expect(document.body).not.toHaveTextContent(
      /fixture project|bundle ready/i,
    );
  });

  it("derives literature empty states without fixture claims", async () => {
    const user = userEvent.setup();
    render(<LiteratureScreen />);

    await user.click(screen.getByRole("radio", { name: "Themes" }));
    expect(screen.getByText("No literature themes yet")).toBeVisible();
    expect(
      screen.queryByRole("radio", { name: "NotebookLM" }),
    ).not.toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(
      /fixture project|Surrogate reliability|Bundle ready/i,
    );
  });
});
