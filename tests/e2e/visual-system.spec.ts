import { expect, type Page, test } from "@playwright/test";

const routes = [
  ["overview", "Neural surrogate reliability"],
  ["agents", "Agent Sessions"],
  ["context", "Context Composer"],
  ["graph", "Research Object Graph"],
  ["experiments", "Experiment Manager"],
  ["sources", "Sources"],
  ["literature", "Literature"],
  ["notebooks", "Notebooks"],
  ["code", "Code Linker"],
  ["claims", "Claims"],
  ["provenance", "Provenance"],
  ["reproducibility", "Reproducibility Auditor"],
  ["decisions", "Decisions"],
  ["next-steps", "Next Steps"],
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

test("captures the route-owned claims inspector", async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await openRoute(page, "claims", "Claims");
  await expect(page.locator(".cly-shell")).toHaveAttribute(
    "data-inspector",
    "closed",
  );
  await expect(page.locator("[data-inline-inspector]")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/visual-v2/claims-inline-inspector.png",
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
    "closed",
  );
  await expect(page.locator("[data-inline-inspector]")).toBeVisible();
  await page.screenshot({
    path: "output/playwright/visual-v2/claims-inline-selection.png",
    animations: "disabled",
  });
});

test("keeps the 500-recommendation fixture responsive and virtualized", async ({
  page,
}) => {
  await chooseFixture(page, /^Large Project/);
  await openRoute(page, "next-steps", "Next Steps");
  await expect(
    page.getByRole("list", { name: "Prioritized next-step recommendations" }),
  ).toBeVisible();
  expect(await page.locator(".cly-next-step-row").count()).toBeLessThan(30);
  await page.screenshot({
    path: "output/playwright/visual-v2/next-steps-large-fixture.png",
    animations: "disabled",
  });
});

test("uses opacity-only route feedback when reduced motion is requested", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openRoute(page, "overview", "Neural surrogate reliability");
  await page.getByTestId("nav-context").click();
  await expect(
    page.getByRole("heading", { name: "Context Composer", level: 1 }),
  ).toBeVisible();
  const inlineTransform = await page
    .locator(".cly-route-transition")
    .evaluate((element) => (element as HTMLElement).style.transform);
  expect(inlineTransform).not.toContain("translate");
  await page.screenshot({
    path: "output/playwright/visual-v2/context-reduced-motion.png",
    animations: "disabled",
  });
});
