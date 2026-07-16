import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("nav-agents").click();
  await expect(
    page.getByRole("heading", { name: "Agent Sessions", level: 1 }),
  ).toBeVisible();
});

test("runs the complete fixture-backed Agent Sessions workflow", async ({
  page,
}) => {
  await expect(page.getByTestId("agent-sessions-overview")).toBeVisible();
  await expect(page).toHaveURL(/mode=overview/);

  await page.getByRole("button", { name: "New session" }).click();
  const dialog = page.getByRole("dialog", { name: "New agent session" });
  await dialog.getByLabel("Session title").fill("Submission evidence audit");
  await dialog
    .getByLabel("Session goal")
    .fill(
      "Trace the submission claim through sources, experiments, code, and generated artifacts.",
    );
  await dialog.getByLabel("Reasoning level").selectOption("High");
  await dialog.getByLabel("Agent-team preset").selectOption("Claim Audit");
  await dialog.getByRole("button", { name: /Start session/ }).click();

  await expect(page.getByTestId("agent-sessions-chat")).toBeVisible();
  await expect(page).toHaveURL(/mode=chat/);
  const composer = page.getByLabel("Message the Orchestrator");
  await composer.fill(
    "Keep the audit scoped to evidence that can be reproduced locally.",
  );
  await expect(composer).toHaveValue(
    "Keep the audit scoped to evidence that can be reproduced locally.",
  );
  await composer.press("Meta+Enter");
  await expect(
    page.getByText(
      "Keep the audit scoped to evidence that can be reproduced locally.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Implementation investigation delegated"),
  ).toBeVisible();
  await expect(page.getByText("Independent review queued")).toBeVisible();

  await page.getByRole("tab", { name: "Agents" }).click();
  await expect(
    page.getByText("Codex Implementation Agent").last(),
  ).toBeVisible();
  await expect(page.getByText("Reviewer Agent").last()).toBeVisible();
  const steer = page.getByLabel("Steer Codex Implementation Agent");
  await steer.fill("Check the asymmetric-sample regression before handoff");
  await page
    .getByRole("button", { name: "Send steer to Codex Implementation Agent" })
    .click();
  await expect(page.getByText("Steer message sent")).toBeVisible();
  await page.getByRole("radio", { name: "topology" }).click();
  await expect(page.getByLabel("Agent delegation graph")).toBeVisible();
  await page.getByRole("radio", { name: "tiled" }).click();

  await page.getByRole("tab", { name: "Tests" }).click();
  await expect(page.getByLabel("Fixture terminal output")).toBeVisible();
  await expect(page.getByText(/calibration\.test\.ts/)).toBeVisible();

  await page.getByRole("tab", { name: "Calibration paper" }).click();
  await expect(page.getByLabel("Research browser fixture")).toBeVisible();
  await page.getByRole("button", { name: "Add page as source" }).click();
  await expect(
    page.getByRole("button", { name: "Source added" }),
  ).toBeDisabled();

  await page.getByRole("tab", { name: "Live Files" }).click();
  await expect(page.getByLabel("Live file observation")).toBeVisible();
  await expect(
    page.getByText(/Editing src\/evaluation\/calibration\.py/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Open corresponding diff" }).click();
  await expect(
    page.getByLabel("Diff for src/evaluation/calibration.py"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("approved")).toBeVisible();

  const separator = page.getByRole("separator", {
    name: "Resize chat and workbench",
  });
  await separator.focus();
  await separator.press("ArrowLeft");
  await page.getByRole("button", { name: "Collapse workbench" }).click();
  await expect(
    page.getByRole("button", { name: "Expand workbench" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Expand workbench" }).click();

  await page
    .getByTestId("agent-sessions-chat")
    .getByRole("radio", { name: "overview" })
    .click();
  await expect(page.getByTestId("agent-sessions-overview")).toBeVisible();
  const createdRow = page.getByRole("article", {
    name: /Submission evidence audit/,
  });
  await expect(createdRow).toContainText("7%");
  await createdRow.getByRole("button", { name: /Open chat/ }).click();
  await expect(composer).toBeVisible();
  await expect(
    page.getByText(
      "Keep the audit scoped to evidence that can be reproduced locally.",
    ),
  ).toBeVisible();

  await page
    .getByLabel("Switch agent session")
    .selectOption({ label: "Plan compute-matched baseline" });
  await expect(
    page.getByText("Approval required · high-cost experiment"),
  ).toBeVisible();
  await page.getByRole("button", { name: "Approve" }).click();
  await expect(page.getByText("approved")).toBeVisible();
});

test("keeps chat and delegated-agent panes independently scrollable", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1180, height: 720 });
  await page
    .getByRole("article", { name: /Audit primary claim evidence/ })
    .getByRole("button", { name: /Open chat/ })
    .click();

  const transcript = page.locator(".agent-transcript");
  const transcriptMetrics = await transcript.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
  }));
  expect(transcriptMetrics.scrollHeight).toBeGreaterThan(
    transcriptMetrics.clientHeight,
  );
  await transcript.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => transcript.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  await page.getByRole("tab", { name: "Agents" }).click();
  const separator = page.getByRole("separator", {
    name: "Resize chat and workbench",
  });
  await separator.focus();
  await separator.press("ArrowRight");

  const grid = page.locator(".agent-agent-grid");
  const gridMetrics = await grid.evaluate((element) => ({
    clientHeight: element.clientHeight,
    scrollHeight: element.scrollHeight,
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(gridMetrics.scrollHeight).toBeGreaterThan(gridMetrics.clientHeight);
  expect(gridMetrics.scrollWidth).toBeLessThanOrEqual(gridMetrics.clientWidth);
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  await expect
    .poll(() => grid.evaluate((element) => element.scrollTop))
    .toBeGreaterThan(0);

  const panesFit = await page.locator(".agent-pane").evaluateAll((panes) => {
    const gridRect = document
      .querySelector(".agent-agent-grid")
      ?.getBoundingClientRect();
    return panes.every((pane) => {
      const rect = pane.getBoundingClientRect();
      return (
        !!gridRect &&
        rect.left >= gridRect.left &&
        rect.right <= gridRect.right + 1
      );
    });
  });
  expect(panesFit).toBe(true);
  const paneWidths = await page
    .locator(".agent-pane")
    .evaluateAll((panes) =>
      panes.map((pane) => pane.getBoundingClientRect().width),
    );
  expect(Math.min(...paneWidths)).toBeGreaterThanOrEqual(270);

  await page.getByTestId("toggle-sidebar").click();
  await expect(page.locator(".cly-sidebar-group-label")).toHaveCount(0);
});

test("validates Cly Dev identity, workspace ownership, restoration, and fallback states", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 1024, height: 700 });
  await page.keyboard.press("Control+Shift+O");
  const projectSwitcher = page.getByRole("dialog", {
    name: "Project switcher",
  });
  await expect(projectSwitcher).toBeVisible();
  await projectSwitcher
    .getByRole("button", { name: /Cell morphology atlas/ })
    .press("Enter");
  await expect(page.getByTestId("project-switcher")).toContainText(
    "Cell morphology atlas",
  );
  await page.keyboard.press("Control+Shift+O");
  await page
    .getByRole("dialog", { name: "Project switcher" })
    .getByRole("button", { name: /Neural surrogate reliability/ })
    .press("Enter");
  await page.getByTestId("fixture-selector").click();
  await page
    .getByRole("button", { name: /^Active Project Coherent linked/ })
    .click();
  await page
    .getByRole("article", { name: /Audit primary claim evidence/ })
    .getByRole("button", { name: /Open chat/ })
    .click();

  const identity = page.getByRole("region", { name: "Task identity" });
  await expect(identity).toBeVisible();
  for (const label of [
    "Project",
    "Repository",
    "Workspace",
    "Machine",
    "Provider",
    "Budget",
    "Objective",
    "Research impact",
  ]) {
    const group = identity.getByRole("group", { name: label });
    await expect(group).toBeVisible();
    const box = await group.boundingBox();
    expect(box?.y ?? 701).toBeLessThan(700);
  }

  await page.getByRole("radio", { name: "Agent only" }).press("Space");
  await expect(page.getByLabel("Session workbench")).toHaveCount(0);
  await expect(page.getByLabel("Message the Orchestrator")).toBeVisible();
  await page.getByRole("button", { name: "Inspect tests" }).click();
  await expect(
    page.getByRole("region", { name: "Test inspection" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Inspect diff" }).click();
  await expect(
    page.getByRole("region", { name: "Diff inspection" }),
  ).toBeVisible();

  await page.getByRole("radio", { name: "Inline workspace" }).click();
  await page
    .getByRole("button", { name: "Detach workspace (prototype)" })
    .click();
  await expect(
    page.getByTestId("agent-sessions-chat").getByRole("status"),
  ).toContainText("Detached workspace intent recorded");
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Reattach workspace (prototype)" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Reattach workspace (prototype)" })
    .click();
  await expect(page.getByLabel("Session workbench")).toBeVisible();

  await page
    .getByLabel("Switch agent session")
    .selectOption({ label: "Review OOD notebook" });
  await expect(
    page.getByTestId("agent-sessions-chat").getByRole("status"),
  ).toContainText("Offline");
  await expect(page.getByRole("button", { name: "Resume task" })).toBeVisible();

  await page.getByTestId("fixture-selector").click();
  await page
    .getByRole("button", { name: /^Integration Errors Partial data/ })
    .click();
  await page
    .getByRole("article", { name: /Audit primary claim evidence/ })
    .getByRole("button", { name: /Open chat/ })
    .click();
  await expect(
    page.getByTestId("agent-sessions-chat").getByRole("alert"),
  ).toContainText("Delegated agent failed");

  await page.getByTestId("fixture-selector").click();
  await page
    .getByRole("button", { name: /^Empty No research objects/ })
    .click();
  await page.getByRole("radio", { name: "chat" }).press("Enter");
  await expect(page.getByTestId("agent-chat-empty")).toBeVisible();
});

test("captures Agent Sessions visual regression fixtures", async ({ page }) => {
  test.setTimeout(60_000);
  const sizes = [
    [1024, 700],
    [1280, 800],
    [1440, 900],
    [1728, 1117],
  ] as const;

  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `output/playwright/agent-overview-${width}x${height}.png`,
      fullPage: true,
    });
  }

  await page.getByRole("tab", { name: /History/ }).click();
  await page.screenshot({
    path: "output/playwright/agent-overview-history.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Approvals/ }).click();
  await page.screenshot({
    path: "output/playwright/agent-overview-approval.png",
    fullPage: true,
  });
  await page.getByRole("tab", { name: /Active/ }).click();

  await page
    .getByRole("article", { name: /Audit primary claim evidence/ })
    .getByRole("button", { name: /Open chat/ })
    .click();
  await expect(
    page.getByRole("region", { name: "Task identity" }),
  ).toBeVisible();
  for (const [width, height] of sizes) {
    await page.setViewportSize({ width, height });
    await page.screenshot({
      path: `output/playwright/agent-chat-active-${width}x${height}.png`,
      fullPage: true,
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });

  for (const [tabName, fileName] of [
    ["Calibration paper", "agent-browser.png"],
    ["Tests", "agent-terminal.png"],
    ["Code Diff", "agent-code-diff.png"],
    ["Live Files", "agent-live-files.png"],
  ] as const) {
    await page.getByRole("tab", { name: tabName }).click();
    await page.screenshot({
      path: `output/playwright/${fileName}`,
      fullPage: true,
    });
  }

  await page.getByRole("tab", { name: "Agents" }).click();
  await page.screenshot({
    path: "output/playwright/agent-multi-agent.png",
    fullPage: true,
  });
  await page.getByRole("radio", { name: "topology" }).click();
  await expect(page.getByLabel("Agent delegation graph")).toBeVisible();
  await page.waitForTimeout(600);
  await page.screenshot({
    path: "output/playwright/agent-topology.png",
    fullPage: true,
  });
  await page.getByRole("radio", { name: "tiled" }).click();
  await page.getByRole("button", { name: "Collapse workbench" }).click();
  await page.screenshot({
    path: "output/playwright/agent-workbench-collapsed.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Expand workbench" }).click();
  await page.getByRole("button", { name: "Maximize workbench" }).click();
  await page.screenshot({
    path: "output/playwright/agent-workbench-maximized.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Restore workbench" }).click();

  await page
    .getByLabel("Switch agent session")
    .selectOption({ label: "Plan compute-matched baseline" });
  await page.screenshot({
    path: "output/playwright/agent-chat-approval.png",
    fullPage: true,
  });

  await page.getByTestId("fixture-selector").click();
  await page
    .getByRole("button", { name: /^Integration Errors Partial data/ })
    .click();
  await page
    .getByRole("article", { name: /Audit primary claim evidence/ })
    .getByRole("button", { name: /Open chat/ })
    .click();
  await page.screenshot({
    path: "output/playwright/agent-failed-delegated-agent.png",
    fullPage: true,
  });

  await page.getByTestId("fixture-selector").click();
  await page
    .getByRole("button", { name: /^Empty No research objects/ })
    .click();
  await page.screenshot({
    path: "output/playwright/agent-overview-empty.png",
    fullPage: true,
  });
  await page.getByRole("radio", { name: "chat" }).click();
  await page.screenshot({
    path: "output/playwright/agent-chat-empty.png",
    fullPage: true,
  });
});
