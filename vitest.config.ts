import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __CLY_INCLUDE_TEST_FIXTURES__: "true",
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
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
