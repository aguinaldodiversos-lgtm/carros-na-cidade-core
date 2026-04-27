// frontend/app/tabela-fipe/[cidade]/page.tsx
import type { Metadata } from "next";
import { FipePageClient } from "@/components/fipe/FipePageClient";
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);

  return {
    title: `Tabela FIPE em ${city.name} | Consulte o valor do seu veículo`,
    description: `Consulte a Tabela FIPE em ${city.name}, compare o valor do seu veículo com anúncios locais e veja destaques e oportunidades abaixo da FIPE na sua cidade.`,
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

export const revalidate = 300;

export default async function TabelaFipeCidadePage({ params }: PageProps) {
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

  const fallbackRecent =
    fallbackRecentResult.status === "fulfilled" ? fallbackRecentResult.value.data || [] : [];

  const highlightAds =
    highlightResult.status === "fulfilled" && highlightResult.value.data?.length > 0
      ? highlightResult.value.data
      : fallbackRecent.slice(0, 10);

  const opportunityAds =
    belowFipeResult.status === "fulfilled" && belowFipeResult.value.data?.length > 0
      ? belowFipeResult.value.data
      : fallbackRecent.slice(0, 10);

  return (
    <FipePageClient
      citySlug={params.cidade}
      cityName={city.name}
      highlightAds={highlightAds}
      opportunityAds={opportunityAds}
    />
  );
}
