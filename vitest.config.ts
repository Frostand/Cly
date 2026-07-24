import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __CLY_INCLUDE_DEMOS__: "true",
  },
  test: {
    environment: "jsdom",
    globals: true,
    // The full suite renders several Electron-scale workspaces in parallel.
    // Keep legitimate interaction tests from becoming load-dependent flakes.
    testTimeout: 10_000,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
