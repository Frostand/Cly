import { expect, type Page, test } from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

const mockAgentConfigurationApi = async (page: Page) => {
  await page.route("**/agent-configurations**", async (route) => {
    const request = route.request();
    const input =
      request.postDataJSON()?.configuration ?? request.postDataJSON();
    if (request.url().endsWith("/estimate")) {
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({
          inputTokens: 12_000,
          outputTokens: 4_000,
          costMinorUnits: 250,
          runtimeMs: 60_000,
          inaccessibleContext: [],
          inaccessibleTools: [],
          reasons: [],
        }),
      });
      return;
    }
    if (request.method() === "GET") {
      await route.fulfill({ contentType: "application/json", body: "[]" });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        ...input,
        id: "configuration-e2e",
        projectId: "project-cly",
        revision: 1,
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      }),
    });
  });
};

const mockContextPackApi = async (page: Page) => {
  let pack: Record<string, unknown> | null = null;
  await page.route("**/agent-context**", async (route) => {
    const request = route.request();
    if (request.method() === "PUT" && request.url().endsWith("/packs")) {
      const input = request.postDataJSON();
      pack = {
        ...input,
        id: "context-pack-e2e",
        projectId: "project-cly",
        revision: 1,
        createdAt: "2026-07-16T12:00:00.000Z",
        updatedAt: "2026-07-16T12:00:00.000Z",
      };
      await route.fulfill({
        contentType: "application/json",
        body: JSON.stringify(pack),
      });
      return;
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        items: [],
        packs: pack ? [pack] : [],
        manifests: [],
      }),
    });
  });
};

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
  ["obligations", "Research Data Obligations"],
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
    await navigateToResearch(page, id);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
  }

  expect(consoleProblems).toEqual([]);
});

test("preserves research context across Dev and restores deep links", async ({
  page,
}) => {
  await page.goto(
    "/#/cly/research/claims?project=project-cly&selected=claim-01",
  );
  await expect(
    page.getByRole("heading", { name: "Claim Audit Board", level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveURL(/research\/claims\?.*selected=claim-01/);

  await page.getByTestId("product-dev").click();
  await page.getByTestId("nav-dev-issues").click();
  await expect(page).toHaveURL(/dev\/issues\?/);

  await page.getByTestId("product-research").click();
  await expect(
    page.getByRole("heading", { name: "Claim Audit Board", level: 1 }),
  ).toBeVisible();
  await expect(page).toHaveURL(/research\/claims\?.*selected=claim-01/);

  await page.goto("/#/cly/dev/tests?project=project-cly");
  await expect(page.getByTestId("nav-dev-tests")).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(page).toHaveURL(/dev\/tests\?/);
});

test("keeps advanced routes searchable and primary navigation visible", async ({
  page,
}) => {
  for (const label of [
    "Set up",
    "Understand",
    "Build / Run",
    "Review",
    "Share",
  ]) {
    await expect(page.getByRole("navigation", { name: label })).toBeVisible();
  }

  const primaryNavigationSize = await page
    .locator(".cly-sidebar-scroll")
    .evaluate((element) => ({
      clientHeight: element.clientHeight,
      scrollHeight: element.scrollHeight,
    }));
  expect(primaryNavigationSize.scrollHeight).toBeLessThanOrEqual(
    primaryNavigationSize.clientHeight,
  );

  await page.keyboard.press("Control+K");
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await palette.getByRole("combobox").fill("Research Graph");
  await expect(palette.getByText("Go to Research Graph")).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(
    page.getByRole("heading", { name: "Research Object Graph", level: 1 }),
  ).toBeVisible();
});

test("completes the linked research workflow", async ({ page }) => {
  await mockAgentConfigurationApi(page);
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
  await page.getByRole("button", { name: "Add supporting passage" }).click();
  const evidenceDialog = page.getByRole("dialog", {
    name: "Link supporting evidence",
  });
  await evidenceDialog
    .getByLabel("Exact evidence passage")
    .fill(
      "The calibrated ensemble reduced simulation cost without lowering decision accuracy.",
    );
  await evidenceDialog
    .getByLabel("Page, section, or locator")
    .fill("Results, paragraph 2");
  await evidenceDialog.getByRole("button", { name: "Link source" }).click();
  await expect(page.getByText("Supporting evidence linked")).toBeVisible();

  // Add a source to a NotebookLM bundle.
  await page.getByTestId("nav-sources").click();
  await page.getByRole("row", { name: /Reliable neural surrogates/ }).click();
  await page.getByText("Source actions", { exact: true }).click();
  await page.getByRole("button", { name: "Add to NotebookLM bundle" }).click();
  await expect(page.getByText("Added to NotebookLM bundle")).toBeVisible();

  // Import and inspect a mock notebook.
  await navigateToResearch(page, "notebooks");
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
  await navigateToResearch(page, "graph");
  await page.getByText(/20× speedup with decision accuracy/).click();
  await page.getByRole("button", { name: "Evidence", exact: true }).click();
  await expect(page.getByText("Evidence path traced")).toBeVisible();

  // Configure an agent before composing its exact context pack.
  await navigateToResearch(page, "models");
  await page.getByRole("button", { name: "Review estimate" }).click();
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Agent configuration saved")).toBeVisible();

  // Compose context.
  await navigateToResearch(page, "context");
  const contextToggle = page.getByRole("switch", {
    name: "Include Raman et al. 2025",
  });
  await contextToggle.click();
  await expect(
    page.getByRole("switch", { name: "Exclude Raman et al. 2025" }),
  ).toBeChecked();
  await mockContextPackApi(page);
  await page.getByRole("button", { name: "Save exact pack" }).click();
  await expect(page.getByText("Exact context pack saved")).toBeVisible();

  // Run an audit.
  await page.getByTestId("nav-reproducibility").click();
  await page.getByRole("button", { name: "Run audit" }).click();
  await expect(page.getByText("Reproducibility audit complete")).toBeVisible();

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
  await page.route("**/obligations/evaluate", async (route) => {
    const operation = route.request().postDataJSON();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        projectId: "project-cly",
        decision: "allow",
        complete: true,
        evaluationHash: "evaluation-e2e",
        operation,
        alerts: [],
        approval: null,
        inheritedRestrictions: {},
        evaluatedAt: "2026-07-13T12:00:00.000Z",
      }),
    });
  });
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
  expect(requestBody).toEqual({
    claimIds: ["claim-01"],
    purpose: "peer-review",
    collaborators: [],
    residency: null,
    license: null,
  });
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

  await navigateToResearch(page, "decisions");
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
    page.getByTestId("inspector").getByRole("heading", {
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
  await navigateToResearch(page, "graph");
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
  await mockAgentConfigurationApi(page);
  await page.getByTestId("nav-sources").click();
  await page.getByLabel("Filter source type").selectOption("Paper");
  await page.getByLabel("Sort sources").selectOption("Newest");
  await expect(page.getByLabel("Filter source type")).toHaveValue("Paper");
  await expect(page.getByLabel("Sort sources")).toHaveValue("Newest");

  await navigateToResearch(page, "integrations");
  const github = page.locator(".cly-integration-catalog .cly-panel", {
    hasText: "GitHub",
  });
  await github.getByRole("button", { name: "Setup" }).click();
  await expect(page.getByText("GitHub setup")).toBeVisible();

  await navigateToResearch(page, "models");
  const firstModel = page.locator(".cly-agent-model").first();
  await firstModel.fill("Claude Sonnet");
  await expect(firstModel).toHaveValue("Claude Sonnet");
  await page.getByRole("button", { name: "Review estimate" }).click();
  await page.getByRole("button", { name: "Save configuration" }).click();
  await expect(page.getByText("Agent configuration saved")).toBeVisible();

  await page.getByTestId("nav-settings").click();
  await page.getByRole("radio", { name: "light" }).click();
  await expect(page.locator("html")).toHaveClass(/light/);
  await page.reload();
  await expect(page.locator("html")).toHaveClass(/light/);
});
