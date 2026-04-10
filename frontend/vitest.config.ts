import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  esbuild: {
    jsx: "automatic",
  },
  test: {
    environment: "node",
    globals: false,
    include: ["**/*.test.ts", "**/*.test.tsx"],
    exclude: ["node_modules", "e2e/**", ".next/**"],
    coverage: {
      provider: "v8",
      include: ["lib/**/*.ts", "lib/**/*.tsx", "services/**/*.ts", "components/**/*.tsx"],
      exclude: ["**/*.test.ts", "**/*.test.tsx", "**/node_modules/**"],
      reporter: ["text", "json-summary", "html"],
      reportsDirectory: "./coverage/frontend",
      thresholds: {
        lines: 2,
        branches: 55,
        functions: 48,
        statements: 2,
      },
    },
  },
  resolve: {
    alias: {
      "@": root,
    },
  },
});
