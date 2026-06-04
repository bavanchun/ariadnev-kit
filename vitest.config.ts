import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: ["packages/cli/src/adapt/**/*.ts"],
      exclude: ["**/*.test.ts", "**/__fixtures__/**"],
      thresholds: { lines: 95, functions: 95, statements: 95 },
    },
  },
});
