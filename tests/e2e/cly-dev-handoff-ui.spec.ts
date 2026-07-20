import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import axe from "axe-core";

const root = process.cwd();
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("reviews the production handoff setup and resume dialog", async () => {
  test.setTimeout(90_000);
  const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-72-ui-"));
  mkdirSync(path.join(root, "artifacts/ui-review/cly-72-final"), {
    recursive: true,
  });
  execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
    cwd: root,
    stdio: "ignore",
  });
  const app = await electron.launch({
    args: [...electronArgs, path.join(root, "electron/main.js")],
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "development",
      ELECTRON_INTERNAL_PORT: "43910",
      ELECTRON_API_PORT: "43911",
      CLY_E2E: "1",
      CLY_E2E_USER_DATA_PATH: userDataPath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      VITE_CLY_DEMO_MODE: "0",
    },
  });

  try {
    const window = await app.firstWindow();
    const browserWindow = await app.browserWindow(window);
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await window.getByTestId("nav-agents").click();
    const trigger = window.getByRole("button", {
      name: "Resume on this machine",
    });
    await trigger.focus();
    await trigger.press("Enter");
    const dialog = window.getByRole("dialog", {
      name: "Resume a Cly Dev handoff",
    });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByLabel("Versioned handoff JSON")).toBeFocused();
    await expect(dialog).toContainText("uncommitted files remain local");
    await expect(dialog.getByLabel("Resume with provider")).toHaveValue(
      "openai-codex",
    );

    await window.emulateMedia({ reducedMotion: "reduce" });
    for (const [width, height] of [
      [1024, 700],
      [1280, 800],
      [1440, 900],
      [1728, 1117],
    ] as const) {
      await browserWindow.evaluate(
        (nativeWindow, size) => nativeWindow.setSize(size.width, size.height),
        { width, height },
      );
      await window.waitForTimeout(120);
      expect(
        await dialog.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return {
            horizontal: bounds.left >= 0 && bounds.right <= innerWidth,
            vertical: bounds.top >= 0 && bounds.bottom <= innerHeight,
          };
        }),
      ).toEqual({ horizontal: true, vertical: true });
      await window.screenshot({
        path: `artifacts/ui-review/cly-72-final/resume-${width}x${height}.png`,
        animations: "disabled",
      });
    }

    await window.addScriptTag({ content: axe.source });
    const seriousViolations = await window.evaluate(async () => {
      const axeApi = Reflect.get(window, "axe") as {
        run: (context: Element) => Promise<{
          violations: Array<{ impact: string | null; id: string }>;
        }>;
      };
      const result = await axeApi.run(
        document.querySelector('[role="dialog"]') as Element,
      );
      return result.violations.filter(({ impact }) =>
        ["serious", "critical"].includes(impact ?? ""),
      );
    });
    expect(seriousViolations).toEqual([]);

    await window.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(trigger).toBeFocused();
  } finally {
    await app.close().catch(() => undefined);
    rmSync(userDataPath, { recursive: true, force: true });
  }
});
