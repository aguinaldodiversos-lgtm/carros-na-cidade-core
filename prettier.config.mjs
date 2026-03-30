/** @type {import("prettier").Config} */
export default {
  printWidth: 100,
  semi: true,
  singleQuote: false,
  trailingComma: "es5",
  endOfLine: "lf",
  overrides: [
    {
      files: "*.md",
      options: { proseWrap: "preserve" },
    },
  ],
};
