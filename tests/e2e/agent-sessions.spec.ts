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
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({
    path: "output/playwright/agent-chat-active-1440x900.png",
    fullPage: true,
  });

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
