import { expect, test } from "@playwright/test";

test("opens the live Cly Dev workspace and provider setup", async ({
  page,
}) => {
  await page.route("**/api/provider-models", async (route) => {
    const unavailable = {
      error: "CLI not installed in this browser test.",
      installed: false,
      models: [],
      source: "unavailable",
      version: null,
    };
    await route.fulfill({
      body: JSON.stringify({
        anthropic: unavailable,
        cursor: unavailable,
        fetchedAt: new Date().toISOString(),
        openai: unavailable,
        opencode: unavailable,
      }),
      contentType: "application/json",
    });
  });

  await page.goto("/");
  await page.getByTestId("product-dev").click();

  await expect(page.getByTestId("cly-live-dev-workspace")).toBeVisible();
  await expect(
    page.getByText("Connect a provider", { exact: true }),
  ).toBeVisible();

  await page.getByTestId("nav-dev-agents").click();
  const dialog = page.getByRole("dialog", { name: "Settings" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Codex" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "Claude Code" })).toBeVisible();
  await expect(dialog.getByRole("tab", { name: "OpenCode" })).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Copy install command" }),
  ).toBeVisible();
});
