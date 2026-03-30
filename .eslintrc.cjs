module.exports = {
  root: true,
  env: { node: true, es2022: true },
  parserOptions: { ecmaVersion: 2022, sourceType: "module" },
  extends: ["eslint:recommended"],
  ignorePatterns: ["node_modules/", "frontend/", "dist/", "*.min.js", "src/scripts/"],
  overrides: [
    {
      files: ["src/**/*.js"],
      rules: {
        "no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
        "no-console": "warn",
      },
    },
    {
      files: ["src/modules/**/*.js", "src/brain/**/*.js", "src/shared/domainLog.js"],
      rules: {
        "no-console": "error",
      },
    },
  ],
};
