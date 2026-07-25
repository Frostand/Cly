import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { createAgentSessionFixtures } from "../agent-sessions/fixtures";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import {
  boardCardsFromFixtureSessions,
  ClyDevBoardScreen,
  groupBoardCards,
} from "./dev-board";

describe("Cly Dev board", () => {
  beforeEach(() => {
    const data = createFixtureRepository("active");
    useClyStore.setState({
      data,
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeProduct: "dev",
      activeScreen: "dev",
      activeDevSection: "board",
      clyDevSessions: [],
      clyDevSessionsLoading: false,
      clyDevSessionsError: null,
      agentSessionsMode: "overview",
      selectedAgentSessionId: null,
    });
  });

  it("groups live sessions into active, attention, and finished lanes", () => {
    const grouped = groupBoardCards(
      boardCardsFromFixtureSessions(createAgentSessionFixtures()),
    );

    expect(grouped.active.map((card) => card.id)).toEqual(["session-01"]);
    expect(grouped.attention.map((card) => card.id)).toEqual(["session-02"]);
    expect(grouped.finished.map((card) => card.id)).toEqual(["session-03"]);
    expect(grouped.attention[0].attention).toBe("1 approval needed");
  });

  it("filters the board and opens the selected session in the in-app workspace", async () => {
    const user = userEvent.setup();
    render(<ClyDevBoardScreen />);

    const board = screen.getByRole("region", { name: "Agent session board" });
    expect(
      within(board).getByRole("heading", { name: /Active/ }),
    ).toBeVisible();
    expect(
      within(board).getByRole("heading", { name: /Attention/ }),
    ).toBeVisible();
    expect(
      within(board).getByRole("heading", { name: /Finished/ }),
    ).toBeVisible();

    await user.type(screen.getByLabelText("Search board sessions"), "baseline");
    expect(
      screen.getByRole("button", {
        name: "Open Plan compute-matched baseline session",
      }),
    ).toBeVisible();
    expect(
      screen.queryByRole("button", {
        name: "Open Audit primary claim evidence session",
      }),
    ).not.toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search board sessions"));
    await user.click(
      screen.getByRole("button", {
        name: "Open Audit primary claim evidence session",
      }),
    );
    expect(useClyStore.getState()).toMatchObject({
      activeScreen: "agents",
      agentSessionsMode: "chat",
      selectedAgentSessionId: "session-01",
    });
  });
});
