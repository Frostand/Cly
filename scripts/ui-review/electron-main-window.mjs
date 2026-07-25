const isClyMainWindow = (page) => {
  if (page.isClosed()) return false;
  const url = page.url();
  return (
    url !== "about:blank" &&
    !url.includes("startup-splash.html") &&
    !url.includes("clyWindowRole=workspace")
  );
};

export async function getClyMainWindow(app, timeout = 45_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const mainWindow = app.windows().find(isClyMainWindow);
    if (mainWindow) return mainWindow;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Cly's main window did not replace the startup splash.");
}
