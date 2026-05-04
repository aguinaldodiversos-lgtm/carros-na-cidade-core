/**
 * Side-effect module: carrega `dotenv` de forma OPCIONAL.
 *
 * Por que existe (e por que não é uma chamada de função inline em db.js)?
 *
 * Em ESM, os `import` são hoisted e avaliados na ordem em que aparecem,
 * ANTES de qualquer statement do corpo do módulo. `db.js` importa
 * `../../config/env.js`, que executa `parseEnv()` no module-load (linha
 * `export const env = parseEnv();`). Esse `parseEnv()` lê
 * `process.env.DATABASE_URL` e falha se a var não estiver hidratada.
 *
 * Portanto, dotenv precisa rodar ANTES de env.js ser avaliado. Uma
 * chamada inline em db.js (`loadDotenvIfAvailable();` no corpo) rodaria
 * DEPOIS de todos os imports — tarde demais. A solução robusta é um
 * módulo dedicado cujo corpo execute o load como side-effect, e
 * importá-lo PRIMEIRO em db.js: `import "./_load-dotenv-optional.js";`.
 *
 * Por que opcional?
 * No Render (e em outros orquestradores), `DATABASE_URL` já vem do
 * ambiente; o pacote `dotenv` pode não estar instalado em runtime
 * (devDependency no host de prod). Travar o boot por `MODULE_NOT_FOUND`
 * de dotenv quebra workers e scripts operacionais. Em dev local, dotenv
 * está instalado e `.env` continua sendo carregado normalmente.
 *
 * `createRequire` é usado em vez de `import("dotenv")` (dynamic import)
 * para preservar a semântica SÍNCRONA — sem top-level await, sem
 * mudança de ordem na avaliação dos módulos importadores.
 */

import { createRequire } from "node:module";

const NOT_FOUND_CODES = new Set(["MODULE_NOT_FOUND", "ERR_MODULE_NOT_FOUND"]);

export function loadDotenvIfAvailable({
  // Injeção pra testes — defaults pra createRequire local.
  requireFn = createRequire(import.meta.url),
} = {}) {
  let dotenv;
  try {
    dotenv = requireFn("dotenv");
  } catch (error) {
    if (error && NOT_FOUND_CODES.has(error.code)) {
      // dotenv ausente é OK em produção/Render. Outros erros propagam.
      return { loaded: false, reason: "module_not_found" };
    }
    throw error;
  }

  // dotenv pode expor `config` direto (CJS) ou via `default.config` (ESM).
  const config =
    typeof dotenv?.config === "function"
      ? dotenv.config
      : typeof dotenv?.default?.config === "function"
        ? dotenv.default.config
        : null;

  if (!config) {
    return { loaded: false, reason: "no_config_function" };
  }

  config();
  return { loaded: true };
}

// Side-effect: roda no module-load. Side-effect é INTENCIONAL — esse
// módulo só existe pra produzir esse efeito antes dos demais imports.
loadDotenvIfAvailable();
