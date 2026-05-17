import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";

import {
  isRegionalPageCanonicalSelf,
  isRegionalPageEnabled,
  isRegionalPageIndexable,
} from "@/lib/env/feature-flags";
import { fetchRegionByAncora } from "@/lib/regions/fetch-region-ancora";
import {
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

import { buildRegionFaqEntries } from "@/app/carros-usados/regiao/[slug]/region-faq-entries";
import { RegionPageView } from "@/app/carros-usados/regiao/[slug]/region-page-view";

/**
 * Página Regional pública — `/:uf/regiao/:ancora`.
 *
 * URL pública: /sp/regiao/atibaia
 *   uf     = "sp" (UF em minúsculo, validada via lista canônica)
 *   ancora = "atibaia" (slug sem sufixo de UF)
 *
 * O backend reconstrói o slug completo ("atibaia-sp") e verifica que a
 * cidade tem is_ancora = true (pelo menos 1 anúncio ativo aprovado).
 * Cidades sem is_ancora retornam 404 — nenhuma Página Regional é servida
 * para cidades sem cobertura de anúncios.
 *
 * `force-dynamic`: mesmo motivo da rota legada `/carros-usados/regiao/[slug]`.
 * Bug do Next 14.2 em ISR + notFound() retorna status 200 com body de 404.
 * O cache do BFF (5 min Redis + Next fetch cache) compensa a ausência de
 * cache de HTML inteiro.
 *
 * Pipeline de dados: idêntico à rota legada, mas usando fetchRegionByAncora
 * em vez de fetchRegionByCitySlug.
 */
export const dynamic = "force-dynamic";

const VALID_UF_RE = /^[a-z]{2}$/;

interface RegionAncoraPageProps {
  params: { uf: string; ancora: string };
}

const getRegionData = cache(
  async (uf: string, ancora: string): Promise<RegionPayload | null> => {
    return fetchRegionByAncora(uf, ancora);
  }
);

const getAdsForRegion = cache(async (region: RegionPayload) => {
  const filters = regionToAdsSearchFilters(region, { includeState: true });
  return fetchAdsSearch(filters);
});

const getTerritoryContext = cache(async (regionSlug: string) => {
  return resolveTerritory({ level: "region", regionSlug });
});

function buildTitle(name: string, state: string) {
  return `Carros usados na região de ${name} — ${state.toUpperCase()}`;
}

function buildDescription(
  name: string,
  state: string,
  memberCount: number,
  radiusKm: number
) {
  const uf = state.toUpperCase();
  if (memberCount === 0) {
    return `Veja carros usados em ${name}, ${uf} e arredores, com alcance regional de até ${radiusKm} km. Compare ofertas com filtros e contato direto no Carros na Cidade.`;
  }
  return `Veja carros usados em ${name} e em ${memberCount} cidade${memberCount === 1 ? "" : "s"} próxima${memberCount === 1 ? "" : "s"} de ${uf}, com alcance regional de até ${radiusKm} km. Compare ofertas com alcance regional inteligente.`;
}

export async function generateMetadata({
  params,
}: RegionAncoraPageProps): Promise<Metadata> {
  if (!isRegionalPageEnabled() || !VALID_UF_RE.test(params.uf)) {
    notFound();
  }

  const region = await getRegionData(params.uf, params.ancora);
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

  const territory = await getTerritoryContext(region.base.slug);
  const selfUrl = `/${params.uf}/regiao/${params.ancora}`;
  const canonical = isRegionalPageCanonicalSelf()
    ? toAbsoluteUrl(selfUrl)
    : toAbsoluteUrl(`/carros-em/${encodeURIComponent(region.base.slug)}`);

  const indexable = isRegionalPageIndexable();

  let ogImage: string | undefined;
  try {
    const adsResponse = await getAdsForRegion(region);
    const ads = Array.isArray(adsResponse?.data) ? adsResponse.data : [];
    const picked = pickDynamicOgImage(ads);
    if (picked) ogImage = picked;
  } catch {
    ogImage = undefined;
  }

  // Suprime aviso de unused — territory.canonicalUrl pode ser usado no futuro
  void territory;

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
      googleBot: { index: indexable, follow: true },
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
      acceptedAnswer: { "@type": "Answer", text: entry.answer },
    })),
  };
}

export default async function RegionAncoraPage({ params }: RegionAncoraPageProps) {
  if (!isRegionalPageEnabled() || !VALID_UF_RE.test(params.uf)) {
    notFound();
  }

  const region = await getRegionData(params.uf, params.ancora);
  if (!region || !region.base) {
    notFound();
  }

  const adsResponse = await getAdsForRegion(region);
  const rawAds = Array.isArray(adsResponse?.data) ? adsResponse.data : [];
  const totalAds =
    typeof adsResponse?.pagination?.total === "number" && adsResponse.pagination.total >= 0
      ? adsResponse.pagination.total
      : rawAds.length;

  const radiusKm = (region as RegionPayload & { radius_km?: number }).radius_km ?? 80;
  const ads = sortAdsByPriorityAndProximity(rawAds, region.base, region.members);
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
