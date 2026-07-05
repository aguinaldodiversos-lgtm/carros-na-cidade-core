import { notFound, permanentRedirect } from "next/navigation";

import { slugFromAncoraParts, slugToRegionHref } from "@/lib/regions/ancora-url";
import { normalizeUf } from "@/lib/buy/territory-variant";

/**
 * Rota legada `/:uf/regiao/:ancora` — agora só redireciona para a
 * URL canônica `/carros-usados/regiao/:citySlug`.
 *
 * Histórico:
 *   - Fase 4 (2026-05-17): esta rota foi criada como tentativa de URL
 *     canônica curta (`/sp/regiao/atibaia`).
 *   - Fase 5 (2026-05-18): briefing arquitetural decidiu o oposto — a
 *     canônica volta a ser `/carros-usados/regiao/atibaia-sp` (slug
 *     completo nome-uf), alinhada com `/carros-em/[slug]`. Este
 *     handler virou redirect 301 permanente.
 *
 * POR QUE NO MIDDLEWARE TAMBÉM?
 *   O middleware emite o redirect ANTES de SSR. Esta página existe
 *   apenas como defesa-em-profundidade caso o matcher do middleware
 *   mude no futuro — para garantir que nunca acidentalmente sirvamos
 *   conteúdo duplicado nesta URL e dilua SEO.
 *
 * BUG NEXT 14.2 LEMBRETE:
 *   `permanentRedirect()` em Server Component pode retornar status 200
 *   + `<meta http-equiv="refresh">` quando o `<head>` já foi flushed.
 *   Por isso confiamos no middleware como caminho primário (308 HTTP
 *   real). Esta rota só roda se o middleware falhar — e nesse caso o
 *   meta-refresh ainda funciona para humanos.
 */
export const dynamic = "force-dynamic";

interface RegionAncoraPageProps {
  params: { uf: string; ancora: string };
}

export default function LegacyAncoraRegionPage({ params }: RegionAncoraPageProps) {
  // GUARD (correção 2026-07-05): esta rota `[uf]` é dinâmica no nível raiz e,
  // sem validação, engolia QUALQUER `/{coisa}/regiao/{coisa}` — inclusive
  // `/sitemaps/regiao/sp.xml`, que virava `uf="sitemaps"` (sliced p/ "si") +
  // `ancora="sp.xml"` → redirect malformado `/carros-usados/regiao/sp.xml-si`
  // → 404. Só redireciona se `uf` for uma UF brasileira REAL (2 letras). Caso
  // contrário 404 limpo — deixa o gerador de sitemap real responder e mata o
  // hijack de `/sitemaps/regiao/*` e de qualquer `/{não-UF}/regiao/{x}`.
  if (!normalizeUf(params.uf)) notFound();

  const slug = slugFromAncoraParts(params.uf, params.ancora);
  if (!slug) notFound();
  permanentRedirect(slugToRegionHref(slug));
}
