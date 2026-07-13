import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DecisionBrief } from "../domain/types";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { DecisionsScreen } from "./integrity";

const brief: DecisionBrief = {
  id: "brief-1",
  projectId: "project-cly",
  startSequence: 0,
  cutoffSequence: 4,
  generatedBy: "facilitator",
  createdAt: "2026-07-13T12:00:00.000Z",
  pilot: {
    meetingNumber: 1,
    targetMeetings: 4,
    surfacedDecisionCount: 2,
    assignedOrResolvedCount: 0,
    assignmentOrResolutionRate: 0,
    recordedAt: "2026-07-13T12:00:00.000Z",
  },
  findings: [
    {
      id: "finding-1",
      projectId: "project-cly",
      briefId: "brief-1",
      category: "unresolved-decision",
      sortOrder: 1,
      title: "Owner needed: Calibrate the baseline",
      detail: "The changed claim needs a decision owner.",
      recommendedAction: "Assign a decision owner before the next meeting.",
      status: "open",
      owner: null,
      deferredReason: null,
      createdAt: "2026-07-13T12:00:00.000Z",
      updatedAt: "2026-07-13T12:00:00.000Z",
      evidence: [
        {
          objectId: "claim-01",
          objectTitle: "Calibrate the baseline",
          objectType: "claim",
          provenanceEventId: "event-4",
          provenanceSequence: 4,
          provenanceAction: "claim.status.updated",
        },
      ],
    },
  ],
};

describe("lab-meeting decision briefs", () => {
  beforeEach(() => {
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: createFixtureRepository("active"),
      decisionBriefs: [],
      decisionBriefsLoading: false,
      decisionBriefsError: null,
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("loads a Briefs panel, links evidence, and assigns a finding", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PATCH") {
          expect(url).toContain("/decision-briefs/brief-1/findings/finding-1");
          expect(JSON.parse(String(init.body))).toMatchObject({
            status: "assigned",
            owner: "Priya",
          });
          return new Response(
            JSON.stringify({
              ...brief.findings[0],
              status: "assigned",
              owner: "Priya",
            }),
          );
        }
        if (init?.method === "POST") {
          return new Response(
            JSON.stringify({ brief, created: true, noChanges: false }),
          );
        }
        return new Response(JSON.stringify([brief]));
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DecisionsScreen />);
    await user.click(screen.getByRole("radio", { name: "Briefs" }));

    expect(await screen.findByText("Decisions needing owners")).toBeVisible();
    await user.type(
      screen.getByLabelText("Owner for Owner needed: Calibrate the baseline"),
      "Priya",
    );
    await user.click(screen.getByRole("button", { name: "Assign" }));
    expect(await screen.findByText("assigned")).toBeVisible();
    expect(screen.getByRole("button", { name: "Event #4" })).toBeVisible();
  });
});
