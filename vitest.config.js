import path from "node:path";
import { defineConfig } from "vitest/config";
import { applyVitestIntegrationEnv } from "./tests/integration/helpers/integration-db-bootstrap.js";

applyVitestIntegrationEnv();

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "frontend"),
      // O frontend usa `import "server-only"` para impedir vazamento de
      // INTERNAL_API_TOKEN no bundle do client. Esse pacote so existe no
      // node_modules do frontend. Quando os testes do backend importam
      // codigo do frontend (ex: fetchResolvedCityByIdFromBackend), o
      // `server-only` precisa resolver para algo no contexto Node — basta
      // um stub vazio, porque o teste roda server-side por definicao.
      "server-only": path.resolve(import.meta.dirname, "tests/helpers/server-only-stub.js"),
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
