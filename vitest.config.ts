import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globalSetup: ["./tests/helpers/ai-global-setup.ts"],
    globals: true,
    environment: "node",
    include: ["src/**/*.{test,spec}.ts", "tests/**/*.{test,spec}.ts"],
    passWithNoTests: true,
    fileParallelism: false,
    testTimeout: 60000,
    hookTimeout: 60000,
  },
});
