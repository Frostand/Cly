import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

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
  const projectTitle = `Beta research project ${suffix}`;
  const datasetTitle = `beta-risk-${suffix}.csv`;
  const datasetCsv = [
    "age,bmi,hdl,outcome",
    ...Array.from({ length: 120 }, (_, index) => {
      const outcome = index % 2;
      return `${20 + (index % 50)},${21 + outcome * 8 + (index % 5)},${65 - outcome * 20},${outcome}`;
    }),
  ].join("\n");

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
    const captureAnalysisDialog = async (name: string) => {
      if (process.env.CLY_CAPTURE_LOCAL_ANALYSIS !== "1") return;
      const browserWindow = await app.browserWindow(window);
      for (const [width, height] of [
        [1024, 700],
        [1280, 800],
        [1440, 900],
        [1728, 1117],
      ]) {
        await browserWindow.evaluate(
          (nativeWindow, size) => nativeWindow.setSize(size.width, size.height),
          { width, height },
        );
        await window.waitForTimeout(120);
        await window.screenshot({
          path: `artifacts/ui-review/beta-local-analysis-final/${name}-${width}x${height}.png`,
          animations: "disabled",
        });
      }
      await browserWindow.evaluate((nativeWindow) =>
        nativeWindow.setSize(1440, 900),
      );
    };
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await expect(window.getByTestId("fixture-selector")).toHaveCount(0);
    await expect(
      window.getByText(/Cly Open Beta · Local research data only/),
    ).toBeVisible();

    await window.getByTestId("project-switcher").click();
    await window.getByTestId("new-local-project").click();
    await expect(
      window.getByRole("heading", {
        name: "Untitled research project",
        level: 1,
      }),
    ).toBeVisible();
    await window.getByTestId("edit-project-brief").click();
    await window.getByLabel("Project name").fill(projectTitle);
    await window
      .getByLabel("Research question")
      .fill("Can basic measurements predict a binary health-risk flag?");
    await window
      .getByLabel("Working hypothesis")
      .fill(
        "BMI and HDL will improve prediction beyond the majority baseline.",
      );
    await window
      .getByLabel("Scope note")
      .fill("Synthetic, de-identified local beta validation data.");
    await window.getByRole("button", { name: "Save brief" }).click();
    await expect(
      window.getByRole("heading", { name: projectTitle, level: 1 }),
    ).toBeVisible();

    await window.getByTestId("nav-notebooks").click();
    await expect(
      window.getByText(
        /Notebook scanning is a preview until imported scans can be persisted/,
      ),
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "Import notebook" }).first(),
    ).toBeDisabled();

    await window.getByTestId("nav-settings").click();
    await window.getByRole("button", { name: "Privacy" }).click();
    await expect(window.getByText("Free beta safety boundary")).toBeVisible();
    await expect(
      window.getByRole("button", { name: "Export project" }),
    ).toBeEnabled();
    await window.getByRole("button", { name: "Diagnostics" }).click();
    await window.getByRole("button", { name: "Copy diagnostics" }).click();
    await expect(window.getByText("Diagnostics copied")).toBeVisible();

    await window.getByTestId("nav-agents").click();
    await expect(
      window.getByRole("heading", { name: "Agent Sessions", level: 1 }),
    ).toBeVisible();
    await expect(window.getByText("No durable sessions yet")).toBeVisible();

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

    await window.getByTestId("run-local-analysis").click();
    const analysisDialog = window.getByRole("dialog", {
      name: "Run local dataset analysis",
    });
    await analysisDialog.getByTestId("local-analysis-file").setInputFiles({
      name: datasetTitle,
      mimeType: "text/csv",
      buffer: Buffer.from(datasetCsv),
    });
    await expect(analysisDialog.getByText("120 rows")).toBeVisible();
    await expect(analysisDialog.getByLabel("Outcome column")).toHaveValue(
      "outcome",
    );
    await captureAnalysisDialog("analysis-setup");
    await analysisDialog.getByTestId("execute-local-analysis").click();
    await expect(
      analysisDialog.getByTestId("local-analysis-result"),
    ).toBeVisible({ timeout: 20_000 });
    await expect(analysisDialog.getByText(/Cross-validated AUC/)).toBeVisible();
    await expect(
      analysisDialog.getByText(
        /predictive association, not evidence of causation/i,
      ),
    ).toBeVisible();
    await captureAnalysisDialog("analysis-result");
    await analysisDialog
      .getByRole("button", { name: /Review saved run/ })
      .click();
    await expect(
      window.getByText(`${experimentTitle} · local cross-validation`, {
        exact: true,
      }),
    ).toBeVisible();

    await window.getByTestId("nav-claims").click();
    await window
      .locator("#main-workspace")
      .getByText(claimTitle, { exact: true })
      .first()
      .click();
    await window.getByRole("radio", { name: "Detail" }).click();
    await window.getByRole("button", { name: "Link evidence" }).click();
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
    await sourceRecord.click();
    await window.getByText("Source actions", { exact: true }).click();
    await window.getByRole("button", { name: "Link to claim" }).click();
    await expect(window.getByText("Evidence linked")).toBeVisible();

    await window.getByTestId("nav-reproducibility").click();
    await window.getByRole("button", { name: "Run audit" }).first().click();
    await expect(
      window.getByText("Reproducibility audit complete"),
    ).toBeVisible();

    await app.close();
    app = await launch();
    window = await app.firstWindow();
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await expect(
      window.getByRole("heading", { name: projectTitle, level: 1 }),
    ).toBeVisible();

    await window.getByTestId("nav-claims").click();
    await window.getByPlaceholder("Search claims…").fill(claimTitle);
    await expect(
      window
        .locator("#main-workspace")
        .getByText(claimTitle, { exact: true })
        .first(),
    ).toBeVisible();

    await window.getByTestId("nav-experiments").click();
    await window
      .getByPlaceholder("Search experiments and goals…")
      .fill(experimentTitle);
    await expect(
      window.getByText(experimentTitle, { exact: true }),
    ).toBeVisible();
    await window.getByRole("radio", { name: "Runs" }).click();
    await expect(
      window.getByRole("row", {
        name: new RegExp(`${experimentTitle} · local cross-validation`),
      }),
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
    await window
      .getByPlaceholder("Search titles, authors, and tags…")
      .fill(datasetTitle);
    await expect(
      window
        .locator("#main-workspace")
        .getByText(datasetTitle, { exact: true })
        .first(),
    ).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
