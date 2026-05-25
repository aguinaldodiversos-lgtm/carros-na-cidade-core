// frontend/app/simulador-financiamento/[cidade]/page.tsx
import type { Metadata } from "next";
import { FinancingLandingPageClient } from "@/components/financing/FinancingLandingPageClient";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { normalizePublicAd, publicCatalogPageCopy } from "@/lib/public-contracts";
import { fetchAdsSearch } from "@/lib/search/ads-search";

type PageProps = {
  params: {
    cidade: string;
  };
  searchParams?: Record<string, string | string[] | undefined>;
};

function getFirstQueryValue(
  searchParams: Record<string, string | string[] | undefined> | undefined,
  key: string
): string | undefined {
  const raw = searchParams?.[key];
  if (Array.isArray(raw)) return raw[0];
  return raw;
}

function parseValorFromSearch(searchParams?: Record<string, string | string[] | undefined>) {
  const raw = getFirstQueryValue(searchParams, "valor");
  if (!raw) return undefined;
  const normalized = raw.replace(/[^\d.,-]/g, "").replace(",", ".");
  const n = Number(normalized);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : undefined;
}

function prettifyCitySlug(slug: string) {
  const parts = slug.split("-").filter(Boolean);
  const ufCandidate = parts.at(-1)?.toUpperCase();
  const hasUf = Boolean(ufCandidate && ufCandidate.length === 2);

  const name = parts
    .slice(0, hasUf ? -1 : undefined)
    .map((part) => {
      const lower = part.toLowerCase();
      if (lower === "sao") return "São";
      if (lower === "joao") return "João";
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(" ");

  const cityName = name || "São Paulo";
  const state = hasUf && ufCandidate ? ufCandidate : "SP";

  return {
    name: cityName,
    state,
    label: `${cityName} - ${state}`,
  };
}

// `fallbackHero` (T-Cross fake R$ 105.900, id 999001, slug
// "volkswagen-t-cross-2022-2023") REMOVIDO no briefing P0 2026-05-24.
// Quando os 3 fetches falham, `heroVehicle` agora é `null` e o cliente
// renderiza hero institucional sem veículo/preço/modelo inventado.

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);

  // Briefing P2-D 2026-05-25 — copy oficial vem do helper único.
  // Preservamos fallback inline com o que tinha (drop-in compatível).
  const baseCopy = publicCatalogPageCopy("simulator", { label: city.name, uf: city.state });

  return {
    title: baseCopy.metaTitle ?? `Simule o financiamento do seu carro em ${city.name}`,
    description:
      baseCopy.metaDescription ??
      `Descubra parcelas, taxas e condições de financiamento em ${city.name}. Veja ofertas locais, oportunidades abaixo da FIPE e anuncie seu carro grátis no Carros na Cidade.`,
    alternates: {
      canonical: `/simulador-financiamento/${params.cidade}`,
    },
    openGraph: {
      title: `Simule o financiamento do seu carro em ${city.name}`,
      description:
        "Landing page automotiva com simulador de financiamento, ofertas locais e anúncio grátis.",
      url: `/simulador-financiamento/${params.cidade}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export const revalidate = 300;

export default async function SimuladorFinanciamentoCidadePage({
  params,
  searchParams = {},
}: PageProps) {
  const city = prettifyCitySlug(params.cidade);
  const initialVehicleValue = parseValorFromSearch(searchParams);

  const [opportunitiesResult, highlightResult, recentResult] = await Promise.allSettled([
    fetchAdsSearch({
      city_slug: params.cidade,
      below_fipe: true,
      sort: "relevance",
      limit: 6,
      page: 1,
    }),
    fetchAdsSearch({
      city_slug: params.cidade,
      highlight_only: true,
      sort: "highlight",
      limit: 4,
      page: 1,
    }),
    fetchAdsSearch({
      city_slug: params.cidade,
      sort: "recent",
      limit: 6,
      page: 1,
    }),
  ]);

  // Defesa em profundidade — briefing P0 2026-05-24 (hasRealPrice) +
  // briefing P2-D 2026-05-25 (normalizePublicAd: drop slug inválido,
  // dirty data residual, price ≤ 0). Filtros aplicados em sequência:
  // backend já filtra DIRTY; este pipeline é safety net redundante.
  const filterPublic = <T,>(ad: T) =>
    hasRealPrice(ad as Parameters<typeof hasRealPrice>[0]) && normalizePublicAd(ad) !== null;

  const recentAds = (
    recentResult.status === "fulfilled" ? recentResult.value.data || [] : []
  ).filter(filterPublic);

  const opportunityAdsRaw =
    opportunitiesResult.status === "fulfilled" ? opportunitiesResult.value.data || [] : [];
  const opportunityAds = opportunityAdsRaw.length > 0
    ? opportunityAdsRaw.filter(filterPublic)
    : recentAds.slice(0, 6);

  const highlightAdsRaw =
    highlightResult.status === "fulfilled" ? highlightResult.value.data || [] : [];
  const highlightAds = highlightAdsRaw.length > 0
    ? highlightAdsRaw.filter(filterPublic)
    : recentAds.slice(0, 4);

  // heroVehicle = primeiro anúncio real com preço; `null` quando nenhum
  // anúncio real está disponível. O `FinancingLandingPageClient`
  // renderiza hero institucional (sem veículo/preço/modelo) nesse caso —
  // briefing P0 2026-05-24 vetou o T-Cross fake R$ 105.900.
  const heroVehicle = highlightAds[0] ?? opportunityAds[0] ?? null;

  return (
    <FinancingLandingPageClient
      citySlug={params.cidade}
      cityName={city.name}
      cityLabel={city.label}
      heroVehicle={heroVehicle}
      highlightAds={highlightAds}
      opportunityAds={opportunityAds}
      initialVehicleValue={initialVehicleValue}
    />
  );
}
