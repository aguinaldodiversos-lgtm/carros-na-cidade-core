import type { Metadata } from "next";

import AdEventTracker from "@/components/analytics/AdEventTracker";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import VehicleDetailMobileShell from "@/components/vehicle/mobile/VehicleDetailMobileShell";

import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { fetchAdDetail } from "@/lib/ads/ad-detail";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import { fetchRelatedListingsForAdPage } from "@/lib/vehicle/related-ads";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import {
  adaptAdDetailToVehicle,
  buildCityVehicles,
  formatListingDateLabels,
} from "@/lib/vehicle/public-vehicle";

import { DEFAULT_PUBLIC_CITY_SLUG } from "@/lib/site/public-config";

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
    brand: "",
    model,
    version: "",
    fullName,
    price: "R$ 0",
    priceNumeric: null,
    condition: "Usado",
    year: `${year}/${year}`,
    km: "Km não informado",
    fuel: "Não informado",
    transmission: "Não informado",
    bodyType: "Não informado",
    color: "Não informado",
    city: "São Paulo (SP)",
    citySlug: DEFAULT_PUBLIC_CITY_SLUG,
    adCode: ref || slug || "fallback",
    adPublishedAt: null,
    adUpdatedAt: null,
    isBelowFipe: false,
    fipePrice: "Consulte",
    fipeDeltaBrl: null,
    fipeDeltaPercent: null,
    isPaidListing: false,
    advertiserId: null,
    reviewedAfterBelowFipe: false,
    images: [],
    hasRealImages: false,
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

function formatBrlAbs(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(Math.abs(value));
}

function buildFipeDeltaLine(vehicle: VehicleDetail): string | null {
  const brl = vehicle.fipeDeltaBrl;
  const pct = vehicle.fipeDeltaPercent;

  if (brl == null || pct == null || !Number.isFinite(brl) || !Number.isFinite(pct)) {
    return null;
  }

  const absPct = Math.abs(pct).toFixed(1).replace(".", ",");

  if (brl < 0) {
    return `${formatBrlAbs(brl)} abaixo da FIPE (${absPct}%)`;
  }

  if (brl > 0) {
    return `${formatBrlAbs(brl)} acima da FIPE (${absPct}%)`;
  }

  return "Alinhado à FIPE";
}

type PublicVehiclePayload = {
  ad: PublicAdDetail;
  vehicle: VehicleDetail;
};

async function getPublicAdAndVehicle(slug: string, ref?: string): Promise<PublicVehiclePayload> {
  const candidates = Array.from(new Set([safeText(ref), safeText(slug)].filter(Boolean)));

  for (const candidate of candidates) {
    try {
      const ad = await fetchAdDetail(candidate);
      const vehicle = adaptAdDetailToVehicle(ad);

      return {
        ad,
        vehicle: {
          ...vehicle,
          slug: safeText(vehicle.slug, slug),
          adCode: safeText(vehicle.adCode, candidate),
        },
      };
    } catch {
      // tenta o próximo identificador
    }
  }

  const fallbackVehicle = buildFallbackVehicle(slug, ref);

  const fallbackAd: PublicAdDetail = {
    id: fallbackVehicle.id,
    slug: fallbackVehicle.slug,
    plan: "free",
    highlight_until: null,
    advertiser_id: null,
    city_slug: fallbackVehicle.citySlug,
  };

  return {
    ad: fallbackAd,
    vehicle: fallbackVehicle,
  };
}

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
  const { vehicle } = await getPublicAdAndVehicle(params.slug, ref);

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
          url: vehicle.images[0] ?? "/images/vehicle-placeholder.svg",
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
      `veículo ${safeText(vehicle.city.split(" (")[0], "sao paulo").toLowerCase()}`,
    ],
  };
}

export default async function VehicleDetailPage({ params, searchParams = {} }: PageProps) {
  const ref = getFirstValue(searchParams.ref);
  const { ad, vehicle } = await getPublicAdAndVehicle(params.slug, ref);

  // O redesign da rota /veiculo (mockup detalhes.png) não usa mais
  // "Indicador de mercado", "Insights IA" nem o carrossel de veículos
  // sugeridos por IA — então não pagamos a latência dessas chamadas
  // no SSR. Mantemos apenas relatedResult para "Mais carros em [Cidade]".
  const [relatedResult] = await Promise.allSettled([
    fetchRelatedListingsForAdPage(ad, vehicle),
  ]);

  const aiInsights: string[] = [];

  let sellerVehicles = relatedResult.status === "fulfilled" ? relatedResult.value.seller : [];
  let cityVehicles = relatedResult.status === "fulfilled" ? relatedResult.value.city : [];

  if (relatedResult.status !== "fulfilled") {
    cityVehicles = buildCityVehicles(vehicle);
  }

  const canonicalSlug = safeText(vehicle.slug, params.slug);
  const year = extractYear(vehicle.year);
  const listingDates = formatListingDateLabels(vehicle.adPublishedAt, vehicle.adUpdatedAt);
  const publishedLabel = [listingDates.primary, listingDates.secondary].filter(Boolean).join(" · ");
  const fipeDeltaLine = buildFipeDeltaLine(vehicle);

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

  const shareUrl = `https://carrosnacidade.com/veiculo/${canonicalSlug}`;

  return (
    <>
      {/*
        Mobile: esconde PublicHeader/PublicFooter globais para a shell
        ocupar 100% da viewport (estilo app, igual ao mockup detalhes.png).
        Desktop: mantém PublicHeader/PublicFooter, mas a mesma shell
        renderiza com largura de coluna controlada — fidelidade ao
        mockup também em desktop, sem sidebar e sem layout legado.
      */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (max-width: 1023px) {
              body:has([data-vehicle-detail-mobile-shell]) [data-public-header],
              body:has([data-vehicle-detail-mobile-shell]) [data-public-footer],
              body:has([data-vehicle-detail-mobile-shell]) [data-vehicle-mobile-sticky] {
                display: none !important;
              }
              body:has([data-vehicle-detail-mobile-shell]) #main-content { padding: 0 !important; }
            }
          `,
        }}
      />

      <div className="mx-auto w-full max-w-[680px] lg:max-w-3xl">
        <VehicleDetailMobileShell
          vehicle={vehicle}
          shareUrl={shareUrl}
          cityVehicles={cityVehicles}
          sellerVehicles={sellerVehicles}
        />
      </div>

      <SiteBottomNav />

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
