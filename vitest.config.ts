import { defineConfig } from "vitest/config";

export default defineConfig({
  define: {
    __CLY_INCLUDE_DEMOS__: "true",
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}", "electron/**/*.test.{ts,tsx}"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
