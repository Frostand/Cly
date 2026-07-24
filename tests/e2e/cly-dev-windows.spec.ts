import { execFileSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";

const root = process.cwd();
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];
const userDataPath = path.join("/tmp", `cly-78-windows-${process.pid}`);
const environment = {
  ...process.env,
  NODE_ENV: "development",
  ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
  ELECTRON_INTERNAL_PORT: "43748",
  ELECTRON_API_PORT: "43749",
  CLY_E2E: "1",
  CLY_E2E_USER_DATA_PATH: userDataPath,
  CLY_E2E_SESSION_DATA_PATH: path.join(userDataPath, "session-data"),
  VITE_CLY_DEMO_MODE: "1",
};

test("detaches, synchronizes, restores, and safely closes the developer workspace", async () => {
  test.setTimeout(120_000);
  rmSync(userDataPath, { recursive: true, force: true });
  execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
    cwd: root,
  });
  const launch = () =>
    electron.launch({
      args: [...electronArgs, path.join(root, "electron/main.js")],
      cwd: root,
      env: environment,
    });

  let app = await launch();
  try {
    let agent = await app.firstWindow();
    await agent.getByRole("heading", { level: 1 }).first().waitFor();
    await agent.getByTestId("nav-agents").click();
    await agent
      .getByRole("article", { name: /Audit LDL-C discordance evidence/ })
      .getByRole("button", { name: /Open chat/ })
      .click();

    const workspaceOpened = app.waitForEvent("window");
    await agent.getByRole("button", { name: "Detach workspace" }).click();
    let workspace = await workspaceOpened;
    await expect(
      workspace.getByRole("main", { name: "Detached developer workspace" }),
    ).toBeVisible();
    await expect(agent.getByLabel("Message the Orchestrator")).toBeVisible();
    await expect(agent.getByLabel("Session workbench")).toHaveCount(0);

    const nativeWorkspace = await app.browserWindow(workspace);
    expect(
      await nativeWorkspace.evaluate((window) => window.getMinimumSize()),
    ).toEqual([640, 480]);
    const nativeAgent = await app.browserWindow(agent);
    expect(
      await nativeAgent.evaluate((window) => window.getMinimumSize()),
    ).toEqual([1024, 700]);

    await workspace.getByRole("tab", { name: "Code Diff" }).click();
    await workspace
      .getByRole("button", { name: /test_discordance\.py/ })
      .click();
    await expect(
      workspace.getByLabel("Diff for tests/analysis/test_discordance.py"),
    ).toBeVisible();

    await app.close();
    app = await launch();
    await expect.poll(() => app.windows().length, { timeout: 45_000 }).toBe(2);
    const restoredWindows = app.windows();
    const restoredAgent = restoredWindows.find(
      (page) => !page.url().includes("clyWindowRole"),
    );
    const restoredWorkspace = restoredWindows.find((page) =>
      page.url().includes("clyWindowRole"),
    );
    expect(restoredAgent).toBeDefined();
    expect(restoredWorkspace).toBeDefined();
    if (!restoredAgent || !restoredWorkspace) {
      throw new Error("Expected both Cly Dev windows to restore.");
    }
    agent = restoredAgent;
    workspace = restoredWorkspace;
    await expect(
      workspace.getByRole("main", { name: "Detached developer workspace" }),
    ).toBeVisible();
    await expect(agent.getByLabel("Message the Orchestrator")).toBeVisible();

    const expectedBounds = { x: 180, y: 120, width: 780, height: 560 };
    const restoredNativeWorkspace = await app.browserWindow(workspace);
    await restoredNativeWorkspace.evaluate((window, bounds) => {
      window.setBounds(bounds);
    }, expectedBounds);
    await expect
      .poll(() =>
        restoredNativeWorkspace.evaluate((window) => window.getBounds()),
      )
      .toEqual(expectedBounds);
    await restoredNativeWorkspace.evaluate((window) => window.close());
    await expect.poll(() => app.windows().length).toBe(1);

    const reopenedWorkspaceEvent = app.waitForEvent("window");
    await agent.getByRole("button", { name: "Detach workspace" }).click();
    workspace = await reopenedWorkspaceEvent;
    const reopenedNativeWorkspace = await app.browserWindow(workspace);
    await expect
      .poll(() =>
        reopenedNativeWorkspace.evaluate((window) => window.getBounds()),
      )
      .toEqual(expectedBounds);

    await workspace.getByRole("button", { name: "Reattach" }).click();
    await expect.poll(() => app.windows().length).toBe(1);
    await expect(agent.getByLabel("Session workbench")).toBeVisible();
    await expect(
      agent.getByLabel("Diff for tests/analysis/test_discordance.py"),
    ).toBeVisible();
    await expect(
      agent.getByRole("button", { name: "Detach workspace" }),
    ).toBeVisible();

    const sessionAWorkspaceEvent = app.waitForEvent("window");
    await agent.getByRole("button", { name: "Detach workspace" }).click();
    await sessionAWorkspaceEvent;
    await agent
      .getByRole("combobox", { name: "Switch agent session" })
      .selectOption("session-02");
    const sessionBWorkspaceEvent = app.waitForEvent("window");
    await agent.getByRole("button", { name: "Detach workspace" }).click();
    const sessionBWorkspace = await sessionBWorkspaceEvent;
    await expect.poll(() => app.windows().length).toBe(2);
    await sessionBWorkspace.getByRole("button", { name: "Reattach" }).click();
    await expect.poll(() => app.windows().length).toBe(1);
    await expect(agent.getByLabel("Session workbench")).toBeVisible();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
