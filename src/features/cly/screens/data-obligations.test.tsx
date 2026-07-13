import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { DataObligationsScreen } from "./data-obligations";

const obligation = {
  id: "obligation-a",
  projectId: "project-cly",
  datasetObjectId: "src-03",
  datasetTitle: "Cylinder-flow reference trajectories v2",
  consentProtocolScope: "Approved benchmark research",
  approvedPurposes: ["peer-review"],
  permittedCollaborators: [],
  externalProcessing: "review",
  permittedProviders: ["openai"],
  residency: ["US"],
  retentionExpiresAt: "2027-06-01",
  deletionDueAt: "2027-07-01",
  license: "CC-BY-4.0",
  owner: "Dataset steward",
  reviewDate: "2026-10-01",
  provenanceSource: "Dataset license",
  notes: "",
  revision: 1,
  createdBy: "local-user",
  updatedBy: "local-user",
  createdAt: "2026-07-13T12:00:00.000Z",
  updatedAt: "2026-07-13T12:00:00.000Z",
};

const apiSummary = {
  obligations: [obligation],
  alerts: [],
  inheritedRestrictions: {},
};

describe("data obligations screen", () => {
  beforeEach(() => {
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: createFixtureRepository("active"),
      datasetObligations: [],
      obligationAlerts: [],
      inheritedRestrictions: {},
      obligationsLoading: false,
      obligationsError: null,
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("edits every obligation group and persists a revision", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "PUT") {
          return new Response(
            JSON.stringify({
              ...obligation,
              revision: 2,
              owner: "New steward",
            }),
          );
        }
        return new Response(
          JSON.stringify({
            ...apiSummary,
            obligations:
              fetchMock.mock.calls.filter(
                ([, options]) => options?.method === "PUT",
              ).length > 0
                ? [{ ...obligation, revision: 2, owner: "New steward" }]
                : [obligation],
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<DataObligationsScreen />);
    expect(
      await screen.findByDisplayValue("Approved benchmark research"),
    ).toBeVisible();
    await user.clear(screen.getByLabelText("Owner"));
    await user.type(screen.getByLabelText("Owner"), "New steward");
    await user.click(screen.getByRole("button", { name: "Save obligation" }));

    expect(await screen.findByText(/Revision 2/)).toBeVisible();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-cly/datasets/src-03/obligation",
      expect.objectContaining({ method: "PUT" }),
    );
    expect(screen.getByText(/does not provide legal advice/i)).toBeVisible();
  });
});
