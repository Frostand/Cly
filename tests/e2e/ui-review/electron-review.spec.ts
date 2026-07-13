import { execFileSync } from "node:child_process";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const root = process.cwd();

test("reviews the assembled Electron shell and core interaction states", async () => {
  test.setTimeout(90_000);
  execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
    cwd: root,
  });
  const app = await electron.launch({
    args: [path.join(root, "electron/main.js")],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      VITE_CLY_DEMO_MODE: "1",
    },
  });

  try {
    const window = await app.firstWindow();
    const browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setMinimumSize(800, 600);
      nativeWindow.setSize(1024, 700);
    });
    await window.getByRole("heading", { level: 1 }).first().waitFor();

    for (const [id, heading] of [
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
    ] as const) {
      await window.getByTestId(`nav-${id}`).click();
      await expect(
        window.getByRole("heading", { name: heading, level: 1 }),
      ).toBeVisible();
      expect(
        await window.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
    }

    await window.getByTestId("nav-overview").click();
    const titlebar = window.locator(".cly-titlebar");
    const settingsButton = titlebar.getByRole("button", { name: "Settings" });
    await expect(settingsButton).toBeVisible();
    await settingsButton.click();
    await expect(
      window.getByRole("heading", { name: "Settings", level: 1 }),
    ).toBeVisible();

    await window.getByTestId("nav-agents").click();
    await window
      .getByRole("article", { name: /Audit primary claim evidence/ })
      .getByRole("button", { name: /Open chat/ })
      .click();
    const composer = window.getByLabel("Message the Orchestrator");
    await composer.fill("Verify visible Electron composer text");
    await expect(composer).toHaveValue("Verify visible Electron composer text");
    await window.getByRole("tab", { name: "Live Files" }).click();
    await expect(window.getByLabel("Live file observation")).toBeVisible();

    const aria = await window.locator("body").ariaSnapshot();
    expect(aria).toContain("Main navigation");
    expect(aria).toContain("Workbench tabs");
    expect(aria).toContain("Message the Orchestrator");
  } finally {
    await app.close();
  }
});
