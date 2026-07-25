import { defineConfig, devices } from "@playwright/test";

// Keep browser E2E isolated from the documented interactive Vite port (3210).
const port = Number(process.env.PLAYWRIGHT_PORT ?? 3211);

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Electron review suites use fixed isolated ports and are resource-heavy.
  // A single worker prevents local and CI launches from closing or stealing
  // one another's API, renderer, and workspace windows.
  workers: 1,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `cross-env VITE_CLY_DEMO_MODE=1 pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
    port,
    reuseExistingServer: !process.env.CI,
    timeout: 45_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
