import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/features/research/domain/**/*.test.ts"],
    coverage: {
      reporter: ["text", "html"],
    },
  },
});
