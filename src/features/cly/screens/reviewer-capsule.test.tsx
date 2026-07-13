import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createFixtureRepository } from "../fixtures/repository";
import { useClyStore } from "../store/cly-store";
import { ClaimsScreen } from "./research-workspaces";

describe("reviewer capsule workflow", () => {
  beforeEach(() => {
    useClyStore.setState({
      activeProjectId: "project-cly",
      data: createFixtureRepository("active"),
      selectedId: null,
      toasts: [],
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("builds a project-scoped preview from selected claims", async () => {
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        expect(String(input)).toBe(
          "/api/projects/project-cly/reviewer-capsule/preview",
        );
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body))).toEqual({
          claimIds: ["claim-01"],
        });
        return new Response(
          JSON.stringify({
            html: "<!doctype html><html></html>",
            sha256: "a".repeat(64),
            manifest: {
              version: 1,
              generatedAt: "2026-07-13T12:00:00.000Z",
              selectedClaimIds: ["claim-01"],
              included: [],
              omitted: [],
            },
          }),
        );
      },
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<ClaimsScreen />);
    await user.click(screen.getByRole("button", { name: "Reviewer capsule" }));
    expect(
      screen.getByRole("heading", { name: "Reviewer capsule" }),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Preview capsule" }));

    expect(await screen.findByText("Safe static preview")).toBeVisible();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
