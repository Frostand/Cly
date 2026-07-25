import { execFileSync } from "node:child_process";
import path from "node:path";
import { _electron as electron, expect, test } from "@playwright/test";
import axe from "axe-core";

const root = process.cwd();
const electronArgs = process.platform === "linux" ? ["--no-sandbox"] : [];

test("critical V1 routes have no serious or critical axe violations", async () => {
  test.setTimeout(60_000);
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
      VITE_CLY_TEST_FIXTURES: "1",
    },
  });

  try {
    const window = await app.firstWindow();
    await window.getByRole("heading", { level: 1 }).first().waitFor();
    await window.addScriptTag({ content: axe.source });

    for (const route of ["objectives", "literature", "agents"] as const) {
      await window.getByTestId(`nav-${route}`).click();
      const violations = await window.evaluate(async () => {
        const axeApi = Reflect.get(window, "axe") as {
          run: (
            context: Document,
            options: Record<string, unknown>,
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
        const result = await axeApi.run(document, {
          rules: { "color-contrast": { enabled: false } },
        });
        return result.violations.filter(
          ({ impact }) => impact === "serious" || impact === "critical",
        );
      });
      expect(violations, `${route} accessibility violations`).toEqual([]);
    }
  } finally {
    await app.close();
  }
});
