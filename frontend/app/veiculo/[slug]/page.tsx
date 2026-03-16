import type { Metadata } from "next";
import { cache } from "react";

import AdEventTracker from "@/components/analytics/AdEventTracker";
import PageBreadcrumbs from "@/components/common/PageBreadcrumbs";
import VehicleCarousel from "@/components/common/VehicleCarousel";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import VehicleActions from "@/components/vehicle/VehicleActions";
import VehicleGallery from "@/components/vehicle/VehicleGallery";
import VehicleInfo from "@/components/vehicle/VehicleInfo";
import SellerSection from "@/components/vehicle/SellerSection";
import VehicleSpecs from "@/components/vehicle/VehicleSpecs";

import { fetchAdDetail } from "@/lib/ads/ad-detail";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import {
  adaptAdDetailToVehicle,
  buildCityVehicles,
  buildSellerVehicles,
} from "@/lib/vehicle/public-vehicle";

import {
  getAISimilarVehicles,
  getAIVehicleInsights,
  getAIVehiclePriceSignal,
} from "@/services/aiService";
import type { VehiclePriceSignal } from "@/services/aiService";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: { slug: string };
  searchParams?: SearchParams;
};

export const revalidate = 1800;
export const dynamicParams = true;

function getFirstValue(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

function safeText(value: unknown, fallback = ""): string {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return fallback;
}

function extractYear(value: string): string {
  const match = String(value || "").match(/\d{4}/);
  return match?.[0] || "2024";
}

function slugToReadableText(slug: string): string {
  const cleaned = String(slug || "")
    .replace(/^\/+|\/+$/g, "")
    .replace(/^veiculo\//, "")
    .replace(/-/g, " ")
    .trim();

  if (!cleaned) return "Veículo";

  return cleaned
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function buildFallbackVehicle(slug: string, ref?: string): VehicleDetail {
  const fullName = slugToReadableText(slug);
  const year = extractYear(fullName);
  const model = fullName || "Veículo";

  return {
    id: ref || slug || "fallback-vehicle",
    slug: safeText(slug, "veiculo-sem-slug"),
    model,
    fullName,
    price: "R$ 0",
    condition: "Usado",
    year: `${year}/${year}`,
    km: "Km não informado",
    fuel: "Não informado",
    transmission: "Não informado",
    color: "Não informado",
    city: "São Paulo (SP)",
    citySlug: "sao-paulo-sp",
    adCode: ref || slug || "fallback",
    isBelowFipe: false,
    fipePrice: "Consulte",
    images: ["/images/banner1.jpg", "/images/banner2.jpg", "/images/hero.jpeg"],
    description:
      "As informações completas deste veículo estão temporariamente indisponíveis. Tente novamente em instantes ou volte para a listagem.",
    optionalItems: [
      "Dados em atualização",
      "Consulte disponibilidade com o anunciante",
      "Use o simulador para estimar financiamento",
    ],
    safetyItems: [
      "Verifique histórico do veículo",
      "Confira documentação antes da compra",
      "Faça vistoria cautelar",
    ],
    comfortItems: [
      "Contato direto pelo portal",
      "Experiência otimizada para mobile",
      "Acesso rápido à listagem da cidade",
    ],
    sellerNotes:
      "Os dados deste anúncio estão em atualização. Recomendamos confirmar disponibilidade, preço e opcionais diretamente com o anunciante.",
    seller: {
      type: "private",
      name: "Anunciante no Carros na Cidade",
      phone: "",
    },
  };
}

function buildFallbackPriceSignal(): VehiclePriceSignal {
  return {
    score: 0,
    label: "Análise temporariamente indisponível",
    reason:
      "Os indicadores automáticos de preço não puderam ser carregados no momento.",
  };
}

const getPublicVehicleDetail = cache(async (slug: string, ref?: string) => {
  const candidates = Array.from(
    new Set([safeText(ref), safeText(slug)].filter(Boolean))
  );

  for (const candidate of candidates) {
    try {
      const ad = await fetchAdDetail(candidate);
      const vehicle = adaptAdDetailToVehicle(ad);

      return {
        ...vehicle,
        slug: safeText(vehicle.slug, slug),
        adCode: safeText(vehicle.adCode, candidate),
      };
    } catch {
      // tenta o próximo identificador
    }
  }

  return buildFallbackVehicle(slug, ref);
});

function buildPageTitle(vehicle: VehicleDetail): string {
  const year = extractYear(vehicle.year);
  const cityName = safeText(vehicle.city.split(" (")[0], "São Paulo");
  return `${vehicle.model} ${year} à venda em ${cityName}`;
}

function buildPageDescription(vehicle: VehicleDetail): string {
  return `${vehicle.fullName} por ${vehicle.price} em ${vehicle.city}. Confira ficha completa, fotos e simulação de financiamento.`;
}

export async function generateMetadata({
  params,
  searchParams = {},
}: PageProps): Promise<Metadata> {
  const ref = getFirstValue(searchParams.ref);
  const vehicle = await getPublicVehicleDetail(params.slug, ref);

  return {
    title: buildPageTitle(vehicle),
    description: buildPageDescription(vehicle),
    alternates: {
      canonical: `/veiculo/${vehicle.slug || params.slug}`,
    },
    openGraph: {
      title: buildPageTitle(vehicle),
      description: buildPageDescription(vehicle),
      url: `/veiculo/${vehicle.slug || params.slug}`,
      images: [
        {
          url: vehicle.images[0] ?? "/images/banner1.jpg",
          width: 1200,
          height: 630,
          alt: vehicle.fullName,
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    keywords: [
      `${vehicle.model.toLowerCase()} ${safeText(
        vehicle.city.split(" (")[0],
        "sao paulo"
      ).toLowerCase()}`,
      `comprar ${vehicle.model.toLowerCase()} ${safeText(
        vehicle.city.split(" (")[0],
        "sao paulo"
      ).toLowerCase()}`,
      `veículo ${safeText(
        vehicle.city.split(" (")[0],
        "sao paulo"
      ).toLowerCase()}`,
    ],
  };
}

export default async function VehicleDetailPage({
  params,
  searchParams = {},
}: PageProps) {
  const ref = getFirstValue(searchParams.ref);
  const vehicle = await getPublicVehicleDetail(params.slug, ref);

  const [priceSignalResult, aiInsightsResult, similarVehiclesResult] =
    await Promise.allSettled([
      getAIVehiclePriceSignal(vehicle),
      getAIVehicleInsights(vehicle),
      getAISimilarVehicles(vehicle),
    ]);

  const priceSignal: VehiclePriceSignal =
    priceSignalResult.status === "fulfilled"
      ? priceSignalResult.value
      : buildFallbackPriceSignal();

  const aiInsights =
    aiInsightsResult.status === "fulfilled"
      ? aiInsightsResult.value
      : ({} as Awaited<ReturnType<typeof getAIVehicleInsights>>);

  const sellerVehicles = buildSellerVehicles(vehicle);
  const cityVehicles = buildCityVehicles(vehicle);

  const similarVehicles =
    similarVehiclesResult.status === "fulfilled" &&
    Array.isArray(similarVehiclesResult.value) &&
    similarVehiclesResult.value.length > 0
      ? similarVehiclesResult.value
      : buildCityVehicles(vehicle, 6);

  const canonicalSlug = safeText(vehicle.slug, params.slug);
  const year = extractYear(vehicle.year);

  const schemaVehicle = {
    "@context": "https://schema.org",
    "@type": "Vehicle",
    name: vehicle.fullName,
    model: vehicle.model,
    vehicleModelDate: year,
    fuelType: vehicle.fuel,
    vehicleTransmission: vehicle.transmission,
    color: vehicle.color,
    mileageFromOdometer: {
      "@type": "QuantitativeValue",
      value: vehicle.km.replace(/\D/g, ""),
      unitCode: "KMT",
    },
    image: vehicle.images,
    offers: {
      "@type": "Offer",
      priceCurrency: "BRL",
      price: vehicle.price
        .replace(/[^\d,]/g, "")
        .replace(/\.(?=\d{3}(\D|$))/g, "")
        .replace(",", "."),
      availability: "https://schema.org/InStock",
      url: `https://carrosnacidade.com/veiculo/${canonicalSlug}`,
    },
  };

  const schemaFaq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Como simular financiamento deste veículo?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Use o botão Simular financiamento para abrir o simulador com os dados do anúncio.",
        },
      },
      {
        "@type": "Question",
        name: "Este anúncio está abaixo da FIPE?",
        acceptedAnswer: {
          "@type": "Answer",
          text: vehicle.isBelowFipe
            ? "Sim. O valor anunciado está abaixo da referência FIPE atual."
            : "O valor está alinhado com a referência FIPE para este modelo.",
        },
      },
    ],
  };

  const breadcrumbItems = [
    { name: "Home", href: "/" },
    { name: "Comprar", href: "/comprar" },
    { name: vehicle.model },
  ];

  const pageSchema = buildWebPageJsonLd({
    title: `${vehicle.model} ${year} à venda`,
    description: buildPageDescription(vehicle),
    path: `/veiculo/${canonicalSlug}`,
    type: "WebPage",
    about: vehicle.fullName,
  });

  const sellerPhone = safeText(vehicle.seller.phone);

  return (
    <>
      <main className="mx-auto w-full max-w-7xl px-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 md:pb-8 md:pt-8">
        <PageBreadcrumbs
          items={breadcrumbItems}
          className="mb-4 overflow-x-auto whitespace-nowrap"
        />

        <div className="grid gap-4 md:gap-5 xl:grid-cols-[1.45fr_1fr]">
          <VehicleGallery images={vehicle.images} alt={vehicle.fullName} />
          <div className="space-y-5">
            <VehicleInfo vehicle={vehicle} priceSignal={priceSignal} />
            <VehicleActions
              vehicleId={vehicle.id}
              vehicleName={vehicle.fullName}
              whatsappPhone={sellerPhone}
            />
          </div>
        </div>

        <div className="mt-5">
          <VehicleSpecs vehicle={vehicle} aiInsights={aiInsights} />
        </div>

        <div className="mt-5">
          <SellerSection
            vehicle={vehicle}
            sellerVehicles={sellerVehicles}
            cityVehicles={cityVehicles}
          />
        </div>

        <VehicleCarousel
          title="Veículos semelhantes sugeridos pelo Cérebro IA"
          subtitle="Modelos com perfil de preço, liquidez e procura parecidos com este anúncio."
          vehicles={similarVehicles}
        />
      </main>

      <AdEventTracker adId={vehicle.id} eventType="view" />
      <BreadcrumbJsonLd items={breadcrumbItems} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaVehicle) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(pageSchema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(schemaFaq) }}
      />
    </>
  );
}
