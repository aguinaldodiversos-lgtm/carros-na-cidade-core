/**
 * Extrai o slug da cidade a partir do `pathname` quando a rota é uma
 * **rota territorial** com cidade-base explícita no URL.
 *
 * Por que existe?
 *   O `CityContext` resolve a cidade ativa a partir de query string
 *   (`?city_slug=`), cookie, localStorage e fallback. Antes desta função
 *   ele NÃO inspecionava o pathname — resultado: ao visitar
 *   `/carros-usados/regiao/atibaia-sp` com cookie=sao-paulo-sp, o header
 *   continuava mostrando São Paulo. Comunicação territorial incoerente.
 *
 *   Aqui derivamos o slug do path em rotas territoriais conhecidas. O
 *   caller (CityContext) decide a prioridade — atualmente:
 *   query > path > cookie/localStorage > fallback.
 *
 * Decisões de escopo:
 *   1. Lista de prefixos é **explícita** (allowlist). Adicionar uma rota
 *      nova requer atualizar este arquivo. Mais previsível do que tentar
 *      adivinhar pelo formato do slug.
 *   2. O slug é validado com regex estrito `^[a-z0-9-]+-[a-z]{2}$`
 *      (formato canônico `nome-uf`). Slugs que não casarem retornam
 *      `null` — defesa contra slugs de outras coisas (ex.: posts de
 *      blog no futuro que reusarem `/blog/[slug]`).
 *   3. Rotas com mais de um segmento depois do prefixo retornam `null`
 *      (ex.: `/carros-usados/regiao/atibaia-sp/comparar`). Não tentamos
 *      adivinhar a intenção em subpaths.
 *   4. Função **pura**, sem dependência de runtime. Testável em isolado.
 */

/**
 * Regex do formato canônico de slug territorial do portal:
 *   - letras minúsculas/dígitos/hífens
 *   - sufixo `-uf` com 2 letras minúsculas
 *
 * Sincronizado com a regex que o backend usa para `city_slugs` em
 * `/api/ads/search` (`^[a-z0-9-]+-[a-z]{2}$`). Manter alinhado evita
 * que o header tente exibir uma cidade que o backend recusaria.
 */
export const CITY_SLUG_REGEX = /^[a-z0-9-]+-[a-z]{2}$/;

/**
 * Prefixos de rotas territoriais. Cada string deve terminar com `/` e
 * representar a porção do path ANTES do slug da cidade. O extrator
 * compara via `startsWith` e pega o segmento imediatamente seguinte.
 *
 * Mantenha em ordem alfabética para facilitar revisão futura.
 */
const TERRITORIAL_ROUTE_PREFIXES: readonly string[] = [
  "/blog/",
  "/carros-automaticos-em/",
  "/carros-baratos-em/",
  "/carros-em/",
  "/carros-usados/regiao/",
  "/cidade/",
  "/comprar/cidade/",
  "/simulador-financiamento/",
  "/tabela-fipe/",
];

/**
 * Devolve o slug da cidade derivado do pathname, ou `null` se a rota
 * não for territorial reconhecida ou o segmento não casar com o formato
 * de slug canônico.
 *
 * Robustez:
 *   - tolera trailing slash (`/carros-em/atibaia-sp/`).
 *   - rejeita subpaths (`/carros-em/atibaia-sp/oportunidades` → null).
 *   - rejeita slug ausente (`/carros-em/` → null).
 *   - rejeita slug com formato fora do padrão (`/carros-em/atibaia` → null).
 */
export function extractCitySlugFromPathname(pathname: string | null | undefined): string | null {
  if (typeof pathname !== "string") return null;
  const path = pathname.trim();
  if (!path) return null;

  for (const prefix of TERRITORIAL_ROUTE_PREFIXES) {
    if (!path.startsWith(prefix)) continue;
    const rest = path.slice(prefix.length).replace(/\/+$/, "");
    if (!rest) return null; // prefixo sem slug
    // Subpath não conta — só o segmento imediatamente após o prefixo.
    if (rest.includes("/")) return null;
    if (!CITY_SLUG_REGEX.test(rest)) return null;
    return rest;
  }

  return null;
}
