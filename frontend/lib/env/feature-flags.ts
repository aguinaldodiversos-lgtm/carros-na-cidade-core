import "server-only";

/**
 * Feature flags server-only do frontend.
 *
 * Política:
 * - TODA flag aqui é server-only. NUNCA prefixar com `NEXT_PUBLIC_` —
 *   `NEXT_PUBLIC_*` vaza no bundle client e qualquer pessoa lendo o JS
 *   público vê o valor (e infere o roadmap).
 * - `import "server-only"` faz o Next abortar o build se algum client
 *   component importar este arquivo. Defesa em profundidade.
 * - Default seguro = `false`. Flags só ligam quando o env var existe E
 *   bate exatamente com o contrato — sem coerção indulgente. Em produção,
 *   "default false" significa que esquecer de configurar a env var nunca
 *   ativa um caminho não testado.
 */

/**
 * Controla se a futura Página Regional pública (rota `/regiao/[slug]`,
 * ainda não criada) está ativa.
 *
 * Contrato:
 * - retorna `true` SOMENTE quando `process.env.REGIONAL_PAGE_ENABLED === "true"`.
 * - qualquer outro valor (`"TRUE"`, `"1"`, `"yes"`, `"sim"`, `" true "`,
 *   `""`, `undefined`, `null`) retorna `false`.
 * - sem fallback de coerção. O contrato estrito evita que typos no
 *   painel do Render (ex.: `True`, `1`) liguem a página em prod por
 *   acidente — defaultar pra `false` é a falha segura.
 *
 * Quando a Página Regional for criada, ela DEVE chamar esta função
 * antes de renderizar e devolver 404 (notFound()) quando false. Assim
 * o roll-out fica controlado: ligamos a env var só no ambiente onde já
 * validamos canonical/sitemap/SEO.
 *
 * NÃO usar `NEXT_PUBLIC_REGIONAL_PAGE_ENABLED`. A flag é server-only
 * por design — clients não devem nem saber se a página existe enquanto
 * o roll-out está parcial.
 */
export function isRegionalPageEnabled(): boolean {
  return process.env.REGIONAL_PAGE_ENABLED === "true";
}
