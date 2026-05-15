// Stub do pacote `server-only` para vitest backend.
//
// No bundle do Next.js, `import "server-only"` joga erro se um client
// component importar. Em ambiente Node de teste (vitest), o codigo
// inevitavelmente roda server-side, entao o stub vazio e seguro.
//
// Aliasado em vitest.config.js.
export default {};
