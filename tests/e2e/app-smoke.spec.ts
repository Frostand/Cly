import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";

const routeManifest = JSON.parse(
  readFileSync(
    path.join(process.cwd(), "src/features/cly/route-manifest.json"),
    "utf8",
  ),
) as { id: string; label: string; heading: string }[];

import { installProviderModelsFixture } from "./provider-models-fixture";

const destinations = routeManifest.map(
  ({ id, heading }) => [id, heading] as const,
);

test.beforeEach(async ({ page }) => {
  await installProviderModelsFixture(page);
  await page.route("**/projects/project-cly/obligations", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        obligations: [],
        alerts: [],
        inheritedRestrictions: {},
      }),
    });
  });
  await page.goto("/");
  await expect(page).toHaveTitle("Cly");
  await expect(
    page.getByRole("heading", {
      name: "Neural surrogate reliability",
      level: 1,
    }),
  ).toBeVisible();
});

test("launches Cly and navigates every major destination", async ({ page }) => {
  const consoleProblems: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error" || message.type() === "warning") {
      consoleProblems.push(message.text());
    }
  });

  for (const [id, heading] of destinations) {
    if (id === "dev") {
      await page.getByTestId("product-dev").click();
      await expect(page.getByRole("region", { name: heading })).toBeVisible();
      continue;
    }
    await page.getByTestId("product-research").click();
    await page.getByTestId(`nav-${id}`).click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }

  expect(consoleProblems).toEqual([]);
});
