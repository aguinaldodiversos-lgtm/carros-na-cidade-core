// frontend/lib/city/public-default-city.ts
//
// A cidade padrão do portal, resolvida do ESTOQUE REAL — não de um literal.
//
// ── O defeito que este módulo elimina (SEO Fase 4.1A, achado P1-2) ───────────
// `lib/site/public-config.ts` trazia `FALLBACK_PUBLIC_CITY.slug =
// "sao-paulo-sp"`, escolhido antes do invariante "cidade existe se tem
// anúncio". São Paulo tem ZERO anúncios ativos, então o gate territorial
// responde 404 para as seis rotas de cidade. Como o Googlebot nunca carrega o
// cookie `cnc_city`, o crawler recebia SEMPRE essa variante — cinco links
// mortos por página, medidos em produção em 2026-08-31.
//
// Trocar `sao-paulo-sp` por `atibaia-sp` apenas moveria o defeito para o dia
// em que Atibaia ficasse sem estoque, ou para a primeira cidade nova. A cidade
// padrão precisa ser CONSEQUÊNCIA dos dados, como o resto do invariante.
//
// ── Sem consulta nova ────────────────────────────────────────────────────────
// Reusa `fetchPublicCitySet()`, que já bate em `/api/public/cities/public-set`
// com `revalidate: 60` e tag `public-city-set` — a MESMA janela do gate de
// existência. Uma mudança de estoque reflete aqui no mesmo tempo em que muda o
// 404/200 da cidade. Nenhum cache novo, nenhum TTL novo.
//
// ── `null` é uma resposta ────────────────────────────────────────────────────
// Portal sem nenhuma cidade pública devolve `null`, e quem consome tem de
// degradar para rota não-territorial. Inventar slug aqui recriaria o bug.

import { fetchPublicCitySet, isPublicCity, type PublicCitySet } from "@/lib/city/public-city-set";
import { buildCityLabel } from "@/lib/city/city-types";
import type { CityRef } from "@/lib/city/city-types";

/** `"sao-jose-dos-campos-sp"` → `"São Jose Dos Campos"` (aproximação de rótulo). */
function cityNameFromSlug(slug: string): string {
  const parts = slug.split("-").filter(Boolean);
  const withoutUf = parts.length > 1 ? parts.slice(0, -1) : parts;
  return withoutUf
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
    .trim();
}

/**
 * Cidade pública primária como `CityRef`, ou `null` se não houver nenhuma.
 *
 * Server-only: chamada em Server Component / route handler. O cliente continua
 * usando `usePublicCitySet()` para saber se a cidade ATUAL é pública — são
 * perguntas diferentes sobre o mesmo conjunto.
 */
export async function resolvePublicDefaultCity(): Promise<CityRef | null> {
  return primaryCityRef(await fetchPublicCitySet());
}

/** `primaryCity` do conjunto → `CityRef`, ou `null` se não houver. */
function primaryCityRef(set: PublicCitySet | null): CityRef | null {
  const primary = set?.primaryCity;
  if (!primary?.slug) return null;

  const name = cityNameFromSlug(primary.slug);
  if (!name) return null;

  const state = primary.uf ?? "";

  return {
    slug: primary.slug,
    name,
    state,
    label: state ? buildCityLabel(name, state) : name,
  };
}

/**
 * Cidade do COOKIE — mas só se ela ainda for pública.
 *
 * ── O defeito que isto fecha (validação 4.1A, 2026-09-02) ────────────────────
 * `app/layout.tsx` confiava no cookie sem conferir o conjunto público. Medido no
 * build local com `cnc_city = altaneira-ce` (cidade fora do conjunto): o HTML de
 * SSR saía com quatro links mortos —
 *
 *     /carros-em/altaneira-ce        404
 *     /carros-baratos-em/altaneira-ce 404
 *     /tabela-fipe/altaneira-ce      404
 *     /blog/altaneira-ce             404
 *
 * O `CityContext` corrige isso DEPOIS da hidratação (descarta cidade que saiu do
 * conjunto), mas quem não executa JS — o crawler — só vê o HTML. E é a mesma
 * classe do achado P1-2: uma cidade assumida sem conferir estoque, só que pela
 * via do cookie em vez da via do literal.
 *
 * As rotas-índice já faziam essa checagem
 * (`territorial-index-redirect.ts`) — por isso `/tabela-fipe` ia para a cidade
 * certa enquanto o cabeçalho ia para a morta. Agora a regra é a mesma nos dois.
 *
 * ── Fail-open preservado ─────────────────────────────────────────────────────
 * Conjunto indisponível (`set === null`) MANTÉM o cookie. "Não consegui saber"
 * nunca pode descartar a preferência de todo mundo — é a mesma política do gate
 * e do `usePublicCitySet` (só `false` autoriza degradar).
 */
export async function resolveCookieOrPrimaryCity(
  cookieCity: CityRef | null
): Promise<CityRef | null> {
  const set = await fetchPublicCitySet();

  // Backend fora: não sabemos, então não degradamos.
  if (!set) return cookieCity;

  if (cookieCity && isPublicCity(set, cookieCity.slug)) return cookieCity;

  return primaryCityRef(set);
}
