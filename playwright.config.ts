import { defineConfig, devices } from "@playwright/test";

const parsePort = (value: string | undefined, fallback: number) => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 && parsed <= 65_535
    ? parsed
    : fallback;
};

// Keep browser E2E isolated from the documented interactive Vite port (3210).
const port = parsePort(process.env.PLAYWRIGHT_PORT, 3211);
// Never let Vite proxy /api back into its own E2E server. Unmocked API calls
// should fail closed instead of recursively proxying until the server stalls.
const fallbackApiPort = port === 65_535 ? 3212 : port + 1;
const configuredApiPort = parsePort(
  process.env.PLAYWRIGHT_API_PORT,
  fallbackApiPort,
);
const apiPort =
  configuredApiPort === port ? fallbackApiPort : configuredApiPort;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  // Electron review suites use fixed isolated ports and are resource-heavy;
  // serialize CI workers so launches cannot starve or race one another.
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `cross-env VITE_CLY_DEMO_MODE=1 ELECTRON_API_PORT=${apiPort} pnpm exec vite --host 127.0.0.1 --port ${port} --strictPort`,
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
