import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { SourcesScreen } from "./research-workspaces";

describe("Source Manager literature import", () => {
  beforeEach(() => {
    useClyStore.setState({
      data: createFixtureRepository("active"),
      activeProjectId: "project-cly",
      selectedId: null,
      toasts: [],
      loadFromApi: vi.fn().mockResolvedValue(true),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("imports normalized metadata into a persisted reading list", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        if (url.endsWith("/literature/reading-lists") && !init?.method) {
          return new Response(
            JSON.stringify([
              {
                id: "list-1",
                projectId: "project-cly",
                name: "Core methods",
                description: "",
                sourceCount: 2,
                sourceIds: ["source-a", "source-b"],
                createdAt: "2026-07-14T12:00:00.000Z",
                updatedAt: "2026-07-14T12:00:00.000Z",
              },
            ]),
          );
        }
        if (url.endsWith("/literature/imports")) {
          return new Response(
            JSON.stringify({
              importedCount: 1,
              duplicateCount: 0,
              results: [
                {
                  duplicate: false,
                  matchedBy: null,
                  source: { id: "source-imported" },
                },
              ],
            }),
            { status: 201 },
          );
        }
        throw new Error(`Unexpected request: ${url}`);
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<SourcesScreen />);

    await user.click(screen.getByRole("button", { name: "Import source" }));
    expect(screen.getByLabelText("Source title")).toHaveFocus();
    await user.type(
      screen.getByLabelText("Source title"),
      "Reliable calibration",
    );
    await user.type(
      screen.getByLabelText("Authors"),
      "A. Researcher; B. Reviewer",
    );
    await user.type(screen.getByLabelText("DOI"), "10.1000/calibration");
    await user.type(
      screen.getByLabelText("Abstract"),
      "We evaluate calibration. Coverage falls under compound shift.",
    );
    await waitFor(() =>
      expect(screen.getByLabelText("Reading list")).toHaveTextContent(
        "Core methods (2)",
      ),
    );
    await user.selectOptions(screen.getByLabelText("Reading list"), "list-1");
    await user.click(screen.getByRole("button", { name: "Import and scan" }));

    await waitFor(() =>
      expect(
        screen.queryByRole("dialog", { name: "Import source" }),
      ).not.toBeInTheDocument(),
    );
    const request = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith("/literature/imports"),
    );
    expect(JSON.parse((request?.[1] as RequestInit).body as string)).toEqual({
      format: "metadata",
      records: [
        {
          title: "Reliable calibration",
          authors: "A. Researcher; B. Reviewer",
          doi: "10.1000/calibration",
          abstract:
            "We evaluate calibration. Coverage falls under compound shift.",
        },
      ],
      readingListIds: ["list-1"],
    });
    expect(useClyStore.getState().toasts.at(-1)?.title).toBe("Paper imported");
    expect(useClyStore.getState().selectedId).toBe("source-imported");
  });
});
