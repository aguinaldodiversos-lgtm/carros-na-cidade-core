import { defineConfig } from "vitest/config";
import { applyVitestIntegrationEnv } from "./tests/integration/helpers/integration-db-bootstrap.js";

applyVitestIntegrationEnv();

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "tests/**/*.test.js"],
    exclude: ["node_modules", "frontend"],
    globals: true,
  },
});
