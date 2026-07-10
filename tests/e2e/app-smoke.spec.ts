import { expect, test } from "@playwright/test";

test("loads the branded Cly renderer entry", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveTitle("Cly");
  await expect(
    page.getByRole("status", { name: "Loading Cly" }).first(),
  ).toBeVisible();
  await expect(page.locator("body")).toBeVisible();
});
