import type { Metadata } from "next";
import { permanentRedirect } from "next/navigation";

interface CityOpportunitiesPageProps {
  params: { slug: string };
  searchParams?: Record<string, string | string[] | undefined>;
}

/**
 * `/cidade/[slug]/oportunidades` → 308 para `/cidade/[slug]/abaixo-da-fipe`.
 *
 * Decisão da rodada de simplificação:
 *   - Antes: /oportunidades e /abaixo-da-fipe renderizavam o MESMO catálogo
 *     (anúncios `below_fipe=true` por cidade) com cards e textos quase
 *     idênticos. O sitemap já as tratava como duplicatas
 *     (`buildOpportunitiesTransitionEntries()` retorna `[]`) e ambas
 *     canonicalizavam para `/carros-baratos-em/[slug]`.
 *   - Agora: /oportunidades é apenas um redirect permanente (308) para
 *     /abaixo-da-fipe — a rota canônica transacional. Preserva tráfego
 *     externo, transfere SEO weight, elimina conteúdo duplicado.
 *
 * Por que NÃO usar middleware? O matcher do middleware atual é seletivo
 * (rotas legadas /carros-em-X com hífen único, /painel/anuncios/novo, etc.).
 * Adicionar /cidade/[slug]/oportunidades ali alargaria o escopo
 * desnecessariamente; manter o redirect na própria page.tsx mantém a
 * decisão local e auditável.
 *
 * Por que `permanentRedirect` (308) e não `redirect` (307)?
 * 308 = "permanent + preserve method"; é o status correto para fusão de
 * rotas SEO. Buscadores e CDNs cacheiam 308 corretamente como movimento
 * permanente, transferindo autoridade para o destino.
 */

function buildTargetPath(
  slug: string,
  searchParams?: Record<string, string | string[] | undefined>
): string {
  const base = `/cidade/${encodeURIComponent(slug)}/abaixo-da-fipe`;
  if (!searchParams) return base;

  // Preserva filtros não-territoriais (sort, brand, model, etc.) que o
  // visitante pode ter trazido via UTM ou link externo. Só preservamos
  // chaves seguras — query params arbitrários não são propagados.
  const safeKeys = new Set([
    "q",
    "brand",
    "model",
    "sort",
    "page",
    "min_price",
    "max_price",
    "year_min",
    "year_max",
    "fuel_type",
    "transmission",
    "body_type",
  ]);

  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(searchParams)) {
    if (!safeKeys.has(key)) continue;
    const first = Array.isArray(value) ? value[0] : value;
    if (first === undefined || first === null || first === "") continue;
    params.set(key, String(first));
  }

  const qs = params.toString();
  return qs ? `${base}?${qs}` : base;
}

export async function generateMetadata(): Promise<Metadata> {
  // Mesmo redirecionando, declaramos noindex,follow por defesa: se algum
  // crawler atingir esta URL antes de processar o 308, evitamos sinal de
  // conteúdo duplicado.
  return {
    robots: { index: false, follow: true },
  };
}

export default function CityOpportunitiesRedirect({
  params,
  searchParams,
}: CityOpportunitiesPageProps) {
  permanentRedirect(buildTargetPath(params.slug, searchParams));
}
