import { expect, test } from "@playwright/test";

const destinations = [
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

test.beforeEach(async ({ page }) => {
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
    await page.getByTestId(`nav-${id}`).click();
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }

  expect(consoleProblems).toEqual([]);
});

test("completes the linked research workflow", async ({ page }) => {
  // Create a claim from the command palette.
  await page.keyboard.press("Meta+K");
  await page
    .getByRole("textbox", { name: "Search commands" })
    .fill("New Claim");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Claim Audit Board" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Detail" }).click();
  await page.getByRole("button", { name: "Link evidence" }).click();
  await expect(page.getByText("Experiment linked")).toBeVisible();

  // Add a source to a NotebookLM bundle.
  await page.getByTestId("nav-sources").click();
  await page.getByRole("row", { name: /Reliable neural surrogates/ }).click();
  await page.getByRole("button", { name: "Add to NotebookLM bundle" }).click();
  await expect(page.getByText("Added to NotebookLM bundle")).toBeVisible();

  // Import and inspect a mock notebook.
  await page.getByTestId("nav-notebooks").click();
  await page.getByRole("button", { name: "Import notebook" }).click();
  await page.getByLabel("Notebook filename").fill("review-analysis.ipynb");
  await page.getByRole("button", { name: "Import and scan" }).click();
  await expect(
    page.getByText("review-analysis.ipynb", { exact: true }),
  ).toBeVisible();
  await expect(
    page.locator("#main-workspace").getByText("Mock scan queued"),
  ).toBeVisible();

  // Compare experiments and focus an evidence path.
  await page.getByTestId("nav-experiments").click();
  await page.getByRole("button", { name: "Compare" }).click();
  await expect(page.getByText("Comparison selection")).toBeVisible();
  await page.getByTestId("nav-graph").click();
  await page
    .getByRole("button", { name: /20× speedup with decision accuracy/ })
    .click();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByText("Evidence path traced")).toBeVisible();

  // Compose context.
  await page.getByTestId("nav-context").click();
  const contextToggle = page.getByRole("switch", {
    name: "Include Raman et al. 2025",
  });
  await contextToggle.click();
  await expect(
    page.getByRole("switch", { name: "Exclude Raman et al. 2025" }),
  ).toBeChecked();
  await page.getByRole("button", { name: "Save pack" }).click();
  await expect(page.getByText("Context pack saved")).toBeVisible();

  // Save an agent preset and run an audit.
  await page.getByTestId("nav-models").click();
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Agent preset saved")).toBeVisible();
  await page.getByTestId("nav-reproducibility").click();
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByText("Simulated audit started")).toBeVisible();

  // Accept a next step.
  await page.getByTestId("nav-next-steps").click();
  await page.getByRole("button", { name: "Accept" }).first().click();
  await expect(page.getByText("Recommendation accepted")).toBeVisible();

  // Create a decision from the command palette.
  await page.keyboard.press("Meta+K");
  await page
    .getByRole("textbox", { name: "Search commands" })
    .fill("New Decision");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Research Decision Log" }),
  ).toBeVisible();
  await expect(page.getByText("Untitled decision")).toBeVisible();
});

test("supports shell controls, shortcuts, command execution, and inspector selection", async ({
  page,
}) => {
  await page.getByTestId("toggle-sidebar").click();
  await expect(page.locator(".cly-shell")).toHaveAttribute(
    "data-sidebar",
    "collapsed",
  );
  await page.keyboard.press("Meta+Alt+I");
  await expect(page.locator(".cly-shell")).toHaveAttribute(
    "data-inspector",
    "closed",
  );
  await page.keyboard.press("Meta+J");
  await expect(page.getByTestId("activity-drawer")).toHaveAttribute(
    "data-open",
    "true",
  );
  await page.keyboard.press("Meta+6");
  await expect(
    page.getByRole("heading", { name: "Claim Audit Board" }),
  ).toBeVisible();
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
  await expect(
    page.getByRole("heading", {
      name: /Calibration-aware ensembles reduce simulation cost/,
      level: 2,
    }),
  ).toBeVisible();
  await page.keyboard.press("Meta+K");
  await page
    .getByRole("textbox", { name: "Search commands" })
    .fill("Go to Sources");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Source Manager" }),
  ).toBeVisible();
});

test("captures responsive visual fixtures", async ({ page }) => {
  const sizes = [
    [1024, 700],
    [1280, 800],
    [1440, 900],
    [1728, 1117],
  ] as const;
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `output/playwright/overview-${width}x${height}.png`,
    });
  }
  await page.getByTestId("nav-graph").click();
  await page.screenshot({ path: "output/playwright/graph-large.png" });
  await page.getByTestId("nav-literature").click();
  await page.screenshot({ path: "output/playwright/literature-matrix.png" });
  await page.getByTestId("toggle-sidebar").click();
  await page.keyboard.press("Meta+J");
  await page.screenshot({
    path: "output/playwright/collapsed-sidebar-activity.png",
  });
});
