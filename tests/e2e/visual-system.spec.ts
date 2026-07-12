import { expect, type Page, test } from "@playwright/test";

const routes = [
  ["overview", "Neural surrogate reliability"],
  ["agents", "Agent Sessions"],
  ["context", "Context Composer"],
  ["graph", "Research Object Graph"],
  ["experiments", "Experiment Manager"],
  ["sources", "Source Manager"],
  ["literature", "Literature Workspace"],
  ["notebooks", "Notebook Scanner"],
  ["code", "Code-to-Research Linker"],
  ["claims", "Claim Audit Board"],
  ["provenance", "Figure & Table Provenance"],
  ["reproducibility", "Reproducibility Auditor"],
  ["decisions", "Research Decision Log"],
  ["next-steps", "Next-Step Planner"],
  ["integrations", "Integrations & Providers"],
  ["models", "Models & Agents"],
  ["settings", "Settings"],
] as const;

const dataRoutes = routes.filter(
  ([id]) => id !== "agents" && id !== "settings",
);

async function chooseFixture(page: Page, label: RegExp) {
  await page.getByTestId("fixture-selector").click();
  await page.getByRole("button", { name: label }).click();
}

async function openRoute(page: Page, id: string, heading: string) {
  await page.getByTestId(`nav-${id}`).click();
  await expect(
    page.getByRole("heading", { name: heading, level: 1 }),
  ).toBeVisible();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(1);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveTitle("Cly");
});

test("captures every route at large and narrow desktop sizes", async ({
  page,
}) => {
  test.setTimeout(120_000);
  for (const [width, height, suffix] of [
    [1728, 1117, "large"],
    [1024, 700, "narrow"],
  ] as const) {
    await page.setViewportSize({ width, height });
    for (const [id, heading] of routes) {
      await openRoute(page, id, heading);
      await page.screenshot({
        path: `output/playwright/visual-v2/${id}-populated-${suffix}.png`,
        animations: "disabled",
      });
    }
  }
});

test("captures empty and relevant error states without overflow", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 1280, height: 800 });
  await chooseFixture(page, /^Empty No research objects yet/);
  for (const [id, heading] of dataRoutes) {
    await openRoute(page, id, heading);
    await page.screenshot({
      path: `output/playwright/visual-v2/${id}-empty.png`,
      animations: "disabled",
    });
  }

  await chooseFixture(page, /^Integration Errors/);
  for (const [id, heading] of routes.filter(([id]) =>
    ["overview", "agents", "reproducibility", "integrations"].includes(id),
  )) {
    await openRoute(page, id, heading);
    await page.screenshot({
      path: `output/playwright/visual-v2/${id}-error.png`,
      animations: "disabled",
    });
  }
});

test("captures contextual inspector closed and open", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, "claims", "Claim Audit Board");
  await expect(page.locator(".cly-shell")).toHaveAttribute(
    "data-inspector",
    "closed",
  );
  await page.screenshot({
    path: "output/playwright/visual-v2/claims-inspector-closed.png",
    animations: "disabled",
  });

  await page
    .getByText("Calibration-aware ensembles reduce simulation cost", {
      exact: false,
    })
    .first()
    .click();
  await expect(page.locator(".cly-shell")).toHaveAttribute(
    "data-inspector",
    "open",
  );
  await page.screenshot({
    path: "output/playwright/visual-v2/claims-inspector-open.png",
    animations: "disabled",
  });
});

test("keeps the 500-recommendation fixture responsive and virtualized", async ({
  page,
}) => {
  await chooseFixture(page, /^Large Project/);
  await openRoute(page, "next-steps", "Next-Step Planner");
  await expect(
    page.getByRole("list", { name: "Prioritized next-step recommendations" }),
  ).toBeVisible();
  expect(await page.locator(".cly-next-step-row").count()).toBeLessThan(30);
  await page.screenshot({
    path: "output/playwright/visual-v2/next-steps-large-fixture.png",
    animations: "disabled",
  });
});
