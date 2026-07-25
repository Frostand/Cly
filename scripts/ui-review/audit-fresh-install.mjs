import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";
import axe from "axe-core";
import { getClyMainWindow } from "./electron-main-window.mjs";

const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../..",
);
const runId = process.argv[2] ?? "fresh-install";
const output = path.join(root, "artifacts", "release-audit", runId);
const isolatedData = path.join("/tmp", `cly-release-audit-${process.pid}`);
mkdirSync(output, { recursive: true });

const app = await electron.launch({
  args: [path.join(root, "electron", "main.js")],
  cwd: root,
  env: {
    ...process.env,
    CLY_E2E: "1",
    CLY_E2E_SESSION_DATA_PATH: path.join(isolatedData, "session"),
    CLY_E2E_USER_DATA_PATH: isolatedData,
    ELECTRON_API_PORT: "43812",
    ELECTRON_DISABLE_SECURITY_WARNINGS: "true",
    ELECTRON_INTERNAL_PORT: "43810",
    NODE_ENV: "development",
    VITE_CLY_DEMO_MODE: "0",
  },
  timeout: 60_000,
});

const report = {
  consoleProblems: [],
  failedResponses: [],
  initial: null,
  routes: [],
  seriousAccessibilityViolations: [],
};
let currentRoute = "startup";

try {
  const window = await getClyMainWindow(app);
  const browserWindow = await app.browserWindow(window);
  await browserWindow.evaluate((nativeWindow) =>
    nativeWindow.setSize(1280, 800),
  );

  window.on("console", (message) => {
    if (["error", "warning"].includes(message.type())) {
      report.consoleProblems.push(`${message.type()}: ${message.text()}`);
    }
  });
  window.on("pageerror", (error) => {
    report.consoleProblems.push(`pageerror: ${error.message}`);
  });
  window.on("response", (response) => {
    if (response.status() >= 400) {
      report.failedResponses.push({
        route: currentRoute,
        status: response.status(),
        url: response.url(),
      });
    }
  });

  await window.locator("#main-workspace").waitFor({ timeout: 45_000 });
  await window.waitForFunction(() => !document.querySelector(".boot-loading"));
  report.initial = await window.evaluate(() => ({
    bodyText: document.body.innerText.slice(0, 4_000),
    buttons: Array.from(document.querySelectorAll("button")).map((button) => ({
      disabled: button.disabled,
      name: button.getAttribute("aria-label") || button.innerText.trim(),
      title: button.title || null,
    })),
    headings: Array.from(document.querySelectorAll("h1, h2, h3")).map(
      (heading) => heading.textContent?.trim() || "",
    ),
    inputs: Array.from(
      document.querySelectorAll("input, select, textarea"),
    ).map((input) => ({
      disabled: input.disabled,
      name:
        input.getAttribute("aria-label") ||
        document
          .querySelector(`label[for="${input.id}"]`)
          ?.textContent?.trim() ||
        input.getAttribute("name") ||
        input.tagName.toLowerCase(),
      type: input.getAttribute("type") || input.tagName.toLowerCase(),
    })),
  }));
  await window.screenshot({
    animations: "disabled",
    path: path.join(output, "00-initial.png"),
  });

  const navIds = await window
    .locator('[data-testid^="nav-"]')
    .evaluateAll((elements) =>
      elements
        .map((element) => element.getAttribute("data-testid")?.slice(4) || "")
        .filter((id) => id && !id.startsWith("dev-")),
    );

  for (const id of navIds) {
    currentRoute = id;
    await window.getByTestId(`nav-${id}`).click();
    await window
      .getByTestId(`nav-${id}`)
      .waitFor({ state: "visible", timeout: 5_000 });
    await window.waitForTimeout(450);
    const route = await window.locator("#main-workspace").evaluate((main) => ({
      buttons: Array.from(main.querySelectorAll("button")).map((button) => ({
        disabled: button.disabled,
        name: button.getAttribute("aria-label") || button.innerText.trim(),
        title: button.title || null,
      })),
      heading: main.querySelector("h1")?.textContent?.trim() || null,
      inputs: Array.from(main.querySelectorAll("input, select, textarea")).map(
        (input) => ({
          disabled: input.disabled,
          name:
            input.getAttribute("aria-label") ||
            document
              .querySelector(`label[for="${input.id}"]`)
              ?.textContent?.trim() ||
            input.getAttribute("name") ||
            input.tagName.toLowerCase(),
          type: input.getAttribute("type") || input.tagName.toLowerCase(),
        }),
      ),
      previewNotice:
        main.querySelector(".cly-beta-route-notice")?.textContent?.trim() ||
        null,
      text: main.innerText.slice(0, 4_000),
    }));
    report.routes.push({ id, ...route });
    await window.screenshot({
      animations: "disabled",
      path: path.join(
        output,
        `${String(report.routes.length).padStart(2, "0")}-${id}.png`,
      ),
    });
  }

  await window.addScriptTag({ content: axe.source });
  const accessibility = await window.evaluate(() => window.axe.run(document));
  report.seriousAccessibilityViolations = accessibility.violations.filter(
    ({ impact }) => impact === "serious" || impact === "critical",
  );
} finally {
  writeFileSync(
    path.join(output, "report.json"),
    `${JSON.stringify(report, null, 2)}\n`,
  );
  await app.close();
}

console.log(path.join(output, "report.json"));
