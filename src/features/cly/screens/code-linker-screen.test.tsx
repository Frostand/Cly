import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../services/runtime", () => ({
  isClyDemoRuntime: false,
  isClyExplicitDemoRuntime: false,
}));

import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { CodeLinkerScreen } from "./research-workspaces";

const entity = {
  id: "entity-1",
  projectId: "project-cly",
  kind: "symbol",
  path: "analysis.py",
  symbol: "evaluate",
  language: "python",
  symbolKind: "function",
  lineStart: 8,
  lineEnd: 12,
  notebookCell: null,
  contentHash: "a".repeat(64),
  commitSha: "b".repeat(40),
  repositorySlug: "Frostand/science",
  stale: false,
  staleReason: null,
  createdAt: "2026-07-19T12:00:00.000Z",
  updatedAt: "2026-07-19T12:00:00.000Z",
  linkCount: 1,
  unverifiedCount: 1,
  staleLinkCount: 0,
} as const;

describe("production code linker screen", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("empty"),
      activeProjectId: "project-cly",
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("shows inferred evidence and records explicit verification", async () => {
    let verificationState: "unverified" | "verified" = "unverified";
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/code-context/entities")) {
          return new Response(
            JSON.stringify([
              {
                ...entity,
                unverifiedCount: verificationState === "unverified" ? 1 : 0,
              },
            ]),
          );
        }
        if (url.includes("/code-context?")) {
          return new Response(
            JSON.stringify({
              entity,
              links: [
                {
                  id: "link-1",
                  projectId: "project-cly",
                  codeEntityId: entity.id,
                  researchObjectId: "claim-1",
                  target: {
                    kind: "claim",
                    id: "claim-1",
                    title: "The model generalizes",
                  },
                  linkRole: "supports",
                  source: "agent-proposed",
                  origin: "agent:reviewer",
                  confidence: 0.82,
                  evidence: [
                    {
                      type: "source-location",
                      locator: "analysis.py:8",
                      description:
                        "Computes the reported generalization metric.",
                    },
                  ],
                  verificationState,
                  verifiedBy:
                    verificationState === "verified" ? "local-user" : null,
                  verifiedAt:
                    verificationState === "verified"
                      ? "2026-07-19T12:05:00.000Z"
                      : null,
                  stale: false,
                  staleReason: null,
                  createdAt: "2026-07-19T12:00:00.000Z",
                  updatedAt: "2026-07-19T12:00:00.000Z",
                },
              ],
              provenance: [],
            }),
          );
        }
        if (url.endsWith("/code-context/links/link-1/review")) {
          verificationState = "verified";
          return new Response(JSON.stringify({ id: "link-1" }));
        }
        throw new Error(`Unexpected request: ${url} ${init?.method ?? "GET"}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<CodeLinkerScreen />);

    expect(
      await screen.findByText("The model generalizes"),
    ).toBeInTheDocument();
    await user.click(screen.getByText("The model generalizes"));
    expect(
      screen.getByText(/Computes the reported generalization metric/),
    ).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Verify" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url, init]) =>
            String(url).endsWith("/code-context/links/link-1/review") &&
            init?.method === "PATCH" &&
            init.body === JSON.stringify({ verificationState: "verified" }),
        ),
      ).toBe(true),
    );
    expect(await screen.findByText("verified")).toBeInTheDocument();
  });
});
