import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { ClyAppShell } from "./app-shell";

vi.mock("../../../components/ide/ide-shell", () => ({
  IdeShell: ({ embedded }: { embedded?: boolean }) => (
    <div data-embedded={embedded ? "true" : "false"}>Live AI workspace</div>
  ),
}));

describe("Cly Dev live workspace", () => {
  beforeEach(() => {
    localStorage.clear();
    useClyStore.setState({
      activeProduct: "research",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      loadFromApi: vi.fn().mockResolvedValue(true),
      selectedId: null,
    });
  });

  it("opens the real embedded coding-agent workspace from the Dev product", async () => {
    const user = userEvent.setup();
    render(<ClyAppShell />);

    await user.click(screen.getByTestId("product-dev"));

    expect(screen.getByText("Live AI workspace")).toHaveAttribute(
      "data-embedded",
      "true",
    );
  });
});
