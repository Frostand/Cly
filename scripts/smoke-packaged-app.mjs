import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { _electron as electron } from "@playwright/test";

const args = process.argv.slice(2).filter((argument) => argument !== "--");
const requestedAppPath = args[0] === "--app" ? args[1] : args[0];
if (!requestedAppPath) {
  throw new Error(
    "Usage: node scripts/smoke-packaged-app.mjs [--app] <packaged-app-executable-or-macOS-app-bundle>",
  );
}

const resolveExecutablePath = (inputPath) => {
  const resolved = path.resolve(inputPath);
  if (process.platform !== "darwin" || path.extname(resolved) !== ".app") {
    return resolved;
  }
  return path.join(
    resolved,
    "Contents",
    "MacOS",
    path.basename(resolved, ".app"),
  );
};

const executablePath = resolveExecutablePath(requestedAppPath);

const userDataPath = mkdtempSync(path.join(tmpdir(), "cly-package-smoke-"));
let app;
try {
  app = await electron.launch({
    executablePath,
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    env: {
      ...process.env,
      CLY_E2E: "1",
      CLY_E2E_USER_DATA_PATH: userDataPath,
      ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
      NODE_ENV: "production",
      VITE_CLY_TEST_FIXTURES: "0",
    },
    timeout: 45_000,
  });
  const window = await app.firstWindow({ timeout: 45_000 });
  await window.waitForLoadState("domcontentloaded");
  const bodyText = (await window.locator("body").innerText()).trim();
  const startsBlank =
    (await window
      .getByRole("heading", {
        name: "Your Cly workspace starts empty",
      })
      .count()) === 1 &&
    (await window.getByRole("button", { name: "Switch project" }).count()) ===
      0;
  if (
    !bodyText ||
    (await window.getByTestId("fixture-selector").count()) !== 0 ||
    !startsBlank
  ) {
    throw new Error(
      "Packaged Cly did not start with a blank production setup and no fixture controls.",
    );
  }
  process.stdout.write(`Packaged app smoke passed: ${executablePath}\n`);
} finally {
  await app?.close().catch(() => undefined);
  rmSync(userDataPath, { recursive: true, force: true });
}
