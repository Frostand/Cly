import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const root = process.cwd();
const viteCli = path.join(root, "node_modules", "vite", "bin", "vite.js");
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("fresh local setup has no preloaded project, survives interruption, imports a repository, and completes local-only", async () => {
  test.setTimeout(120_000);
  const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-onboarding-e2e-"));
  const projectPath = path.join(userDataPath, "existing-research-repository");
  mkdirSync(path.join(projectPath, ".git"), { recursive: true });
  const canonicalProjectPath = realpathSync(projectPath);

  execFileSync(process.execPath, [viteCli, "build"], {
    cwd: root,
    env: { ...process.env, VITE_CLY_TEST_FIXTURES: "0" },
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
        CLY_E2E_PROJECT_PATH: canonicalProjectPath,
        ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
        VITE_CLY_TEST_FIXTURES: "0",
      },
    });

  let app = await launch();
  try {
    let window = await app.firstWindow();
    await expect(
      window.getByRole("heading", {
        name: "Your Cly workspace starts empty",
        level: 1,
      }),
    ).toBeVisible();
    await expect(
      window.getByRole("button", { name: "Switch project" }),
    ).toHaveCount(0);
    await expect(window.getByTestId("fixture-selector")).toHaveCount(0);
    await expect(window.getByText("No preloaded project")).toBeVisible();
    await expect(window.getByText("Saved on this Mac")).toBeVisible();

    await window.getByRole("button", { name: /Continue/ }).click();
    await window
      .getByRole("button", { name: /Open an existing folder/ })
      .click();
    await expect(
      window.getByRole("heading", {
        name: "Define the question before the tooling",
      }),
    ).toBeVisible();
    await window.getByLabel("Research topic").fill("Durable evidence chains");
    await window
      .getByLabel("Primary question")
      .fill("Can a local evidence chain survive an interrupted setup?");
    await expect
      .poll(() =>
        window.evaluate(() =>
          Object.values(localStorage).some((value) =>
            value.includes("Durable evidence chains"),
          ),
        ),
      )
      .toBe(true);
    await window.waitForTimeout(300);

    await app.close();
    app = await launch();
    window = await app.firstWindow();
    await expect(
      window.getByRole("heading", {
        name: "Define the question before the tooling",
      }),
    ).toBeVisible();
    await expect(window.getByLabel("Research topic")).toHaveValue(
      "Durable evidence chains",
    );
    await expect(window.getByLabel("Primary question")).toHaveValue(
      "Can a local evidence chain survive an interrupted setup?",
    );

    await window.getByRole("button", { name: /Continue/ }).click();
    await expect(
      window.getByRole("radio", { name: /^Local-only/ }),
    ).toBeChecked();
    await expect(
      window.getByText("External transmission blocked"),
    ).toBeVisible();
    await window.getByRole("button", { name: /Continue/ }).click();
    await window.getByRole("button", { name: "Skip for now" }).click();

    await expect(
      window.getByRole("heading", {
        name: "Confirm your new workspace",
      }),
    ).toBeVisible();
    await expect(
      window.getByText("Empty project; no sample sources, claims, or runs"),
    ).toBeVisible();
    await window.getByRole("button", { name: /Prepare workspace/ }).click();
    await expect(
      window.getByRole("heading", { name: "Start the first evidence chain" }),
    ).toBeVisible();
    await expect(window.getByText("Objective", { exact: true })).toBeVisible();
    await window.getByRole("button", { name: /Add the first source/ }).click();

    await expect(
      window.getByRole("heading", { name: "Source Manager", level: 1 }),
    ).toBeVisible();
    const completedDraft = await window.evaluate(async () => {
      const key = Object.keys(localStorage).find((item) =>
        item.startsWith("cly:onboarding:v1:"),
      );
      const cached = key
        ? JSON.parse(localStorage.getItem(key) ?? "null")
        : null;
      return cached?.projectId
        ? globalThis.window.dream?.loadOnboardingDraft(cached.projectId)
        : null;
    });
    expect(completedDraft).toMatchObject({
      completed: true,
      privacyMode: "local-only",
      externalTransmissionApproved: false,
      project: { mode: "import", path: canonicalProjectPath },
    });
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
