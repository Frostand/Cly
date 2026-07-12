import path from "node:path";
import { _electron as electron } from "@playwright/test";
import axe from "axe-core";

const route = process.argv[2] ?? "overview";
const root = process.cwd();
const app = await electron.launch({
  args: [path.join(root, "electron/main.js")],
  cwd: root,
  env: { ...process.env, NODE_ENV: "development" },
});
try {
  const page = await app.firstWindow();
  await page.getByTestId(`nav-${route}`).click();
  await page.addScriptTag({ content: axe.source });
  const results = await page.evaluate(() =>
    window.axe.run(document, {
      rules: { "color-contrast": { enabled: false } },
    }),
  );
  console.log(
    JSON.stringify(
      results.violations.map(({ id, impact, nodes }) => ({
        id,
        impact,
        nodes: nodes.length,
        targets: nodes.map((node) => node.target),
        summaries: nodes.map((node) => node.failureSummary),
      })),
      null,
      2,
    ),
  );
  if (
    results.violations.some(
      (item) => item.impact === "serious" || item.impact === "critical",
    )
  )
    process.exitCode = 1;
} finally {
  await app.close();
}
