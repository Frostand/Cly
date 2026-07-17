import { execFileSync } from "node:child_process";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import axe from "axe-core";

const root = process.cwd();
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("reviews the assembled Electron shell and core interaction states", async () => {
  test.setTimeout(90_000);
  execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
    cwd: root,
  });
  const app = await electron.launch({
    args: [...electronArgs, path.join(root, "electron/main.js")],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      ELECTRON_INTERNAL_PORT: "43740",
      ELECTRON_API_PORT: "43742",
      VITE_CLY_DEMO_MODE: "1",
    },
  });

  try {
    const window = await app.firstWindow();
    const browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setSize(1024, 700);
    });
    expect(
      await browserWindow.evaluate((nativeWindow) =>
        nativeWindow.getMinimumSize(),
      ),
    ).toEqual([1024, 700]);
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
    const settingsButton = window.getByTestId("nav-settings");
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
    const identity = window.getByRole("region", { name: "Task identity" });
    await expect(identity).toBeVisible();
    for (const name of [
      "Project",
      "Repository",
      "Workspace",
      "Machine",
      "Provider",
      "Budget",
      "Objective",
      "Research impact",
    ]) {
      await expect(identity.getByRole("group", { name })).toBeVisible();
    }
    await expect(
      window.getByRole("radiogroup", { name: "Task workspace mode" }),
    ).toBeVisible();
    const agentOnly = window.getByRole("radio", { name: "Agent only" });
    await agentOnly.focus();
    await agentOnly.press("Space");
    await expect(window.getByLabel("Session workbench")).toHaveCount(0);
    const inspectTests = window.getByRole("button", { name: "Inspect tests" });
    await inspectTests.focus();
    await inspectTests.press("Enter");
    await expect(
      window.getByRole("region", { name: "Test inspection" }),
    ).toBeVisible();
    await window
      .getByRole("button", { name: "Close inspection" })
      .press("Enter");
    await expect(inspectTests).toBeFocused();
    const inlineWorkspace = window.getByRole("radio", {
      name: "Inline workspace",
    });
    await inlineWorkspace.focus();
    await inlineWorkspace.press("Space");
    await expect(window.getByLabel("Session workbench")).toBeVisible();
    const composer = window.getByLabel("Message the Orchestrator");
    await composer.fill("Verify visible Electron composer text");
    await expect(composer).toHaveValue("Verify visible Electron composer text");
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
      expect(
        await window.evaluate(
          () => document.documentElement.scrollWidth - innerWidth,
        ),
      ).toBeLessThanOrEqual(1);
      await window.screenshot({
        path: `output/playwright/electron-cly-dev-chat-${width}x${height}.png`,
        animations: "disabled",
      });
    }
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setSize(1024, 700);
    });
    await window.addScriptTag({ content: axe.source });
    const accessibility = await window.evaluate(() => {
      const axeApi = Reflect.get(window, "axe") as {
        run: (context: Document) => Promise<{
          violations: Array<{ impact: string | null }>;
        }>;
      };
      return axeApi.run(document);
    });
    expect(
      accessibility.violations.filter(
        ({ impact }) => impact === "serious" || impact === "critical",
      ),
    ).toEqual([]);
    await window.getByRole("tab", { name: "Live Files" }).click();
    await expect(window.getByLabel("Live file observation")).toBeVisible();

    const aria = await window.locator("body").ariaSnapshot();
    expect(aria).toContain("Main navigation");
    expect(aria).toContain("Workbench tabs");
    expect(aria).toContain("Message the Orchestrator");

    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.webContents.setZoomFactor(2);
    });
    const projectDisclosure = identity.getByRole("button", {
      name: "Show full Project identity",
    });
    await projectDisclosure.focus();
    await projectDisclosure.press("Enter");
    await expect(
      identity
        .getByRole("group", { name: "Project" })
        .locator(".cly-dev-identity-detail"),
    ).toContainText("Neural Surrogate Reliability");
    await window.screenshot({
      path: "output/playwright/electron-cly-dev-chat-1024x700-200pct-identity.png",
      animations: "disabled",
    });
    const assertKeyboardFocusIsInViewport = async (
      locator: ReturnType<typeof window.getByRole>,
    ) => {
      await locator.focus();
      await expect
        .poll(() =>
          locator.evaluate((element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.top >= 0 && bounds.bottom <= innerHeight;
          }),
        )
        .toBe(true);
    };
    await assertKeyboardFocusIsInViewport(
      window.getByRole("radiogroup", { name: "Task workspace mode" }),
    );
    await assertKeyboardFocusIsInViewport(
      window.getByRole("button", { name: "Inspect tests" }),
    );
    await assertKeyboardFocusIsInViewport(composer);
    await expect(composer).toBeFocused();
    await window.screenshot({
      path: "output/playwright/electron-cly-dev-chat-1024x700-200pct-composer.png",
      animations: "disabled",
    });
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.webContents.setZoomFactor(1);
    });
  } finally {
    await app.close();
  }
});

test("automates the eight-scenario Cly Dev lifecycle", async () => {
  test.setTimeout(120_000);
  const walkthroughStartedAt = new Date().toISOString();
  const timings: Array<{
    scenario: string;
    durationMs: number;
  }> = [];
  const runScenario = async (scenario: string, action: () => Promise<void>) => {
    const startedAt = Date.now();
    await test.step(scenario, action);
    timings.push({
      scenario,
      durationMs: Date.now() - startedAt,
    });
  };
  const userDataPath = path.join(
    "/tmp",
    `cly-74-automated-lifecycle-${process.pid}`,
  );
  const launchEnvironment = {
    ...process.env,
    NODE_ENV: "development",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    ELECTRON_INTERNAL_PORT: "43741",
    ELECTRON_API_PORT: "43743",
    CLY_E2E: "1",
    CLY_E2E_USER_DATA_PATH: userDataPath,
    CLY_E2E_SESSION_DATA_PATH: path.join(userDataPath, "session-data"),
    VITE_CLY_DEMO_MODE: "1",
  };

  execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
    cwd: root,
  });
  let app = await electron.launch({
    args: [...electronArgs, path.join(root, "electron/main.js")],
    cwd: root,
    env: launchEnvironment,
  });

  try {
    let window = await app.firstWindow();
    let browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setSize(1024, 700);
    });
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await window.getByTestId("nav-agents").click();

    await runScenario("1. Start task", async () => {
      await window.getByRole("button", { name: "New session" }).click();
      const dialog = window.getByRole("dialog", {
        name: "New agent session",
      });
      await dialog
        .getByLabel("Session title")
        .fill("Expert walkthrough evidence audit");
      await dialog
        .getByLabel("Session goal")
        .fill("Verify that the primary claim remains reproducible.");
      await dialog.getByRole("button", { name: /Start session/ }).click();
      await expect(window.getByTestId("agent-sessions-chat")).toBeVisible();
    });

    await runScenario("2. Recognize identity", async () => {
      const identity = window.getByRole("region", { name: "Task identity" });
      for (const name of [
        "Project",
        "Repository",
        "Workspace",
        "Machine",
        "Provider",
        "Budget",
        "Objective",
        "Research impact",
      ]) {
        await expect(identity.getByRole("group", { name })).toBeVisible();
      }
      await expect(identity).toContainText("Expert walkthrough evidence audit");
    });

    await runScenario("3. Send direction", async () => {
      const composer = window.getByLabel("Message the Orchestrator");
      await composer.fill("Keep the verification scoped to local evidence.");
      await composer.press("Meta+Enter");
      await expect(
        window.getByText("Keep the verification scoped to local evidence.", {
          exact: true,
        }),
      ).toBeVisible();
    });

    await runScenario("4. Approve an action", async () => {
      await window
        .getByLabel("Switch agent session")
        .selectOption({ label: "Plan compute-matched baseline" });
      await expect(
        window.getByText("Approval required · high-cost experiment"),
      ).toBeVisible();
      await window.getByRole("button", { name: "Approve" }).click();
      await expect(
        window.getByRole("status", { name: "Approval approved" }),
      ).toBeFocused();
    });

    await runScenario("5. Inspect test and diff", async () => {
      await window.getByRole("button", { name: "Inspect tests" }).click();
      await expect(
        window.getByRole("region", { name: "Test inspection" }),
      ).toBeVisible();
      await window.getByRole("button", { name: "Inspect diff" }).click();
      await expect(
        window.getByRole("region", { name: "Diff inspection" }),
      ).toBeVisible();
      await window.getByRole("button", { name: "Close inspection" }).click();
      await expect(
        window.getByRole("button", { name: "Inspect diff" }),
      ).toBeFocused();
    });

    await runScenario("6. Switch session", async () => {
      await window
        .getByLabel("Switch agent session")
        .selectOption({ label: "Audit primary claim evidence" });
      await expect(
        window
          .getByRole("region", { name: "Task identity" })
          .getByRole("group", { name: "Objective" }),
      ).toContainText("Audit primary claim evidence");
    });

    await runScenario("7. Detach and reattach workspace", async () => {
      await window.getByRole("radio", { name: "Inline workspace" }).click();
      const workspaceOpened = app.waitForEvent("window");
      await window.getByRole("button", { name: "Detach workspace" }).click();
      const workspace = await workspaceOpened;
      await expect(
        workspace.getByRole("main", { name: "Detached developer workspace" }),
      ).toBeVisible();
      await expect(
        window.getByRole("radio", { name: "Detached workspace" }),
      ).toBeChecked();
      await workspace.getByRole("button", { name: "Reattach" }).click();
      await expect.poll(() => app.windows().length).toBe(1);
      await expect(window.getByLabel("Session workbench")).toBeVisible();
    });

    await runScenario("8. Restart and resume", async () => {
      await window
        .getByLabel("Switch agent session")
        .selectOption({ label: "Review OOD notebook" });
      await expect(
        window.getByRole("button", { name: "Resume task" }),
      ).toBeVisible();
      await app.close();
      await expect
        .poll(async () => {
          try {
            await fetch("http://127.0.0.1:43741", {
              signal: AbortSignal.timeout(250),
            });
            return false;
          } catch {
            return true;
          }
        })
        .toBe(true);
      app = await electron.launch({
        args: [...electronArgs, path.join(root, "electron/main.js")],
        cwd: root,
        env: launchEnvironment,
      });
      window = await app.firstWindow();
      browserWindow = await app.browserWindow(window);
      await browserWindow.evaluate((nativeWindow) => {
        nativeWindow.setSize(1024, 700);
      });
      await expect(
        window.getByRole("button", { name: "Resume task" }),
      ).toBeVisible();
      await window.getByRole("button", { name: "Resume task" }).click();
      await expect(
        window.getByRole("button", { name: "Resume task" }),
      ).toHaveCount(0);
      await expect(
        window.locator(".agent-session-header-status"),
      ).toContainText("Running");
    });

    await window.screenshot({
      path: "output/playwright/electron-cly-dev-automated-final.png",
      animations: "disabled",
    });
    await test.info().attach("cly-74-automated-lifecycle", {
      body: JSON.stringify(
        {
          timestamp: walkthroughStartedAt,
          environment:
            "unpackaged Electron main/preload lifecycle · fixture renderer · macOS · dark · 1024x700",
          timings,
        },
        null,
        2,
      ),
      contentType: "application/json",
    });
    console.info("CLY-74 automated lifecycle", {
      timestamp: walkthroughStartedAt,
      timings,
    });
  } finally {
    await app.close();
  }
});

test("completes the Cly Dev lifecycle using only the keyboard", async () => {
  test.setTimeout(120_000);
  const userDataPath = path.join(
    "/tmp",
    `cly-74-keyboard-lifecycle-${process.pid}`,
  );
  const launchEnvironment = {
    ...process.env,
    NODE_ENV: "development",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    ELECTRON_INTERNAL_PORT: "43744",
    ELECTRON_API_PORT: "43745",
    CLY_E2E: "1",
    CLY_E2E_USER_DATA_PATH: userDataPath,
    CLY_E2E_SESSION_DATA_PATH: path.join(userDataPath, "session-data"),
    VITE_CLY_DEMO_MODE: "1",
  };
  let app = await electron.launch({
    args: [...electronArgs, path.join(root, "electron/main.js")],
    cwd: root,
    env: launchEnvironment,
  });

  const runCommand = async (
    window: Awaited<ReturnType<typeof app.firstWindow>>,
    label: string,
  ) => {
    await window.keyboard.press("Control+K");
    const palette = window.getByRole("dialog", { name: "Command palette" });
    await expect(palette).toBeVisible();
    await window.keyboard.type(label);
    await expect(window.getByText(label, { exact: true })).toBeVisible();
    await window.keyboard.press("Enter");
    await expect(
      window.getByRole("dialog", { name: "Command palette" }),
    ).toHaveCount(0);
  };

  try {
    let window = await app.firstWindow();
    let browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setSize(1024, 700);
    });
    await window.getByRole("heading", { level: 1 }).first().waitFor();

    await window.keyboard.press("Control+2");
    await expect(
      window.getByRole("heading", { name: "Agent Sessions", level: 1 }),
    ).toBeVisible();
    await window.keyboard.press("Tab");
    const firstTabStop = await window.evaluate(() =>
      document.activeElement?.getAttribute("aria-label"),
    );
    await window.keyboard.press("Shift+Tab");
    await window.keyboard.press("Tab");
    expect(
      await window.evaluate(() =>
        document.activeElement?.getAttribute("aria-label"),
      ),
    ).toBe(firstTabStop);

    await runCommand(window, "Open Current Session Chat");
    await expect(window.getByTestId("agent-sessions-chat")).toBeVisible();

    await runCommand(window, "Inspect Current Session Tests");
    await expect(
      window.getByRole("region", { name: "Test inspection" }),
    ).toBeVisible();
    await window.keyboard.press("Escape");
    await expect(
      window.getByRole("region", { name: "Test inspection" }),
    ).toHaveCount(0);
    await expect(
      window.getByRole("button", { name: "Inspect tests" }),
    ).toBeFocused();

    await runCommand(window, "Open Pending Agent Approval");
    const approve = window.getByRole("button", { name: "Approve" });
    await expect(approve).toBeFocused();
    await window.keyboard.press("Enter");
    await expect(
      window.getByRole("status", { name: "Approval approved" }),
    ).toBeFocused();

    await runCommand(window, "Use Inline Workspace");
    await runCommand(window, "Detach Workspace (Prototype Intent)");
    await expect(
      window.getByRole("button", { name: "Reattach workspace" }),
    ).toBeVisible();
    await runCommand(window, "Reattach Workspace (Prototype Intent)");
    await expect(window.getByLabel("Session workbench")).toBeVisible();

    await runCommand(window, "Open Interrupted Task to Resume");
    await expect(
      window.getByRole("button", { name: "Resume task" }),
    ).toBeFocused();
    await window.keyboard.press("Control+K");
    await window.keyboard.type("Inspect Current Session Diff");
    await window.keyboard.press("Escape");
    await expect(
      window.getByRole("dialog", { name: "Command palette" }),
    ).toHaveCount(0);

    await app.close();
    await expect
      .poll(async () => {
        try {
          await fetch("http://127.0.0.1:43744", {
            signal: AbortSignal.timeout(250),
          });
          return false;
        } catch {
          return true;
        }
      })
      .toBe(true);
    app = await electron.launch({
      args: [...electronArgs, path.join(root, "electron/main.js")],
      cwd: root,
      env: launchEnvironment,
    });
    window = await app.firstWindow();
    browserWindow = await app.browserWindow(window);
    await browserWindow.evaluate((nativeWindow) => {
      nativeWindow.setSize(1024, 700);
    });
    await window.getByTestId("agent-sessions-chat").waitFor();
    await window.keyboard.press("Tab");
    await runCommand(window, "Open Interrupted Task to Resume");
    await expect(
      window.getByRole("button", { name: "Resume task" }),
    ).toBeFocused();
    await window.keyboard.press("Enter");
    await expect(window.locator(".agent-session-header-status")).toContainText(
      "Running",
    );

    await window.screenshot({
      path: "output/playwright/electron-cly-dev-keyboard-final.png",
      animations: "disabled",
    });
  } finally {
    await app.close();
  }
});
