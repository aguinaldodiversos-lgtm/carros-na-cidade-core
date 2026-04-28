// frontend/app/simulador-financiamento/[cidade]/page.tsx
import type { Metadata } from "next";
import { FinancingLandingPageClient } from "@/components/financing/FinancingLandingPageClient";

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
  searchParams = {},
}: PageProps) {
  const city = prettifyCitySlug(params.cidade);
  const initialVehicleValue = parseValorFromSearch(searchParams);

  return (
    <FinancingLandingPageClient
      citySlug={params.cidade}
      cityName={city.name}
      cityState={city.state}
      initialVehicleValue={initialVehicleValue}
    />
  );
}
