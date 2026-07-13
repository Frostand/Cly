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
  ["costs", "Cost ledger"],
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
  await page.getByTestId("global-search").click();
  await page
    .getByRole("combobox", { name: "Command palette" })
    .fill("New Claim");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Claim Audit Board" }),
  ).toBeVisible();
  await page.getByRole("radio", { name: "Detail" }).click();
  await page.getByRole("button", { name: "Link evidence" }).click();
  await expect(page.getByText("Experiment linked")).toBeVisible();

  // Add a source to a NotebookLM bundle.
  await page.getByTestId("nav-sources").click();
  await page.getByRole("row", { name: /Reliable neural surrogates/ }).click();
  await page.getByText("Source actions", { exact: true }).click();
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
  await page.getByRole("radio", { name: "Compare" }).click();
  await expect(page.getByText("Comparison selection")).toBeVisible();
  await page.getByTestId("nav-graph").click();
  await page.getByText(/20× speedup with decision accuracy/).click();
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
  await page.getByTestId("global-search").click();
  await page
    .getByRole("combobox", { name: "Command palette" })
    .fill("New Decision");
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Research Decision Log" }),
  ).toBeVisible();
  await expect(page.getByText("Untitled decision")).toBeVisible();
});

test("previews a project-scoped reviewer capsule from the Claims workspace", async ({
  page,
}) => {
  let requestBody: unknown;
  await page.route("**/reviewer-capsule/preview", async (route) => {
    requestBody = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        html: '<!doctype html><html lang="en"></html>',
        sha256: "a".repeat(64),
        manifest: {
          version: 1,
          generatedAt: "2026-07-13T12:00:00.000Z",
          selectedClaimIds: ["claim-01"],
          included: [],
          omitted: [],
        },
      }),
    });
  });

  await page.getByTestId("nav-claims").click();
  await page.getByRole("button", { name: "Reviewer capsule" }).click();
  await expect(
    page.getByRole("heading", { name: "Reviewer capsule" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Preview capsule" }).click();

  await expect(page.getByText("Safe static preview")).toBeVisible();
  expect(requestBody).toEqual({ claimIds: ["claim-01"] });
});

test("generates and assigns an evidence-linked lab-meeting brief in Decisions", async ({
  page,
}) => {
  const brief = {
    id: "brief-e2e",
    projectId: "project-cly",
    startSequence: 0,
    cutoffSequence: 8,
    generatedBy: "local-user",
    createdAt: "2026-07-13T12:00:00.000Z",
    pilot: {
      meetingNumber: 1,
      targetMeetings: 4,
      surfacedDecisionCount: 1,
      assignedOrResolvedCount: 0,
      assignmentOrResolutionRate: 0,
      recordedAt: "2026-07-13T12:00:00.000Z",
    },
    findings: [
      {
        id: "finding-e2e",
        projectId: "project-cly",
        briefId: "brief-e2e",
        category: "unresolved-decision",
        sortOrder: 1,
        title: "Owner needed: baseline decision",
        detail: "A changed claim needs an owner.",
        recommendedAction: "Assign an owner.",
        status: "open",
        owner: null,
        deferredReason: null,
        createdAt: "2026-07-13T12:00:00.000Z",
        updatedAt: "2026-07-13T12:00:00.000Z",
        evidence: [
          {
            objectId: "claim-01",
            objectTitle: "Baseline decision",
            objectType: "claim",
            provenanceEventId: "event-e2e",
            provenanceSequence: 8,
            provenanceAction: "claim.status.updated",
          },
        ],
      },
    ],
  };
  await page.route("**/decision-briefs**", async (route) => {
    const method = route.request().method();
    if (method === "PATCH") {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          ...brief.findings[0],
          status: "assigned",
          owner: "Priya",
        }),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(
        method === "POST"
          ? { brief, created: true, noChanges: false }
          : [brief],
      ),
    });
  });

  await page.getByTestId("nav-decisions").click();
  await page.getByRole("radio", { name: "Briefs" }).click();
  await expect(page.getByText("Decisions needing owners")).toBeVisible();
  await page
    .getByLabel("Owner for Owner needed: baseline decision")
    .fill("Priya");
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("assigned", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Event #8" })).toBeVisible();
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
  await page.getByTestId("global-search").click();
  await page
    .getByRole("combobox", { name: "Command palette" })
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

test("filters and sorts data, configures providers, and persists preferences", async ({
  page,
}) => {
  await page.getByTestId("nav-sources").click();
  await page.getByLabel("Filter source type").selectOption("Paper");
  await page.getByLabel("Sort sources").selectOption("Newest");
  await expect(page.getByLabel("Filter source type")).toHaveValue("Paper");
  await expect(page.getByLabel("Sort sources")).toHaveValue("Newest");

  await page.getByTestId("nav-integrations").click();
  const github = page.locator(".cly-integration-catalog .cly-panel", {
    hasText: "GitHub",
  });
  await github.getByRole("button", { name: "Setup" }).click();
  await expect(page.getByText("GitHub setup")).toBeVisible();

  await page.getByTestId("nav-models").click();
  const firstModel = page.locator(".cly-agent-model").first();
  await firstModel.selectOption({ label: "Claude Sonnet" });
  await expect(firstModel).toHaveValue("Claude Sonnet");
  await page.getByRole("button", { name: "Save preset" }).click();
  await expect(page.getByText("Agent preset saved")).toBeVisible();

  await page.getByTestId("nav-settings").click();
  await page.getByRole("radio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});
