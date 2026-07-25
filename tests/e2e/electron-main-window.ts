import type { ElectronApplication, Page } from "@playwright/test";

const isClyMainWindow = (page: Page) => {
  if (page.isClosed()) return false;
  const url = page.url();
  return (
    url !== "about:blank" &&
    !url.includes("startup-splash.html") &&
    !url.includes("clyWindowRole=workspace")
  );
};

/** Waits past Cly's native startup splash and returns the primary renderer. */
export async function getClyMainWindow(
  app: ElectronApplication,
  timeout = 45_000,
): Promise<Page> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const mainWindow = app.windows().find(isClyMainWindow);
    if (mainWindow) return mainWindow;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Cly's main window did not replace the startup splash.");
}
