import type { Page } from "@playwright/test";

export async function navigateToResearch(page: Page, id: string) {
  const destination = page.getByTestId(`nav-${id}`);
  if (!(await destination.isVisible())) {
    const disclosure = page.locator("details.cly-sidebar-advanced > summary");
    if (
      !(await disclosure
        .locator("..")
        .evaluate((element) => (element as HTMLDetailsElement).open))
    ) {
      await disclosure.click();
    }
  }
  await destination.click();
}
