import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { _electron as electron } from "@playwright/test";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");
const iteration = process.argv[2] ?? "manual";
const output = path.join(root, "artifacts/ui-review", iteration);
mkdirSync(output, { recursive: true });

execFileSync(process.execPath, ["scripts/prepare-electron-dev-app.mjs"], {
  cwd: root,
  stdio: "inherit",
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

const window = await app.firstWindow();
const browserWindow = await app.browserWindow(window);
await browserWindow.evaluate((nativeWindow) => {
  nativeWindow.setMinimumSize(800, 600);
  nativeWindow.setSize(1440, 900);
  nativeWindow.center();
});
await window.waitForLoadState("domcontentloaded");
await window.getByRole("heading", { level: 1 }).first().waitFor();

const problems = [];
window.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    problems.push(`${message.type()}: ${message.text()}`);
  }
});
window.on("pageerror", (error) => problems.push(`pageerror: ${error.message}`));

const routes = [
  ["overview", "overview", "Neural surrogate reliability"],
  ["agents", "agent-sessions-overview", "Agent Sessions"],
  ["context", "context", "Context Composer"],
  ["graph", "research-graph", "Research Object Graph"],
  ["experiments", "experiments", "Experiment Manager"],
  ["sources", "sources", "Sources"],
  ["literature", "literature", "Literature"],
  ["notebooks", "notebooks", "Notebooks"],
  ["code", "code-linker", "Code Linker"],
  ["claims", "claims", "Claims"],
  ["provenance", "provenance", "Provenance"],
  ["reproducibility", "reproducibility", "Reproducibility Auditor"],
  ["decisions", "decisions", "Decisions"],
  ["next-steps", "next-steps", "Next Steps"],
  ["integrations", "integrations", "Integrations & Providers"],
  ["models", "models-agents", "Models & Agents"],
  ["settings", "settings", "Settings"],
];

const capture = async (name, animations = "disabled") => {
  await window.waitForTimeout(180);
  await window.screenshot({
    path: path.join(output, `${name}.png`),
    animations,
  });
};

const resize = async (width, height) => {
  await browserWindow.evaluate(
    (nativeWindow, size) => nativeWindow.setSize(size.width, size.height),
    { width, height },
  );
  await window.waitForTimeout(120);
};

const routeMetrics = [];
const viewportMatrix = [
  [1024, 700],
  [1280, 800],
  [1440, 900],
  [1728, 1117],
];
for (const [id, fileName, heading] of routes) {
  await window.getByTestId(`nav-${id}`).click();
  await window.getByRole("heading", { name: heading, level: 1 }).waitFor();
  for (const [width, height] of viewportMatrix) {
    await resize(width, height);
    await capture(`${fileName}-${width}x${height}`);
  }
  routeMetrics.push(
    await window.evaluate((routeId) => {
      const main = document.querySelector("#main-workspace");
      return {
        route: routeId,
        visibleCharacters: main?.innerText.length ?? 0,
        buttons: main?.querySelectorAll("button").length ?? 0,
        panels: main?.querySelectorAll(".cly-panel").length ?? 0,
        horizontalOverflow:
          document.documentElement.scrollWidth - window.innerWidth,
      };
    }, id),
  );
}
await resize(1440, 900);

await window.getByTestId("nav-overview").click();
await window.getByRole("button", { name: "Switch project" }).click();
await capture("project-switcher-open");
await window
  .getByRole("dialog", { name: "Project switcher" })
  .getByRole("button", { name: /Cell morphology atlas/ })
  .click();
await window.getByRole("button", { name: "Switch project" }).click();
await window
  .getByRole("dialog", { name: "Project switcher" })
  .getByRole("button", { name: /Neural surrogate reliability/ })
  .click();

await window.locator(".cly-title-overflow summary").click();
await capture("application-menu-open");
await window.keyboard.press("Escape");
if (await window.locator(".cly-title-overflow").evaluate((node) => node.open)) {
  throw new Error("Titlebar overflow did not close with Escape");
}

await window.getByTestId("toggle-sidebar").click();
await capture("sidebar-collapsed");
await window.getByTestId("toggle-sidebar").click();
await window.keyboard.press("Meta+J");
await capture("activity-drawer-open");
await window.keyboard.press("Meta+J");

await window.getByTestId("nav-claims").click();
await capture("inspector-closed");
await window
  .getByText("Calibration-aware ensembles reduce simulation cost", {
    exact: false,
  })
  .first()
  .click();
await capture("inspector-open");
await window.keyboard.press("Escape");

await window.getByTestId("nav-agents").click();
await window.getByRole("button", { name: "New session" }).click();
await capture("agent-sessions-new-dialog");
await window.keyboard.press("Escape");
const session = window.getByRole("article", {
  name: /Audit primary claim evidence/,
});
await session.getByRole("button", { name: /Open chat/ }).click();
const composer = window.getByLabel("Message the Orchestrator");
await composer.fill("Summarize the strongest reproducible evidence.");
await capture("agent-sessions-chat-typed");
await composer.press("Meta+Enter");
await window
  .getByText("Summarize the strongest reproducible evidence.", { exact: true })
  .waitFor();
await window.getByRole("tab", { name: "Tests" }).click();
await capture("agent-sessions-terminal");
await window.getByRole("tab", { name: "Agents" }).click();
await capture("agent-sessions-agents");
await window
  .getByRole("button", { name: "Configure Codex Implementation Agent" })
  .click();
const agentDialog = window.getByRole("dialog", {
  name: "Configure Codex Implementation Agent",
});
await agentDialog.getByLabel("Reasoning level").selectOption("Medium");
await agentDialog.getByRole("button", { name: "Save configuration" }).click();
await window.getByRole("radio", { name: "topology" }).click();
await window.getByLabel("Agent delegation graph").waitFor();
await window.waitForTimeout(600);
await capture("agent-sessions-topology", "allow");
await window.getByRole("tab", { name: "Live Files" }).click();
await capture("agent-sessions-live-files");
await window.getByRole("tab", { name: "Code Diff" }).click();
await capture("agent-sessions-code-diff");
await window
  .getByLabel("Switch agent session")
  .selectOption({ label: "Plan compute-matched baseline" });
await window.getByText("Approval required · high-cost experiment").waitFor();
await window.getByRole("button", { name: "Approve" }).click();
await window
  .getByLabel("Switch agent session")
  .selectOption({ label: "Audit primary claim evidence" });

await window.getByTestId("nav-context").click();
const include = window.getByRole("switch", {
  name: "Include Raman et al. 2025",
});
if (await include.isVisible()) await include.click();
const pinRaman = window.getByRole("button", { name: "Pin Raman et al. 2025" });
if (await pinRaman.isVisible()) await pinRaman.click();
const representation = window.getByRole("button", {
  name: /Use (summary|raw) representation for Raman et al. 2025/,
});
await representation.click();
await window.getByText("Raman et al. 2025", { exact: true }).first().click();
await window.getByText("Item actions", { exact: true }).click();
await window.getByRole("button", { name: "Compress" }).click();
await window.getByText("Agent preview", { exact: true }).click();
await capture("context-agent-preview");
await window.getByText("Composer", { exact: true }).click();
const claimAuditPack = window.locator(".cly-context-pack-list .cly-panel", {
  hasText: "Claim Audit",
});
await claimAuditPack.getByRole("button", { name: "Apply" }).click();
await capture("context-selection-updated");

await window.getByTestId("nav-sources").click();
await window.getByRole("row", { name: /Reliable neural surrogates/ }).click();
await window.getByText("Source actions", { exact: true }).click();
await window.getByRole("button", { name: "Link to claim" }).click();
await window.getByTestId("nav-claims").click();
await window
  .getByText("Calibration-aware ensembles reduce simulation cost", {
    exact: false,
  })
  .first()
  .click();
await window.getByTestId("nav-experiments").click();
await window.getByText("Calibrated ensemble sweep", { exact: true }).click();
await window.getByTestId("nav-provenance").click();
await window
  .getByText("Figure 2 · Cost vs calibration", { exact: true })
  .first()
  .click();
await window.getByTestId("nav-reproducibility").click();
await window
  .getByText("Figure 4 includes an undocumented manual annotation", {
    exact: true,
  })
  .click();
await window.getByTestId("nav-next-steps").click();
await window.getByRole("button", { name: "Accept" }).first().click();
await window.getByTestId("nav-decisions").click();
await window.getByRole("button", { name: "New decision" }).click();
const decisionDialog = window.getByRole("dialog", {
  name: "Record research decision",
});
await decisionDialog
  .getByLabel("Title")
  .fill("Adopt calibrated ensemble baseline");
await decisionDialog
  .getByRole("textbox", { name: "Decision", exact: true })
  .fill("Use ensemble ×5 as the canonical comparison.");
await decisionDialog.getByRole("button", { name: "Record decision" }).click();
await window.getByTestId("nav-graph").click();
await window.getByText(/20× speedup with decision accuracy/).click();
await capture("research-evidence-flow-complete");

await window.getByTestId("nav-models").click();
await window.locator(".cly-agent-model").first().selectOption("Claude Sonnet");
await window.getByRole("button", { name: "Save preset" }).click();
await window.getByTestId("nav-integrations").click();
await window
  .locator(".cly-integration-catalog .cly-panel", { hasText: "GitHub" })
  .getByRole("button", { name: "Setup" })
  .click();
await window.getByTestId("nav-settings").click();
await window.getByRole("radio", { name: "light" }).click();
await window.reload();
await window.getByRole("heading", { name: "Settings", level: 1 }).waitFor();
await window.getByRole("radio", { name: "dark" }).click();

for (const [width, height] of [
  [1024, 700],
  [1280, 800],
  [1440, 900],
  [1728, 1117],
]) {
  await resize(width, height);
  for (const [id, fileName, heading] of [
    ["overview", "overview", "Neural surrogate reliability"],
    ["sources", "sources", "Sources"],
    ["graph", "research-graph", "Research Object Graph"],
    ["agents", "agent-sessions", "Agent Sessions"],
  ]) {
    await window.getByTestId(`nav-${id}`).click();
    if (
      id === "agents" &&
      (await window.getByTestId("agent-sessions-chat").isVisible())
    ) {
      await window
        .getByTestId("agent-sessions-chat")
        .getByRole("radio", { name: "overview" })
        .click();
    }
    await window.getByRole("heading", { name: heading, level: 1 }).waitFor();
    await capture(`${fileName}-${width}x${height}`);
  }
}

writeFileSync(
  path.join(output, "review-data.json"),
  `${JSON.stringify({ iteration, routeMetrics, problems }, null, 2)}\n`,
);
await app.close();
