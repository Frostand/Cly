import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const [, , executablePath] = process.argv;
if (!executablePath) {
  throw new Error(
    "Usage: node scripts/smoke-packaged-app.mjs <packaged-app-executable>",
  );
}

const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-package-smoke-"));
let app;
try {
  app = await electron.launch({
    executablePath: path.resolve(executablePath),
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env: {
      ...process.env,
      CLY_E2E: "1",
      CLY_E2E_USER_DATA_PATH: userDataPath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      NODE_ENV: "production",
      VITE_CLY_DEMO_MODE: "0",
    },
    timeout: 45_000,
  });
  const window = await app.firstWindow({ timeout: 45_000 });
  await window.waitForLoadState("domcontentloaded");
  const bodyText = (await window.locator("body").innerText()).trim();
  if (
    !bodyText ||
    (await window.getByTestId("fixture-selector").count()) !== 0
  ) {
    throw new Error(
      "Packaged Cly did not render production UI without fixture controls.",
    );
  }
  process.stdout.write(
    `Packaged app smoke passed: ${path.resolve(executablePath)}\n`,
  );
} finally {
  await app?.close().catch(() => undefined);
  rmSync(userDataPath, { recursive: true, force: true });
}
