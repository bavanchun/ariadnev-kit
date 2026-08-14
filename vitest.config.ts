import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/src/**/*.test.ts"],
    coverage: {
      provider: "v8",
      include: [
        "packages/cli/src/adapt/**/*.ts",
        "packages/cli/src/ui/**/*.ts",
        "packages/cli/src/cli/emit.ts",
        "packages/cli/src/doctor/audit-score.ts",
        "packages/cli/src/doctor/audit.ts",
        "packages/cli/src/doctor/audit-scripts.ts",
        "packages/cli/src/security/**/*.ts",
        "packages/cli/src/eval/**/*.ts",
        "packages/cli/src/graph/**/*.ts",
        "packages/cli/src/harness/**/*.ts",
        "packages/cli/src/context/**/*.ts",
        "packages/cli/src/history/**/*.ts",
        "packages/cli/src/kit/claim-*.ts",
        "packages/cli/src/telemetry/**/*.ts",
      ],
      exclude: ["**/*.test.ts", "**/__fixtures__/**"],
      thresholds: { lines: 95, functions: 95, statements: 95 },
    },
  },
});
