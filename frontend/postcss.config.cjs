// frontend/postcss.config.cjs
// NOTE: .cjs porque o projeto usa "type": "module" (ESM). PostCSS config em CJS evita erro de build.
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
