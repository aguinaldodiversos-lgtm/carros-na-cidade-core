import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.js", "tests/**/*.test.js"],
    exclude: ["node_modules", "frontend"],
    globals: true,
  },
});
