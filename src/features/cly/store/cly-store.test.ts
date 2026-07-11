import { beforeEach, describe, expect, it } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "./cly-store";

describe("Cly UI store", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      fixtureMode: "active",
      activeProjectId: "project-cly",
      activeScreen: "overview",
      selectedId: null,
      sidebarCollapsed: false,
      inspectorOpen: true,
      activityOpen: false,
      commandPaletteOpen: false,
    });
  });

  it("switches projects and navigation state", () => {
    useClyStore.getState().setActiveProject("project-cells");
    useClyStore.getState().setScreen("experiments");

    expect(useClyStore.getState().activeProjectId).toBe("project-cells");
    expect(useClyStore.getState().activeScreen).toBe("experiments");
  });

  it("updates selection and inspector state", () => {
    useClyStore.setState({ inspectorOpen: false });
    useClyStore.getState().setSelected("claim-01");

    expect(useClyStore.getState().selectedId).toBe("claim-01");
    expect(useClyStore.getState().inspectorOpen).toBe(true);
  });

  it("toggles shell regions and fixture modes", () => {
    useClyStore.getState().toggleSidebar();
    useClyStore.getState().toggleActivity();
    useClyStore.getState().setFixtureMode("empty");

    expect(useClyStore.getState().sidebarCollapsed).toBe(true);
    expect(useClyStore.getState().activityOpen).toBe(true);
    expect(useClyStore.getState().data.claims).toHaveLength(0);
  });

  it("persists context and claim mutations across feature views", () => {
    useClyStore.getState().updateContextItem("ctx-03", { included: true });
    useClyStore.getState().updateClaim("claim-03", { status: "Strong" });

    expect(
      useClyStore
        .getState()
        .data.contextItems.find((item) => item.id === "ctx-03")?.included,
    ).toBe(true);
    expect(
      useClyStore.getState().data.claims.find((item) => item.id === "claim-03")
        ?.status,
    ).toBe("Strong");
  });

  it("creates graph relationships and supersedes decisions", () => {
    useClyStore.getState().addGraphEdge({
      id: "edge-test",
      source: "src-01",
      target: "claim-01",
      relation: "supports",
      confidence: 1,
      approved: true,
    });
    useClyStore.getState().updateDecision("decision-03", {
      status: "Superseded",
      supersededBy: "decision-04",
    });

    expect(useClyStore.getState().data.graphEdges.at(-1)?.id).toBe("edge-test");
    expect(
      useClyStore
        .getState()
        .data.decisions.find((item) => item.id === "decision-03")?.supersededBy,
    ).toBe("decision-04");
  });
});
