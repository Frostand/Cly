import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  emptyPrImpactReviewFixture,
  populatedPrImpactReviewFixture,
} from "./fixtures";
import { PrImpactReviewScreen } from "./pr-impact-review";

describe("pull request impact review workspace", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("renders loading, error, and empty states", () => {
    const { rerender } = render(
      <PrImpactReviewScreen initialState="loading" />,
    );
    expect(
      screen.getByRole("status", { name: "Analyzing research impact" }),
    ).toBeVisible();

    rerender(<PrImpactReviewScreen initialState="error" />);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Impact review unavailable",
    );

    rerender(
      <PrImpactReviewScreen
        initialState="ready"
        initialReview={emptyPrImpactReviewFixture}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent(
      "No research impact detected",
    );
  });

  it("shows partial provenance and keeps all review disciplines separate", () => {
    render(
      <PrImpactReviewScreen
        initialState="ready"
        initialReview={populatedPrImpactReviewFixture}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Research impact review" }),
    ).toBeVisible();
    for (const heading of [
      "Software checks",
      "Methodology review",
      "Statistical review",
      "Data-leakage review",
      "Reproducibility review",
      "Claim-impact review",
    ]) {
      expect(screen.getByRole("heading", { name: heading })).toBeVisible();
    }
    expect(screen.getByText("Partial provenance")).toBeVisible();
    expect(screen.getAllByText("Verified").length).toBeGreaterThan(0);
    expect(
      screen.getAllByText("Inferred — review required").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByText("analysis/discordance.py").length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("2222222").length).toBeGreaterThan(0);
    expect(
      screen.getByText(/does not establish scientific correctness/i),
    ).toBeVisible();
  });

  it("records an explicit human decision without upgrading inferred links", async () => {
    const fetchMock = vi.fn(
      async (_input: RequestInfo | URL, _init?: RequestInit) =>
        new Response(JSON.stringify({ id: "provenance-1" }), { status: 201 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(
      <PrImpactReviewScreen
        initialState="ready"
        initialReview={populatedPrImpactReviewFixture}
      />,
    );

    await user.click(
      screen.getByRole("button", { name: "Review scientific conflicts" }),
    );
    await user.type(
      screen.getByLabelText("Review note"),
      "Reviewed methodology, statistics, leakage, and claim impact.",
    );
    await user.click(screen.getByRole("button", { name: "Record approval" }));

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/projects/project-cly/pr-impact-review/approvals",
      expect.objectContaining({ method: "POST" }),
    );
    expect(
      JSON.parse(String(fetchMock.mock.calls[0]?.[1]?.body)),
    ).toMatchObject({
      actorId: "local-reviewer",
      decision: "approved",
      reviewId: "a".repeat(64),
    });
    expect(await screen.findByText("Human review recorded")).toBeVisible();
    expect(
      screen.getAllByText("Inferred — review required").length,
    ).toBeGreaterThan(0);
  });
});
