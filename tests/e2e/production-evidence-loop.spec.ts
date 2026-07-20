import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import { navigateToResearch } from "./navigation-helpers";

const root = process.cwd();
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("completes and recovers the production evidence loop with demos disabled", async () => {
  test.setTimeout(90_000);
  const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-production-e2e-"));
  const suffix = Date.now().toString(36);
  const claimTitle = `Production evidence claim ${suffix}`;
  const experimentTitle = `Production evidence experiment ${suffix}`;
  const sourceTitle = `Production evidence source ${suffix}`;
  const supportingQuote =
    "The production evidence chain remains durable after a complete restart.";
  const contradictoryQuote =
    "A boundary condition may reduce the reported effect in external cohorts.";

  execFileSync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: { ...process.env, VITE_CLY_DEMO_MODE: "0" },
    stdio: "ignore",
  });

  const launch = () =>
    electron.launch({
      args: [...electronArgs, path.join(root, "electron/main.js")],
      cwd: root,
      env: {
        ...process.env,
        NODE_ENV: "production",
        CLY_E2E: "1",
        CLY_E2E_USER_DATA_PATH: userDataPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        VITE_CLY_DEMO_MODE: "0",
      },
    });

  let app = await launch();
  try {
    let window = await app.firstWindow();
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await expect(window.getByTestId("fixture-selector")).toHaveCount(0);

    await window.getByTestId("nav-agents").click();
    await expect(
      window.getByRole("heading", { name: "Agent Sessions", level: 1 }),
    ).toBeVisible();
    await expect(window.getByText("No agent sessions")).toBeVisible();

    await navigateToResearch(window, "notebooks");
    await expect(
      window.getByRole("button", { name: "Import notebook" }).first(),
    ).toBeDisabled();

    await window.getByTestId("nav-claims").click();
    await window.getByRole("button", { name: "New claim" }).click();
    const claimDialog = window.getByRole("dialog", {
      name: "New research claim",
    });
    await claimDialog.getByRole("textbox", { name: "Claim" }).fill(claimTitle);
    await claimDialog.getByRole("button", { name: "Create claim" }).click();
    await expect(
      window
        .locator("#main-workspace")
        .getByText(claimTitle, { exact: true })
        .first(),
    ).toBeVisible();

    await window.getByTestId("nav-experiments").click();
    await window
      .getByRole("button", { name: "New experiment" })
      .first()
      .click();
    const experimentDialog = window.getByRole("dialog", {
      name: "New experiment",
    });
    await experimentDialog.getByLabel("Name").fill(experimentTitle);
    await experimentDialog
      .getByLabel("Research goal")
      .fill("Verify durable, project-scoped evidence relationships.");
    await experimentDialog
      .getByRole("button", { name: "Create experiment" })
      .click();
    await expect(window.getByText("Experiment created")).toBeVisible();

    await window.getByTestId("nav-claims").click();
    await window
      .locator("#main-workspace")
      .getByText(claimTitle, { exact: true })
      .first()
      .click();
    await window.getByRole("radio", { name: "Detail" }).click();
    await window.getByRole("button", { name: "Link experiment" }).click();
    await expect(window.getByText("Experiment linked")).toBeVisible();

    await window.getByTestId("nav-sources").click();
    await window.getByRole("button", { name: "Import source" }).first().click();
    const sourceDialog = window.getByRole("dialog", {
      name: "Import source",
    });
    await sourceDialog.getByLabel("Source title").fill(sourceTitle);
    await sourceDialog.getByRole("button", { name: "Import and scan" }).click();
    const sourceRecord = window
      .locator("#main-workspace")
      .getByText(sourceTitle, { exact: true })
      .first();
    await expect(sourceRecord).toBeVisible();
    await window.getByTestId("nav-claims").click();
    await window
      .locator("#main-workspace")
      .getByText(claimTitle, { exact: true })
      .first()
      .click();
    await window.getByRole("radio", { name: "Detail" }).click();
    await window
      .getByRole("button", { name: "Add supporting passage" })
      .click();
    let evidenceDialog = window.getByRole("dialog", {
      name: "Link supporting evidence",
    });
    await evidenceDialog
      .getByLabel("Source")
      .selectOption({ label: sourceTitle });
    await evidenceDialog
      .getByLabel("Exact evidence passage")
      .fill(supportingQuote);
    await evidenceDialog
      .getByLabel("Page, section, or locator")
      .fill("Results, paragraph 2");
    await evidenceDialog.getByLabel("Confidence (0–100%)").fill("86");
    await evidenceDialog.getByRole("button", { name: "Link source" }).click();
    await expect(window.getByText("Supporting evidence linked")).toBeVisible();
    await expect(window.getByText(supportingQuote)).toBeVisible();
    await window.getByRole("button", { name: "Approve link" }).click();
    await window.getByRole("button", { name: "Verify exact passage" }).click();

    await window.getByRole("button", { name: "Add contradiction" }).click();
    evidenceDialog = window.getByRole("dialog", {
      name: "Record contradictory evidence",
    });
    await evidenceDialog
      .getByLabel("Source")
      .selectOption({ label: sourceTitle });
    await evidenceDialog
      .getByLabel("Exact evidence passage")
      .fill(contradictoryQuote);
    await evidenceDialog
      .getByLabel("Page, section, or locator")
      .fill("Limitations, paragraph 1");
    await evidenceDialog.getByRole("button", { name: "Link source" }).click();
    await expect(window.getByText("Contradiction recorded")).toBeVisible();
    await expect(window.getByText(contradictoryQuote)).toBeVisible();

    await app.close();
    app = await launch();
    window = await app.firstWindow();
    await window.getByRole("heading", { level: 1 }).first().waitFor();

    await window.getByTestId("nav-claims").click();
    await window.getByPlaceholder("Search claims…").fill(claimTitle);
    await expect(
      window
        .locator("#main-workspace")
        .getByText(claimTitle, { exact: true })
        .first(),
    ).toBeVisible();
    await window
      .locator("#main-workspace")
      .getByText(claimTitle, { exact: true })
      .first()
      .click();
    await window.getByRole("radio", { name: "Detail" }).click();
    await expect(window.getByText(supportingQuote)).toBeVisible();
    await expect(window.getByText(contradictoryQuote)).toBeVisible();
    await expect(window.getByText("Link approved")).toBeVisible();
    await expect(window.getByText("Passage verified")).toBeVisible();
    await expect(window.getByText("86% confidence")).toBeVisible();

    await window.getByTestId("nav-experiments").click();
    await window
      .getByPlaceholder("Search experiments and goals…")
      .fill(experimentTitle);
    await expect(
      window.getByText(experimentTitle, { exact: true }),
    ).toBeVisible();

    await window.getByTestId("nav-sources").click();
    await window
      .getByPlaceholder("Search titles, authors, and tags…")
      .fill(sourceTitle);
    await expect(
      window
        .locator("#main-workspace")
        .getByText(sourceTitle, { exact: true })
        .first(),
    ).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
