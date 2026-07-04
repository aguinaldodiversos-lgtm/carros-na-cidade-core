// frontend/app/tabela-fipe/[cidade]/page.tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { FipePageClient } from "@/components/fipe/FipePageClient";
import { isValidBrazilianCitySlug } from "@/lib/buy/territory-variant";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { normalizePublicAd, publicCatalogPageCopy } from "@/lib/public-contracts";
import { fetchAdsSearch } from "@/lib/search/ads-search";

type PageProps = {
  params: {
    cidade: string;
  };
};

function prettifyCitySlug(slug: string) {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

  const cityName = parts
    .slice(0, hasUf ? -1 : undefined)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "sao") return "São";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");

  return {
    name: cityName || "São Paulo",
    state: hasUf ? ufCandidate : "SP",
    label: `${cityName || "São Paulo"} - ${hasUf ? ufCandidate : "SP"}`,
  };
}

/**
 * `force-dynamic` (correção de ordem semântica/SSR 2026-06-27 + soft-404
 * 2026-07-03).
 *
 * O root layout usa `cookies()`/`headers()` → toda rota já é dinâmica (ƒ).
 * Com `export const revalidate`, o Next emitia o shell estático (header +
 * FOOTER) e transmitia o `<main>` (incl. H1 "Consultar Tabela FIPE") DEPOIS
 * do footer, num Suspense vazio — crawler via rodapé/e-mail antes do H1.
 * `force-dynamic` renderiza inline (H1 antes do footer). Mesmo padrão de
 * `/carros-em/[slug]`. `fetchAdsSearch` mantém cache próprio (revalidate 60).
 *
 * CRÍTICO: declarar `dynamic` ANTES de `generateMetadata`. Só assim o
 * `notFound()` do gate de cidade inexistente comita HTTP 404 real; declarado
 * depois, o Next renderiza o body de not-found mas responde 200 (soft-404) —
 * exatamente o bug que esta rota tinha (auditoria 2026-07-03).
 */
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  // Cidade inexistente → 404 real (comitado no generateMetadata com
  // force-dynamic). Antes, `/tabela-fipe/cidade-falsa-xx` respondia 200
  // indexável (soft-404). Cidade real sem anúncios continua 200 (a página é
  // uma ferramenta FIPE + fallback), só a UF inválida cai no notFound().
  if (!isValidBrazilianCitySlug(params.cidade)) notFound();

  const city = prettifyCitySlug(params.cidade);

  // Briefing P2-D 2026-05-25 — copy oficial via helper único.
  // Preservamos fallback inline (drop-in compatível).
  const baseCopy = publicCatalogPageCopy("fipe", { label: city.name });

  return {
    title:
      baseCopy.metaTitle ?? `Tabela FIPE em ${city.name} | Consulte o valor do seu veículo`,
    description:
      baseCopy.metaDescription ??
      `Consulte a Tabela FIPE em ${city.name}, compare o valor do seu veículo com anúncios locais e veja destaques e oportunidades abaixo da FIPE na sua cidade.`,
    alternates: {
      canonical: `/tabela-fipe/${params.cidade}`,
    },
    openGraph: {
      title: `Tabela FIPE em ${city.name}`,
      description: `Consulte o valor FIPE do seu veículo e compare com anúncios locais em ${city.name}.`,
      url: `/tabela-fipe/${params.cidade}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export default async function TabelaFipeCidadePage({ params }: PageProps) {
  if (!isValidBrazilianCitySlug(params.cidade)) notFound();

  const city = prettifyCitySlug(params.cidade);

  const [highlightResult, belowFipeResult, fallbackRecentResult] = await Promise.allSettled([
    fetchAdsSearch({
      city_slug: params.cidade,
      highlight_only: true,
      sort: "highlight",
      limit: 10,
      page: 1,
    }),
    fetchAdsSearch({
      city_slug: params.cidade,
      below_fipe: true,
      sort: "relevance",
      limit: 10,
      page: 1,
    }),
    fetchAdsSearch({
      city_slug: params.cidade,
      sort: "recent",
      limit: 10,
      page: 1,
    }),
  ]);

  // Defesa em profundidade — briefing P0 2026-05-24 (hasRealPrice) +
  // briefing P2-D 2026-05-25 (normalizePublicAd: drop slug inválido,
  // dirty data residual, price ≤ 0).
  const filterPublic = <T,>(ad: T) =>
    hasRealPrice(ad as Parameters<typeof hasRealPrice>[0]) && normalizePublicAd(ad) !== null;

  const fallbackRecent = (
    fallbackRecentResult.status === "fulfilled" ? fallbackRecentResult.value.data || [] : []
  ).filter(filterPublic);

  const highlightFromBackend = (
    highlightResult.status === "fulfilled" ? highlightResult.value.data || [] : []
  ).filter(filterPublic);

  const opportunityFromBackend = (
    belowFipeResult.status === "fulfilled" ? belowFipeResult.value.data || [] : []
  ).filter(filterPublic);

  const highlightAds = highlightFromBackend.length > 0 ? highlightFromBackend : fallbackRecent;
  const opportunityAds =
    opportunityFromBackend.length > 0 ? opportunityFromBackend : fallbackRecent;

  return (
    <FipePageClient
      citySlug={params.cidade}
      cityName={city.name}
      highlightAds={highlightAds}
      opportunityAds={opportunityAds}
    />
  );
}
