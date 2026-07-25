import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-impact-review").click();
  await expect(
    page.getByRole("heading", { name: "Research impact review", level: 1 }),
  ).toBeVisible();
});

test("requires a user-selected local repository before impact review", async ({
  page,
}) => {
  await expect(
    page.getByRole("heading", { name: "Connect a local repository" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Analyze" })).toBeDisabled();
  await expect(
    page.getByText("No repository content transmitted"),
  ).toBeVisible();
  await expect(page.getByText(/will not scan or transmit/i)).toBeVisible();
  await expect(page.getByText(/Research\/cly|\/Users\//)).toHaveCount(0);
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
