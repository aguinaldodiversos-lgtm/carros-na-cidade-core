import path from "node:path";
import { defineConfig } from "vitest/config";
import { applyVitestIntegrationEnv } from "./tests/integration/helpers/integration-db-bootstrap.js";

applyVitestIntegrationEnv();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "frontend"),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "tests/**/*.test.js"],
    exclude: ["node_modules", "frontend"],
    globals: true,
    coverage: {
      provider: "v8",
      include: ["src/modules/**/*.js", "src/shared/**/*.js", "src/infrastructure/**/*.js"],
      exclude: ["**/node_modules/**"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage/backend",
      thresholds: {
        lines: 6,
        branches: 30,
        functions: 8,
        statements: 6,
      },
    },
  },
});
