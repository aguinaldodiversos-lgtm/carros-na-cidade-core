/**
 * Fonte ÚNICA das URLs territoriais de cidade.
 *
 *   "Ver os carros disponíveis em uma cidade"  ⇒  /carros-em/[cidade-uf]
 *
 * Antes desta correção o portal montava essa mesma intenção de quatro jeitos —
 * `/comprar?city_slug=X`, `/comprar/cidade/X`, `/cidade/X` e `/carros-em/X` —
 * cada um com canonical próprio. O sinal de autoridade ficava dividido entre
 * URLs que representam o MESMO recurso, e o Search Console reportava as
 * territoriais como "página alternativa com canônica diferente".
 *
 * ── Por que este módulo e não `territory-variant` ────────────────────────────
 * `territory-variant` carrega a semântica de FILTROS do catálogo (normalização,
 * merge, query string). A montagem da URL canônica não depende de nada disso e
 * é consumida por Server Components, Client Components, middleware (Edge),
 * sitemaps e testes. Isolar deixa a dependência num só sentido:
 *
 *     canonical-city-path  ←  territory-variant  ←  páginas/componentes
 *
 * A validação de slug vive AQUI e `territory-variant.isValidBrazilianCitySlug`
 * delega para cá — uma implementação só. Duas implementações de "este slug é
 * uma cidade?" foi exatamente o defeito que deixou `/comprar/cidade/xpto-zz`
 * respondendo 200 indexável até 2026-07-28.
 *
 * ── Restrições do contrato ───────────────────────────────────────────────────
 *  - Puro: sem `window`, sem `process.env`, sem fetch. Roda em qualquer runtime.
 *  - Nunca embute cidade fixa. O slug recebido é o slug devolvido — não existe
 *    fallback territorial aqui. Cidade desconhecida devolve `null` e quem chama
 *    decide (404, link institucional, omitir o link).
 *  - A URL canônica é LIMPA: sem `sort`, sem `city_slug`, sem `page=1`, sem
 *    parâmetro de tracking. Query só entra por `buildCanonicalCityHref`, e
 *    somente a que o chamador declarar.
 */

import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

/** Prefixo da família canônica. Um só literal em todo o portal. */
export const CANONICAL_CITY_PATH_PREFIX = "/carros-em";

/**
 * Normaliza a forma do slug sem inventar dados: apara espaços, remove barras
 * das pontas e colapsa hífens repetidos. NÃO transcreve acentos nem adivinha
 * UF — slug malformado continua malformado e é rejeitado na validação.
 */
export function normalizeCitySlug(raw: string | null | undefined): string {
  return String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/^\/+|\/+$/g, "")
    .replace(/-{2,}/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** `"sao-jose-dos-campos-sp"` → `"SP"`; `""` quando não há sufixo de UF. */
function ufSuffixOf(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  if (parts.length < 2) return "";
  const last = parts[parts.length - 1];
  return /^[a-z]{2}$/.test(last) ? last.toUpperCase() : "";
}

/**
 * Slug territorial VÁLIDO: forma `nome-uf` E UF brasileira REAL.
 *
 * O segundo teste não é preciosismo — sem ele `cidade-falsa-xx` passa no regex,
 * cai no fetch, volta vazia e a rota responde soft-404 (HTTP 200 indexável).
 *
 * NÃO responde "esta cidade tem anúncio": existência é do gate de middleware
 * (`city-existence-gate`), que consulta o conjunto derivado do estoque ativo.
 * Aqui é só "isto tem forma de cidade brasileira".
 */
export function isValidCanonicalCitySlug(slug: string | null | undefined): boolean {
  const normalized = normalizeCitySlug(slug);
  if (!normalized) return false;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(normalized)) return false;

  const uf = ufSuffixOf(normalized);
  if (!uf) return false;

  return BRAZIL_UFS.some((entry) => entry.value === uf);
}

/**
 * A URL canônica da intenção "carros à venda em [cidade]".
 *
 * `null` para slug inválido — deliberadamente, para que um slug ruim não vire
 * um link quebrado silencioso. Quem monta navegação usa
 * `buildCanonicalCityHref` e informa o destino alternativo.
 *
 *   getCanonicalCityPath("atibaia-sp")            → "/carros-em/atibaia-sp"
 *   getCanonicalCityPath("braganca-paulista-sp")  → "/carros-em/braganca-paulista-sp"
 *   getCanonicalCityPath("xpto-zz")               → null
 */
export function getCanonicalCityPath(slug: string | null | undefined): string | null {
  const normalized = normalizeCitySlug(slug);
  if (!isValidCanonicalCitySlug(normalized)) return null;
  return `${CANONICAL_CITY_PATH_PREFIX}/${encodeURIComponent(normalized)}`;
}

/**
 * Igual à anterior, com destino alternativo explícito para uso em `href`.
 *
 * O fallback é do CHAMADOR e nunca é uma cidade: usar "a cidade padrão" quando
 * o slug falha é como se produzem doorway pages — o usuário pede a cidade A e
 * recebe o estoque da cidade B sob a URL da A.
 */
export function buildCanonicalCityHref(
  slug: string | null | undefined,
  fallbackHref: string
): string {
  return getCanonicalCityPath(slug) ?? fallbackHref;
}

/**
 * Anexa query à canônica. Só o que o chamador passar, nesta ordem, sem defaults.
 *
 * Existe para paginação e filtros aplicados pelo usuário (`?page=2`), NUNCA
 * para canonical/sitemap — esses usam `getCanonicalCityPath` puro.
 */
export function buildCanonicalCityPathWithQuery(
  slug: string | null | undefined,
  query: Record<string, string | number | undefined | null>
): string | null {
  const base = getCanonicalCityPath(slug);
  if (!base) return null;

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    params.set(key, String(value));
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

/**
 * Extrai o slug de uma URL canônica de cidade. `null` quando o path não é dessa
 * família. Usado pelos testes de regressão e pelo sitemap para conferir que uma
 * entry aponta para a canônica, não para um alias.
 */
export function extractCitySlugFromCanonicalPath(path: string | null | undefined): string | null {
  const raw = String(path ?? "").trim();
  if (!raw) return null;

  let pathname = raw;
  if (raw.includes("://")) {
    try {
      pathname = new URL(raw).pathname;
    } catch {
      return null;
    }
  }

  const match = /^\/carros-em\/([^/?#]+)\/?$/.exec(pathname.split("?")[0].split("#")[0]);
  if (!match) return null;

  const slug = normalizeCitySlug(decodeURIComponent(match[1]));
  return isValidCanonicalCitySlug(slug) ? slug : null;
}
