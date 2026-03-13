// frontend/app/simulador-financiamento/[cidade]/page.tsx
import type { Metadata } from "next";
import { FinancingLandingPageClient } from "@/components/financing/FinancingLandingPageClient";
import { fetchAdsSearch } from "@/lib/search/ads-search";
import type { AdItem } from "@/lib/search/ads-search";

type PageProps = {
  params: {
    cidade: string;
  };
};

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
  const state = (hasUf && ufCandidate) ? ufCandidate : "SP";

  return {
    name: cityName,
    state,
    label: `${cityName} - ${state}`,
  };
}

function fallbackHero(cityName: string, state: string): AdItem {
  return {
    id: 999001,
    slug: "volkswagen-t-cross-2022-2023",
    title: "2022/2023 Volkswagen T-Cross",
    brand: "Volkswagen",
    model: "T-Cross",
    city: cityName,
    state,
    year: 2023,
    mileage: 28000,
    price: 105900,
    below_fipe: false,
    image_url: "/images/hero.jpeg",
    images: ["/images/hero.jpeg"],
  };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);

  return {
    title: `Simule o financiamento do seu carro em ${city.name}`,
    description: `Descubra parcelas, taxas e condições de financiamento em ${city.name}. Veja ofertas locais, oportunidades abaixo da FIPE e anuncie seu carro grátis no Carros na Cidade.`,
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
}: PageProps) {
  const city = prettifyCitySlug(params.cidade);

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

  const recentAds =
    recentResult.status === "fulfilled" ? recentResult.value.data || [] : [];

  const opportunityAds =
    opportunitiesResult.status === "fulfilled" && opportunitiesResult.value.data?.length > 0
      ? opportunitiesResult.value.data
      : recentAds.slice(0, 6);

  const highlightAds =
    highlightResult.status === "fulfilled" && highlightResult.value.data?.length > 0
      ? highlightResult.value.data
      : recentAds.slice(0, 4);

  const heroVehicle =
    highlightAds[0] || opportunityAds[0] || fallbackHero(city.name, city.state);

  return (
    <FinancingLandingPageClient
      citySlug={params.cidade}
      cityName={city.name}
      cityLabel={city.label}
      heroVehicle={heroVehicle}
      highlightAds={highlightAds}
      opportunityAds={opportunityAds}
    />
  );
}
