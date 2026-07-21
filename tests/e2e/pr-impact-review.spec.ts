import { expect, test } from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await navigateToResearch(page, "impact-review");
  await expect(
    page.getByRole("heading", { name: "Research impact review", level: 1 }),
  ).toBeVisible();
});

test("reviews auditable research impact and records explicit human approval", async ({
  page,
}) => {
  let approval: unknown;
  await page.route("**/pr-impact-review/approvals", async (route) => {
    approval = route.request().postDataJSON();
    await route.fulfill({
      status: 201,
      contentType: "application/json",
      body: JSON.stringify({ id: "provenance-review-1" }),
    });
  });

  for (const discipline of [
    "Software checks",
    "Methodology review",
    "Statistical review",
    "Data-leakage review",
    "Reproducibility review",
    "Claim-impact review",
  ]) {
    await expect(page.getByRole("heading", { name: discipline })).toBeVisible();
  }
  await expect(page.getByText("Partial provenance")).toBeVisible();
  await expect(
    page.getByText("No repository content transmitted"),
  ).toBeVisible();
  await expect(
    page.getByText("Inferred — review required").first(),
  ).toBeVisible();

  await page
    .getByRole("button", { name: "Review scientific conflicts" })
    .click();
  await page
    .getByLabel("Review note")
    .fill(
      "Reviewed methods, statistics, leakage, reproducibility, and claims.",
    );
  await page.getByRole("button", { name: "Record approval" }).click();
  await expect(page.getByText("Human review recorded")).toBeVisible();
  expect(approval).toMatchObject({
    actorId: "local-reviewer",
    decision: "approved",
    reviewId: "a".repeat(64),
  });
  await expect(
    page.getByText("Inferred — review required").first(),
  ).toBeVisible();
});

test("remains usable across the required desktop viewport matrix", async ({
  page,
}) => {
  for (const [width, height] of [
    [1024, 700],
    [1280, 800],
    [1440, 900],
    [1728, 1117],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(page.getByRole("button", { name: "Analyze" })).toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth - window.innerWidth,
      ),
    ).toBeLessThanOrEqual(1);
  }

  await page.getByRole("radio", { name: "Pull request" }).click();
  await expect(page.getByText("Refs must already exist locally")).toBeVisible();
  await expect(page.getByText("Base ref")).toBeVisible();
  await expect(page.getByText("Head ref")).toBeVisible();
});
