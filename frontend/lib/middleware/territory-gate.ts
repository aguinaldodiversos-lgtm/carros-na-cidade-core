import { BRAZIL_UFS } from "@/lib/city/brazil-ufs";

/**
 * Gate territorial executado no middleware (Edge runtime) ANTES do
 * Next router pegar as rotas dinâmicas por cidade/UF: `/carros-usados/[uf]`,
 * `/carros-em/[slug]`, `/comprar/estado/[uf]`, `/comprar/cidade/[slug]`,
 * `/cidade/[slug]...` e as landings irmãs `/carros-baratos-em/[slug]`,
 * `/carros-automaticos-em/[slug]` e `/tabela-fipe/[cidade]`. Necessário
 * porque o Next 14.2 retorna HTTP 200 com body "not-found global" quando
 * `notFound()` é chamado em ISR/página (mesmo bug documentado em
 * `regional-page-guard`).
 *
 * A cobertura tem que ser EXAUSTIVA por família: `/comprar/cidade/` ficou de
 * fora até 2026-07-28 e virou uma superfície indexável ilimitada sozinha.
 * Ao criar rota territorial nova, adicione-a aqui no mesmo PR.
 *
 * Sem este gate:
 *   /carros-usados/zz       → 200 + soft-404 UI (Google indexa lixo)
 *   /carros-em/falsa-xx     → 200 + soft-404 UI
 *
 * Com este gate:
 *   /carros-usados/zz       → 404 HTTP real
 *   /carros-em/falsa-xx     → 404 HTTP real
 *
 * Decisões puras sem dependência de `NextRequest/NextResponse` para
 * facilitar teste unitário e portabilidade.
 */

const VALID_UFS: ReadonlySet<string> = new Set<string>(BRAZIL_UFS.map((u) => u.value));

/**
 * Captura `/carros-usados/[uf]` (2 segmentos). NÃO casa com
 * `/carros-usados/regiao/[slug]` (3 segmentos, literal "regiao").
 */
const STATE_ROUTE_RE = /^\/carros-usados\/([^/]+)\/?$/;

/**
 * Captura `/carros-em/[slug]`. Slug canônico deve terminar em UF
 * brasileira real (ex: "atibaia-sp", "belo-horizonte-mg").
 */
const CITY_ROUTE_RE = /^\/carros-em\/([^/]+)\/?$/;

/**
 * Captura `/comprar/estado/[uf]` (rota legada estadual). Mesma defesa
 * 404 real do gate canônico — alias compatibilidade não pode emitir
 * soft-404 para UF inválida.
 */
const LEGACY_STATE_ROUTE_RE = /^\/comprar\/estado\/([^/]+)\/?$/;

/**
 * Captura o PREFIXO da família territorial `/cidade/[slug]...` — incluindo
 * `/cidade/[slug]`, `/cidade/[slug]/marca/[brand]`,
 * `/cidade/[slug]/marca/[brand]/modelo/[model]`, `/abaixo-da-fipe` e
 * `/oportunidades`. O primeiro segmento é SEMPRE o slug canônico da cidade
 * (`nome-uf`). Gate estrutural: slug que não termina em UF brasileira real
 * → 404 HTTP real (evita o soft-404 do Next 14.2.35 para cidade inexistente
 * estruturalmente). Não valida EXISTÊNCIA no banco (isso fica com o backend,
 * que devolve noindex,follow quando a cidade existe mas não há estoque).
 */
const CITY_TERRITORIAL_PREFIX_RE = /^\/cidade\/([^/]+)(?:\/|$)/;

/**
 * Captura o PREFIXO de `/comprar/cidade/[slug]` — o alias transacional que
 * canonicaliza em `/carros-em/[slug]`.
 *
 * Auditoria 2026-07-28: esta era a ÚNICA rota territorial fora do gate. A
 * página validava o slug só por FORMATO (`isValidCitySlug`), sem exigir UF
 * brasileira real, então `/comprar/cidade/xpto-zz` respondia HTTP 200
 * `index,follow` com o título fabricado "Carros usados em Xpto - ZZ" — uma
 * superfície indexável ILIMITADA, não as 5.572 cidades do banco. A irmã
 * `/carros-em/xpto-zz` já devolvia 404 real.
 *
 * Prefixo (e não `$`) por simetria com `/cidade/...`: se um dia surgir
 * subrota sob `/comprar/cidade/[slug]/`, ela nasce coberta.
 *
 * Como nas demais: NÃO valida existência no banco — cidade real sem estoque
 * segue 200 (quem decide indexação é o robots por inventário). O 404 aqui é
 * só para slug que não pode corresponder a cidade nenhuma.
 */
const COMPRAR_CITY_PREFIX_RE = /^\/comprar\/cidade\/([^/]+)(?:\/|$)/;

/**
 * Captura as landings irmãs de `/carros-em` e as ferramentas por cidade —
 * todas com slug canônico `nome-uf`:
 *   `/carros-baratos-em/[slug]`, `/carros-automaticos-em/[slug]`,
 *   `/tabela-fipe/[cidade]`, `/simulador-financiamento/[cidade]`.
 *
 * `simulador-financiamento` entrou em 2026-08-05: era a última rota
 * territorial fora do gate e respondia HTTP 200 até para UF inexistente
 * (`/simulador-financiamento/cidade-inventada-zz`), enquanto as irmãs davam
 * 404. Mesma classe de esquecimento que `/comprar/cidade/` teve até 07-28 —
 * por isso a regra do topo: rota territorial nova entra aqui no mesmo PR.
 *
 * Mesmo gate 404 real das demais: sem isso, o soft-404 do Next 14.2 servia
 * HTTP 200 indexável para cidade inexistente — vetor de páginas-fantasma
 * confirmado na auditoria SEO 2026-07-03. NÃO valida existência no banco
 * (cidade real sem estoque continua 200 + fallback); só rejeita slug cuja UF
 * final não é uma UF brasileira real.
 */
const CITY_LANDING_SIBLINGS_RE =
  /^\/(?:carros-baratos-em|carros-automaticos-em|tabela-fipe|simulador-financiamento)\/([^/]+)\/?$/;

export function isValidBrUf(raw: string): boolean {
  if (!raw) return false;
  const upper = String(raw).trim().toUpperCase();
  return /^[A-Z]{2}$/.test(upper) && VALID_UFS.has(upper);
}

/** Extrai a UF candidata do final do slug (`"atibaia-sp"` → `"sp"`). */
export function extractSlugUf(slug: string): string | null {
  if (!slug) return null;
  const parts = String(slug).trim().toLowerCase().split("-").filter(Boolean);
  if (parts.length < 2) return null;
  return parts[parts.length - 1];
}

export type TerritoryGateDecision =
  | { kind: "pass" }
  | { kind: "block-state-uf-invalid"; uf: string }
  | { kind: "block-legacy-state-uf-invalid"; uf: string }
  | { kind: "block-city-slug-invalid"; slug: string };

/**
 * Decide se o pathname deve passar pelo gate ou ser bloqueado com 404
 * real. Retorna `pass` para qualquer rota que não case com `/carros-
 * usados/[uf]`, `/carros-em/[slug]` ou `/comprar/estado/[uf]` (alias
 * legado).
 */
export function decideTerritoryGate(pathname: string): TerritoryGateDecision {
  const stateMatch = STATE_ROUTE_RE.exec(pathname);
  if (stateMatch) {
    const uf = stateMatch[1];
    if (!isValidBrUf(uf)) {
      return { kind: "block-state-uf-invalid", uf };
    }
    return { kind: "pass" };
  }

  const legacyStateMatch = LEGACY_STATE_ROUTE_RE.exec(pathname);
  if (legacyStateMatch) {
    const uf = legacyStateMatch[1];
    if (!isValidBrUf(uf)) {
      return { kind: "block-legacy-state-uf-invalid", uf };
    }
    return { kind: "pass" };
  }

  const cityMatch = CITY_ROUTE_RE.exec(pathname);
  if (cityMatch) {
    const slug = cityMatch[1];
    const slugUf = extractSlugUf(slug);
    if (!slugUf || !isValidBrUf(slugUf)) {
      return { kind: "block-city-slug-invalid", slug };
    }
    return { kind: "pass" };
  }

  const cityTerritorialMatch = CITY_TERRITORIAL_PREFIX_RE.exec(pathname);
  if (cityTerritorialMatch) {
    const slug = cityTerritorialMatch[1];
    const slugUf = extractSlugUf(slug);
    if (!slugUf || !isValidBrUf(slugUf)) {
      return { kind: "block-city-slug-invalid", slug };
    }
    return { kind: "pass" };
  }

  const comprarCityMatch = COMPRAR_CITY_PREFIX_RE.exec(pathname);
  if (comprarCityMatch) {
    const slug = comprarCityMatch[1];
    const slugUf = extractSlugUf(slug);
    if (!slugUf || !isValidBrUf(slugUf)) {
      return { kind: "block-city-slug-invalid", slug };
    }
    return { kind: "pass" };
  }

  const cityLandingMatch = CITY_LANDING_SIBLINGS_RE.exec(pathname);
  if (cityLandingMatch) {
    const slug = cityLandingMatch[1];
    const slugUf = extractSlugUf(slug);
    if (!slugUf || !isValidBrUf(slugUf)) {
      return { kind: "block-city-slug-invalid", slug };
    }
    return { kind: "pass" };
  }

  return { kind: "pass" };
}
