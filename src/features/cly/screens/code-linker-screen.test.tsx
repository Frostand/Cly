import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";

import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { CodeLinkerScreen } from "./research-workspaces";

describe("production code linker screen", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("empty"),
      activeProjectId: "project-cly",
      toasts: [],
    });
  });

  it("shows a truthful empty state before the user's project is indexed", () => {
    render(<CodeLinkerScreen />);

    expect(
      screen.getByRole("heading", { name: "No code artifacts indexed" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/does not have any persisted code scan results/),
    ).toBeVisible();
  });
});
