import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  isRegionalPageIndexable,
} from "@/lib/env/feature-flags";
import {
  fetchRegionByCitySlug,
  regionToAdsSearchFilters,
  type RegionPayload,
} from "@/lib/regions/fetch-region";
import {
  aggregateBrandsFromAds,
  aggregateCityCountsFromAds,
  pickDynamicOgImage,
  sortAdsByPriorityAndProximity,
} from "@/lib/regions/regional-facets";
import { fetchAdsSearch } from "@/lib/search/ads-search";
import { buildRegionStructuredDataBlocks } from "@/lib/seo/region-structured-data";
import { toAbsoluteUrl } from "@/lib/seo/site";
import { resolveTerritory } from "@/lib/territory/territory-resolver";

import { buildRegionFaqEntries } from "./region-faq-entries";
import { RegionPageView } from "./region-page-view";

/**
 * `force-dynamic` (NÃO mudar para `revalidate`) — bug crítico do Next 14.2:
 *
 * Quando esta rota tinha `export const revalidate = 300`, o Next.js
 * tratava-a como ISR-able. Em rota ISR-able combinada com `notFound()`
 * dentro do server component, o Next.js servia o conteúdo do
 * `not-found.tsx` global mas retornava **status HTTP 200** em vez de 404.
 *
 * Sintoma reproduzido em produção (commit 1ba73de4): smoke contra
 * /carros-usados/regiao/regiao-fake-zz-smoke-only retornava 200 com o
 * UI "Página não encontrada", quebrando a proteção da feature flag e
 * abrindo o risco de indexação SEO de slugs inexistentes (mesmo com
 * noindex herdado).
 *
 * `dynamic = "force-dynamic"` força runtime por request, e nesse caminho
 * o Next retorna o status code real do `notFound()` (404). Sem perda
 * material de performance: o BFF da região (`fetch-region.ts`) tem
 * cache 5min próprio e `fetchAdsSearch` tem `revalidate: 60` embutido.
 * O que perdemos é o cache do HTML inteiro — aceitável em Fase A→C
 * dado que a rota está gated por flag e tem volume baixo.
 *
 * Não trocar de volta para `revalidate` sem antes confirmar que o
 * comportamento `notFound() → 404` foi corrigido no Next.
 */
export const dynamic = "force-dynamic";

/**
 * Página Regional pública — `/carros-usados/regiao/[slug]`.
 *
 * Estado de rollout (ver `docs/runbooks/regional-page-rollout.md`):
 *  - Fase A: flag `REGIONAL_PAGE_ENABLED=false` → notFound() sem renderizar.
 *  - Fase B: flag `true` em staging → renderiza com `noindex, follow`.
 *  - Fase C: flag `true` em produção, ainda `noindex` até aprovação SEO.
 *  - Fase D: canonical próprio + indexação SEO. Flag `REGIONAL_PAGE_INDEXABLE`
 *           + `REGIONAL_PAGE_CANONICAL_SELF`. Sitemap continua FORA.
 *
 * Promoção SEO (Fase D) é controlada por duas flags independentes:
 *   - `REGIONAL_PAGE_CANONICAL_SELF=true` → canonical aponta para a própria
 *     URL regional (em vez de /carros-em/[slug]).
 *   - `REGIONAL_PAGE_INDEXABLE=true` → emite `robots: index, follow`.
 *
 * Recomendação operacional: ligar `CANONICAL_SELF` ANTES de `INDEXABLE`.
 * Caso contrário, o Googlebot pode indexar a URL regional com canonical
 * para cidade (resultando em "URL canonical alternativa" no Search Console
 * e potencialmente sinalizando a cidade — desejado durante ramp-up — mas
 * dificultando a transição quando promover a regional).
 *
 * Pipeline de dados:
 *   isRegionalPageEnabled? → fetchRegionByCitySlug → regionToAdsSearchFilters
 *   → fetchAdsSearch (status=active filtrado pelo backend) → render.
 *
 * O raio usado pelo backend vem de platform_settings (key
 * `regional.radius_km`, default 80, range 10..150) — editável pelo admin
 * em /admin/regional-settings. O frontend NÃO passa radius — o backend
 * lê do DB. Fonte única de verdade.
 */

interface RegionPageProps {
  params: { slug: string };
}

const getRegionData = cache(async (slug: string): Promise<RegionPayload | null> => {
  return fetchRegionByCitySlug(slug);
});

const getAdsForRegion = cache(async (region: RegionPayload) => {
  const filters = regionToAdsSearchFilters(region, { includeState: true });
  return fetchAdsSearch(filters);
});

const getTerritoryContext = cache(async (slug: string) => {
  // Consome o resolver central — ponto único de verdade para canonical,
  // breadcrumbs e title genérico territorial. O resolver internamente
  // chama fetchRegionByCitySlug; o Next dedupa via fetch cache, então
  // não há RTT extra mesmo quando getRegionData também é chamado.
  return resolveTerritory({ level: "region", regionSlug: slug });
});

function buildTitle(name: string, state: string) {
  return `Carros usados na região de ${name} — ${state.toUpperCase()}`;
}

function buildDescription(name: string, state: string, memberCount: number, radiusKm: number) {
  const uf = state.toUpperCase();
  if (memberCount === 0) {
    return `Veja carros usados em ${name}, ${uf} e arredores, com alcance regional de até ${radiusKm} km. Compare ofertas com filtros e contato direto no Carros na Cidade.`;
  }
  return `Veja carros usados em ${name} e em ${memberCount} cidade${memberCount === 1 ? "" : "s"} próxima${memberCount === 1 ? "" : "s"} de ${uf}, com alcance regional de até ${radiusKm} km. Compare ofertas com alcance regional inteligente.`;
}

export async function generateMetadata({ params }: RegionPageProps): Promise<Metadata> {
  // CRÍTICO: chamar notFound() AQUI, não só no Page. Em Next 14.2 App Router
  // com `dynamic = "force-dynamic"`, o ciclo de SSR é:
  //   1. generateMetadata roda para preencher <head>.
  //   2. Next "comita" o status code com base no resultado.
  //   3. Page (default export) roda depois.
  //   4. notFound() chamado no Page troca o BODY (renderiza not-found UI)
  //      mas é TARDE para trocar o status code — já foi enviado como 200.
  //
  // Sintoma reproduzido em produção (commit ce297b2d): mesmo com
  // force-dynamic, /carros-usados/regiao/atibaia-sp retornava 200 +
  // <template data-dgst="NEXT_NOT_FOUND"></template>. O Page CHAMAVA
  // notFound() corretamente, mas o status já tinha sido comitado.
  //
  // Fix: chamar notFound() AQUI faz Next interromper antes de comitar 200.
  // O Page mantém os mesmos checks como defesa em profundidade — se
  // alguém mudar generateMetadata no futuro e quebrar o gate, o Page
  // ainda protege a renderização (mas perde o status code).
  if (!isRegionalPageEnabled()) {
    notFound();
  }

  const region = await getRegionData(params.slug);
  if (!region || !region.base) {
    notFound();
  }

  const radiusKm = (region as RegionPayload & { radius_km?: number }).radius_km ?? 80;
  const title = buildTitle(region.base.name, region.base.state);
  const description = buildDescription(
    region.base.name,
    region.base.state,
    region.members.length,
    radiusKm
  );

  // Canonical é flag-driven (REGIONAL_PAGE_CANONICAL_SELF):
  //   - false (default): aponta para /carros-em/[slug] (cidade-base).
  //     Proteção temporária do runbook §5 — protege sinal SEO da cidade
  //     enquanto a regional está em ramp-up.
  //   - true: aponta para a própria regional. Consumimos `canonicalUrl`
  //     do TerritoryContext para garantir consistência com qualquer outra
  //     parte do portal que monte a URL canônica regional.
  const territory = await getTerritoryContext(params.slug);
  const canonical = isRegionalPageCanonicalSelf()
    ? toAbsoluteUrl(territory.canonicalUrl)
    : toAbsoluteUrl(`/carros-em/${encodeURIComponent(region.base.slug)}`);

  const indexable = isRegionalPageIndexable();

  // OG image dinâmica simples: primeira imagem válida do primeiro
  // anúncio da região. `getAdsForRegion` é cached(); chamar aqui não
  // duplica fetch — o Page reusa o mesmo resultado. Em qualquer falha
  // (envelope sem data, URL inválida) cai para `undefined` e o OG fica
  // sem image (Twitter/Open Graph default herdado do layout).
  let ogImage: string | undefined;
  try {
    const adsResponse = await getAdsForRegion(region);
    const ads = Array.isArray(adsResponse?.data) ? adsResponse.data : [];
    const picked = pickDynamicOgImage(ads);
    if (picked) ogImage = picked;
  } catch {
    ogImage = undefined;
  }

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: canonical,
      siteName: "Carros na Cidade",
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
      },
    },
  };
}

function buildFaqJsonLd(args: {
  cityName: string;
  citySlug: string;
  stateUF: string;
  members: RegionPayload["members"];
  radiusKm: number;
}) {
  const entries = buildRegionFaqEntries({
    cityName: args.cityName,
    citySlug: args.citySlug,
    stateUF: args.stateUF,
    members: args.members,
    radiusKm: args.radiusKm,
  });

  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: entries.map((entry) => ({
      "@type": "Question",
      name: entry.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: entry.answer,
      },
    })),
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  // Dupla proteção: generateMetadata acima JÁ chama notFound() nos
  // mesmos cenários e isso é o que de fato fixa o status code 404.
  // Os checks aqui são defesa em profundidade — se alguém alterar
  // generateMetadata no futuro removendo um gate, o Page ainda
  // recusa renderizar (perdendo o status code mas mantendo a UI 404).
  if (!isRegionalPageEnabled()) {
    notFound();
  }

  const region = await getRegionData(params.slug);
  if (!region || !region.base) {
    notFound();
  }

  const adsResponse = await getAdsForRegion(region);
  const rawAds = Array.isArray(adsResponse?.data) ? adsResponse.data : [];
  // `pagination.total` é o agregado real do backend. Preferimos esse
  // número à `ads.length` para a "contagem destacada" e para o JSON-LD
  // (a amostra é só a primeira página). Se o envelope vier sem
  // pagination, cai para o tamanho da amostra — sem inventar.
  const totalAds =
    typeof adsResponse?.pagination?.total === "number" && adsResponse.pagination.total >= 0
      ? adsResponse.pagination.total
      : rawAds.length;

  // `radius_km` vem do backend (foi adicionado em getRegionByBaseSlugDynamic).
  // Casts defensivos: se o BFF antigo for cacheado e voltar sem o campo,
  // fallback para 80 (o default declarado em platform_settings).
  const radiusKm = (region as RegionPayload & { radius_km?: number }).radius_km ?? 80;

  // Reordena por prioridade comercial + proximidade. Defesa client-side:
  // o backend já aplica ranking SQL (`buildSortClause` +
  // `baseCityBoostExpr`), este sort garante a regra estratégica no caso
  // de divergência (cache antigo, paginação por relevância, etc.).
  const ads = sortAdsByPriorityAndProximity(rawAds, region.base, region.members);

  // Facets agregadas a partir da AMOSTRA (primeira página). Não chamamos
  // de "estoque" para evitar prometer números do backend agregador
  // (`/api/ads/facets` ainda não está integrado à query regional).
  const topBrands = aggregateBrandsFromAds(ads);
  const cityCounts = aggregateCityCountsFromAds(ads, region.base, region.members);

  const structuredData = buildRegionStructuredDataBlocks({
    base: region.base,
    members: region.members,
    totalAds,
    radiusKm,
    sampleAds: ads.slice(0, 12).map((ad) => ({
      slug: ad.slug,
      title: ad.title,
      brand: ad.brand,
      model: ad.model,
      year: ad.year,
    })),
  });

  // FAQ JSON-LD só faz sentido quando a página é indexável. Sem isso
  // estaríamos alimentando rich snippets do Google a partir de uma URL
  // que ele mandou para não indexar — desperdício.
  const indexable = isRegionalPageIndexable();
  const faqJsonLd = indexable
    ? buildFaqJsonLd({
        cityName: region.base.name,
        citySlug: region.base.slug,
        stateUF: region.base.state.toUpperCase(),
        members: region.members,
        radiusKm,
      })
    : null;

  return (
    <>
      {structuredData.map((block, index) => (
        <script
          key={`region-jsonld-${index}`}
          type="application/ld+json"
          // Server-rendered, no user-controlled fields nested without escaping.
          // `JSON.stringify` é suficiente porque os strings vêm do payload
          // sanitizado do backend e dos próprios builders puros.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
      {faqJsonLd ? (
        <script
          type="application/ld+json"
          data-testid="regional-faq-jsonld"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
        />
      ) : null}
      <RegionPageView
        base={region.base}
        members={region.members}
        ads={ads}
        radiusKm={radiusKm}
        totalAds={totalAds}
        topBrands={topBrands}
        cityCounts={cityCounts}
      />
    </>
  );
}
