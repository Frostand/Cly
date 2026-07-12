import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const [
  route = "overview",
  widthRaw = "1440",
  heightRaw = "900",
  iteration = "manual",
] = process.argv.slice(2);
const width = Number(widthRaw);
const height = Number(heightRaw);
const root = process.cwd();
const output = path.join(root, "artifacts/ui-review", iteration);
mkdirSync(output, { recursive: true });
execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
  cwd: root,
});
const app = await electron.launch({
  args: [path.join(root, "electron/main.js")],
  cwd: root,
  env: { ...process.env, NODE_ENV: "development" },
});
try {
  const page = await app.firstWindow();
  const native = await app.browserWindow(page);
  await native.evaluate(
    (window, size) => window.setSize(size.width, size.height),
    { width, height },
  );
  await page.getByTestId(`nav-${route}`).click();
  await page.waitForTimeout(250);
  await page.screenshot({
    path: path.join(output, `${route}-${width}x${height}.png`),
    animations: "disabled",
  });
} finally {
  await app.close();
}
