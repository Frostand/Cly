import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";
import { getClyMainWindow } from "./electron-main-window.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const iteration = process.argv[2] ?? "models-agents";
const output = path.join(root, "artifacts/ui-review", iteration);
mkdirSync(output, { recursive: true });
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
  },
  timeout: 60_000,
});

try {
  const page = await getClyMainWindow(app);
  const native = await app.browserWindow(page);
  await page.getByTestId("nav-models").click();
  await page
    .getByRole("heading", { level: 1, name: "Models & Agents" })
    .waitFor();
  await page
    .getByRole("button", { name: "Refresh", exact: true })
    .waitFor({ timeout: 45_000 });

  const viewports = [
    [1024, 700],
    [1280, 800],
    [1440, 900],
    [1728, 1117],
  ];
  for (const [width, height] of viewports) {
    await native.evaluate(
      (window, size) => window.setSize(size.width, size.height),
      { width, height },
    );
    await page.waitForTimeout(180);
    await page.screenshot({
      path: path.join(output, `models-agents-${width}x${height}.png`),
      animations: "disabled",
    });
  }
} finally {
  await app.close();
}
