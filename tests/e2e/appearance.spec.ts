import { expect, test } from "@playwright/test";

const palettes = [
  ["Research blue", "blue", "#3b6fe8"],
  ["Discovery green", "green", "#0f9477"],
  ["Sunset", "sunset", "#d94f72"],
  ["Monochrome", "mono", "#62666d"],
  ["Cly purple", "purple", "#6d5ce7"],
] as const;

test("applies and persists every accent palette", async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem("cly-theme", "light");
  });
  await page.goto("/");

  for (const [label, palette, accent] of palettes) {
    await page.getByRole("button", { name: /^Appearance:/ }).click();
    await page.getByRole("menuitemradio", { name: label }).click();

    await expect(page.locator("html")).toHaveAttribute(
      "data-cly-palette",
      palette,
    );
    await expect
      .poll(() =>
        page
          .locator("html")
          .evaluate((element) =>
            getComputedStyle(element).getPropertyValue("--cly-accent").trim(),
          ),
      )
      .toBe(accent);
  }

  await page.getByRole("button", { name: /^Appearance:/ }).click();
  await page.getByRole("menuitemradio", { name: "Research blue" }).click();
  await page.reload();

  await expect(page.locator("html")).toHaveAttribute(
    "data-cly-palette",
    "blue",
  );
  await expect
    .poll(() =>
      page
        .locator("html")
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue("--cly-accent").trim(),
        ),
    )
    .toBe("#3b6fe8");
});
