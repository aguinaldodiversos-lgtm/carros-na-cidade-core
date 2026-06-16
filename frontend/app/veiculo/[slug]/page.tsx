import type { Metadata } from "next";
import { notFound } from "next/navigation";

import AdEventTracker from "@/components/analytics/AdEventTracker";
import { AnalyticsPageView } from "@/components/analytics/AnalyticsPageView";
import BreadcrumbJsonLd from "@/components/seo/BreadcrumbJsonLd";
import { SiteBottomNav } from "@/components/shell/SiteBottomNav";
import VehicleDetailMobileShell from "@/components/vehicle/mobile/VehicleDetailMobileShell";

import type { PublicAdDetail } from "@/lib/ads/ad-detail";
import { fetchAdDetail } from "@/lib/ads/ad-detail";
import { buildWebPageJsonLd } from "@/lib/seo/page-structured-data";
import { buildVehicleImageAlt, splitCityState } from "@/lib/seo/vehicle-image-alt";
import { buildVehicleJsonLd } from "@/lib/seo/vehicle-structured-data";
import { getSiteUrl } from "@/lib/seo/site";
import { fetchRelatedListingsForAdPage } from "@/lib/vehicle/related-ads";
import type { VehicleDetail } from "@/lib/vehicle/public-vehicle";
import { adaptAdDetailToVehicle, formatListingDateLabels } from "@/lib/vehicle/public-vehicle";

type SearchParams = Record<string, string | string[] | undefined>;

type PageProps = {
  params: { slug: string };
  searchParams?: SearchParams;
};

// `force-dynamic` (NÃO `revalidate`) — empiricamente verificado em
// produção 2026-05-24 com Next 14.2.35: `revalidate=N` + segment-level
// `not-found.tsx` continua devolvendo HTTP 200 quando `notFound()` é
// chamado (soft-404). Já `force-dynamic` + `notFound()` em
// `generateMetadata` comita HTTP 404 real — comportamento confirmado
// nas rotas irmãs `/carros-em/[slug]` e `/carros-usados/regiao/[slug]`,
// que mantiveram `force-dynamic`. Esta rota não pode ser ISR enquanto
// o Next 14.2 apresentar esse soft-404, sob risco de Googlebot indexar
// página inexistente.
export const dynamic = "force-dynamic";

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

/**
 * Resolve o anúncio público pelo slug e, opcionalmente, por um `ref`
 * (id numérico ou slug alternativo no querystring). Retorna `null`
 * quando nenhum candidato é encontrado — caller deve chamar
 * `notFound()` para emitir 404 real (vetado fallback fake com R$ 0).
 */
async function getPublicAdAndVehicle(
  slug: string,
  ref?: string
): Promise<PublicVehiclePayload | null> {
  const candidates = Array.from(new Set([safeText(ref), safeText(slug)].filter(Boolean)));

  for (const candidate of candidates) {
    const ad = await fetchAdDetail(candidate);
    if (!ad) continue;
    const vehicle = adaptAdDetailToVehicle(ad);
    return {
      ad,
      vehicle: {
        ...vehicle,
        slug: safeText(vehicle.slug, slug),
        adCode: safeText(vehicle.adCode, candidate),
      },
    };
  }

  return null;
}

/**
 * Extrai a parte de cidade do `vehicle.city` (que já é "Cidade (UF)" ou
 * texto neutro via `buildPublicTerritoryLabel`). NUNCA usa "São Paulo"
 * como fallback (P2-E 2026-05-25): se a cidade não está informada, o
 * neutro do contrato público entra naturalmente em SEO sem mentir.
 */
function cityNameFromVehicle(vehicle: VehicleDetail): string {
  return safeText(vehicle.city.split(" (")[0], vehicle.city);
}

function buildPageTitle(vehicle: VehicleDetail): string {
  const year = extractYear(vehicle.year);
  const cityName = cityNameFromVehicle(vehicle);
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
  const payload = await getPublicAdAndVehicle(params.slug, ref);
  // Comitar 404 ANTES do Page (Next 14.2: notFound() no Page já é tarde
  // para trocar o status code — o body troca, mas o status fica 200).
  if (!payload) notFound();
  const { vehicle } = payload;

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
          alt:
            buildVehicleImageAlt({
              brand: vehicle.brand,
              model: vehicle.model,
              year: vehicle.year,
              ...splitCityState(vehicle.city),
            }) || vehicle.fullName,
        },
      ],
      locale: "pt_BR",
      type: "website",
    },
    keywords: [
      `${vehicle.model.toLowerCase()} ${cityNameFromVehicle(vehicle).toLowerCase()}`,
      `comprar ${vehicle.model.toLowerCase()} ${cityNameFromVehicle(vehicle).toLowerCase()}`,
      `veículo ${cityNameFromVehicle(vehicle).toLowerCase()}`,
    ],
  };
}

export default async function VehicleDetailPage({ params, searchParams = {} }: PageProps) {
  const ref = getFirstValue(searchParams.ref);
  const payload = await getPublicAdAndVehicle(params.slug, ref);
  if (!payload) notFound();
  const { ad, vehicle } = payload;

  // O redesign da rota /veiculo (mockup detalhes.png) não usa mais
  // "Indicador de mercado", "Insights IA" nem o carrossel de veículos
  // sugeridos por IA — então não pagamos a latência dessas chamadas
  // no SSR. Mantemos apenas relatedResult para "Mais carros em [Cidade]".
  const [relatedResult] = await Promise.allSettled([fetchRelatedListingsForAdPage(ad, vehicle)]);

  const aiInsights: string[] = [];

  // Sem fallback sintético quando o fetch de relacionados falha: seed
  // hardcoded (`buyCars`) com preços de placeholder gerava cards
  // confusos no detalhe ("R$ 119.990 Corolla XEi" abaixo do veículo
  // real, sem relação com a cidade do anúncio). Lista vazia é melhor
  // que falsa.
  const sellerVehicles = relatedResult.status === "fulfilled" ? relatedResult.value.seller : [];
  const cityVehicles = relatedResult.status === "fulfilled" ? relatedResult.value.city : [];

  const canonicalSlug = safeText(vehicle.slug, params.slug);
  const year = extractYear(vehicle.year);
  const listingDates = formatListingDateLabels(vehicle.adPublishedAt, vehicle.adUpdatedAt);
  const publishedLabel = [listingDates.primary, listingDates.secondary].filter(Boolean).join(" · ");
  const fipeDeltaLine = buildFipeDeltaLine(vehicle);

  // Fase 4.3 — Product + Car + Offer (UsedCondition) + ImageObject + AutoDealer
  // (quando loja). Dados coerentes com o conteúdo visível da página.
  const schemaVehicle = buildVehicleJsonLd(vehicle, {
    url: `${getSiteUrl()}/veiculo/${canonicalSlug}`,
    siteUrl: getSiteUrl(),
  });

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
      <AnalyticsPageView event="ad_view" adId={vehicle.id} entityId={canonicalSlug} />
      <BreadcrumbJsonLd items={breadcrumbItems} />

      {schemaVehicle.map((node, i) => (
        <script
          key={i}
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }}
        />
      ))}
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
