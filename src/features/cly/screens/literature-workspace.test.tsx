import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { LiteratureScreen } from "./research-workspaces";

const paper = {
  id: "arxiv:2403.08901",
  provider: "arxiv",
  providerId: "2403.08901",
  title: "Credible neural surrogate models under uncertainty",
  authors: ["P. Singh", "K. Farrell-Maupin"],
  abstract: "A framework for validating surrogate models under uncertainty.",
  year: 2024,
  url: "https://arxiv.org/abs/2403.08901",
  tags: ["surrogates", "uncertainty"],
};

describe("Literature workspace", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      activeProjectId: "project-cly",
      selectedId: null,
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("supports ranked table triage, detail inspection, saving, and matrix organization", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (init?.method === "PUT") {
          return new Response(JSON.stringify({ id: "project-cly" }));
        }
        if (url.endsWith("/literature/search")) {
          return new Response(
            JSON.stringify({
              provider: "arxiv",
              reranking: {
                status: "not_configured",
                method: null,
                model: "BAAI/bge-reranker-base",
                signals: [],
              },
              papers: [paper],
            }),
          );
        }
        if (url.endsWith("/research/objects")) {
          const body = JSON.parse(init?.body as string);
          return new Response(
            JSON.stringify({
              id: "persisted-literature-source",
              projectId: "project-cly",
              type: "source",
              title: body.title,
              description: body.description,
              payload: body.payload,
              createdAt: "2026-07-12T20:00:00.000Z",
              updatedAt: "2026-07-12T20:00:00.000Z",
            }),
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<LiteratureScreen />);

    expect(
      screen.getByRole("heading", {
        name: "Search across open literature",
        level: 2,
      }),
    ).toBeVisible();
    await user.type(
      screen.getByRole("textbox", { name: "Search literature" }),
      "neural surrogate uncertainty",
    );
    await user.click(
      screen.getByRole("checkbox", {
        name: "Approve sending this project’s search queries to both destinations",
      }),
    );
    await user.click(screen.getByRole("button", { name: "Search papers" }));

    expect(await screen.findByText("Ranked literature results")).toBeVisible();
    expect(screen.getByText("Deterministic fallback")).toBeVisible();
    expect(
      screen.getByRole("heading", { name: paper.title, level: 2 }),
    ).toBeVisible();
    expect(screen.getByText(paper.abstract)).toBeVisible();

    const projectRequests = fetchMock.mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith("/api/projects/project-cly/research") &&
        (init as RequestInit | undefined)?.method === "PUT",
    );
    const lastProjectBody = JSON.parse(
      (projectRequests.at(-1)?.[1] as RequestInit).body as string,
    );
    expect(lastProjectBody.metadata.externalTransmissionApprovals).toEqual([
      "arxiv",
      "semantic-scholar",
    ]);

    await user.click(screen.getByRole("button", { name: "Save to project" }));
    expect(
      await screen.findByRole("button", { name: "Saved to project" }),
    ).toBeDisabled();

    const sourceRequest = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/research/objects"),
    );
    const sourceBody = JSON.parse(
      (sourceRequest?.[1] as RequestInit).body as string,
    );
    expect(sourceBody.payload).toMatchObject({
      provider: "arxiv",
      providerId: paper.providerId,
      query: "neural surrogate uncertainty",
      rankingMethod: "rrf:deterministic_expanded_embedding_v1",
    });

    await user.click(screen.getByRole("radio", { name: "Saved matrix" }));
    expect(screen.getByText("Saved evidence matrix")).toBeVisible();
    expect(screen.getAllByText(paper.title).length).toBeGreaterThan(0);
  });
});
