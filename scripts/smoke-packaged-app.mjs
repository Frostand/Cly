import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function readArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : null;
}

function getExecutablePath(applicationPath) {
  if (applicationPath.endsWith(".app")) {
    return path.join(applicationPath, "Contents", "MacOS", "Cly");
  }
  return path.join(
    applicationPath,
    process.platform === "win32" ? "Cly.exe" : "Cly",
  );
}

async function waitForMainWindow(app) {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    for (const window of app.windows()) {
      try {
        if ((await window.locator("#main-workspace").count()) > 0) {
          await window.locator("#main-workspace").waitFor({ timeout: 5_000 });
          return window;
        }
      } catch {
        // The branded startup window closes as the main renderer becomes ready.
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error(
    "Packaged Cly did not open its main workspace within 60 seconds.",
  );
}

const requestedApp = readArgument("--app");
if (!requestedApp) {
  throw new Error("Pass --app <unpacked app path> to the packaged smoke test.");
}

const applicationPath = path.resolve(root, requestedApp);
const executablePath = getExecutablePath(applicationPath);
const isolatedData = mkdtempSync(path.join(tmpdir(), "cly-packaged-smoke-"));
let app;

try {
  app = await electron.launch({
    args: process.platform === "linux" ? ["--no-sandbox"] : [],
    executablePath,
    env: {
      ...process.env,
      CLY_E2E: "1",
      CLY_E2E_SESSION_DATA_PATH: path.join(isolatedData, "session"),
      CLY_E2E_USER_DATA_PATH: path.join(isolatedData, "user-data"),
      NODE_ENV: "production",
    },
    timeout: 60_000,
  });
  const window = await waitForMainWindow(app);
  const rendererFailures = [];
  window.on("console", (message) => {
    if (message.type() === "error") rendererFailures.push(message.text());
  });
  window.on("pageerror", (error) => rendererFailures.push(error.message));
  window.on("requestfailed", (request) => {
    rendererFailures.push(
      `${request.method()} ${request.url()}: ${request.failure()?.errorText ?? "request failed"}`,
    );
  });

  try {
    await window.waitForFunction(
      () => !document.querySelector(".boot-loading"),
      undefined,
      { timeout: 45_000 },
    );
  } catch (error) {
    const bootstrap = await window.evaluate(() => {
      const loading = document.querySelector(".boot-loading");
      return loading
        ? {
            message:
              loading.querySelector(".boot-message")?.textContent?.trim() ??
              null,
            state: loading.getAttribute("data-state") ?? "loading",
          }
        : null;
    });
    throw new Error(
      `Packaged Cly did not finish database hydration: ${JSON.stringify({ bootstrap, rendererFailures })}`,
      { cause: error },
    );
  }

  const browserWindow = await app.browserWindow(window);
  const security = await browserWindow.evaluate((nativeWindow) => {
    const preferences = nativeWindow.webContents.getLastWebPreferences();
    return {
      contextIsolation: preferences.contextIsolation,
      nodeIntegration: preferences.nodeIntegration,
      sandbox: preferences.sandbox,
    };
  });
  if (
    security.contextIsolation !== true ||
    security.nodeIntegration !== false ||
    security.sandbox !== true
  ) {
    throw new Error(
      `Unsafe packaged renderer preferences: ${JSON.stringify(security)}`,
    );
  }

  const runtime = await window.evaluate(async () => {
    const desktop = Reflect.get(window, "dream");
    const apiSessionToken = desktop?.apiSessionToken;
    if (!desktop?.isElectron || !apiSessionToken) {
      return { error: "Desktop preload bridge is unavailable." };
    }
    const response = await fetch("/api/provider-models", {
      body: JSON.stringify({}),
      headers: {
        "content-type": "application/json",
        "x-cly-api-token": apiSessionToken,
      },
      method: "POST",
    });
    return {
      body: response.ok ? await response.json() : await response.text(),
      electron: desktop.isElectron,
      status: response.status,
    };
  });
  if (runtime.error || runtime.status !== 200) {
    throw new Error(
      `Packaged provider detection failed: ${runtime.error || JSON.stringify(runtime)}`,
    );
  }

  console.log(
    `Packaged app smoke passed for ${applicationPath}: renderer, database hydration, native startup, preload isolation, and provider detection are operational.`,
  );
} finally {
  if (app) await app.close();
  rmSync(isolatedData, { force: true, recursive: true });
}
