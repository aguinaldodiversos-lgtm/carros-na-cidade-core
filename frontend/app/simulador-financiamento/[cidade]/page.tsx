// frontend/app/simulador-financiamento/[cidade]/page.tsx
import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";

import { FinancingLandingPageClient } from "@/components/financing/FinancingLandingPageClient";
import { hasRealPrice } from "@/lib/ads/has-real-price";
import { normalizePublicAd } from "@/lib/public-contracts";
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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const city = prettifyCitySlug(params.cidade);

  // Title/description canônicos do simulador (SEO 2026-06-27). O template do
  // root layout acrescenta "| Carros na Cidade" ao title.
  return {
    title: `Simulador de financiamento de veículos em ${city.label}`,
    description:
      "Simule entrada, parcelas e prazo para financiar seu próximo veículo. Compare condições antes de negociar com vendedores da região.",
    // O simulador é uma ferramenta interativa, não conteúdo de busca. NUNCA deve
    // ser indexado: o parâmetro `?veiculo=` gera infinitas variações de URL e foi a
    // origem de ~30k páginas-fantasma no Search Console (crawl budget). noindex,
    // follow permite que o Google siga os links internos mas não indexe a página.
    robots: { index: false, follow: true },
    alternates: {
      canonical: `/simulador-financiamento/${params.cidade}`,
    },
    openGraph: {
      title: `Simulador de financiamento de veículos em ${city.label}`,
      description:
        "Simule entrada, parcelas e prazo para financiar seu próximo veículo. Compare condições antes de negociar.",
      url: `/simulador-financiamento/${params.cidade}`,
      type: "website",
      locale: "pt_BR",
    },
  };
}

export const dynamic = "force-dynamic";

function BackArrowIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M19 12H5" />
      <path d="m12 19-7-7 7-7" />
    </svg>
  );
}

/**
 * Intro SÍNCRONO do simulador — server 100% síncrono (SEM await/fetch/client/
 * Suspense). Renderizado pela page SÍNCRONA ANTES do <Suspense>, então o H1 +
 * a frase entram no `<main>` no primeiro flush do HTML, antes do footer.
 *
 * CRÍTICO: NÃO tornar async nem mover para dentro de componente async/Suspense.
 */
function SimuladorIntroSync({ cityLabel }: { cityLabel: string }) {
  return (
    <div className="bg-cnc-bg">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6 sm:pt-6 lg:max-w-4xl lg:px-8">
        <div className="flex items-start gap-3">
          <Link
            href="/"
            aria-label="Voltar para a Home"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-cnc-line bg-white text-cnc-text-strong transition hover:border-primary hover:text-primary"
          >
            <BackArrowIcon />
          </Link>
          <div className="min-w-0">
            <h1 className="text-[24px] font-extrabold leading-tight tracking-tight text-cnc-text-strong sm:text-[28px]">
              Simulador de financiamento em {cityLabel}
            </h1>
            <p className="mt-1 text-[14px] leading-snug text-cnc-muted">
              Calcule parcelas, entrada e prazo antes de negociar seu próximo carro.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Skeleton do conteúdo pesado (fallback do <Suspense>). */
function SimuladorSkeleton() {
  return (
    <div
      className="mx-auto w-full max-w-3xl px-4 pb-24 pt-5 sm:px-6 lg:max-w-4xl lg:px-8"
      aria-hidden="true"
    >
      <div className="h-64 w-full rounded-2xl bg-black/5" />
      <div className="mt-5 h-72 w-full rounded-2xl bg-black/5" />
    </div>
  );
}

/**
 * Conteúdo assíncrono — fetches de anúncios + o client do simulador. Vive
 * DENTRO do <Suspense>; pode suspender sem afetar a ordem do H1 síncrono.
 */
async function SimuladorAsyncContent({
  cidade,
  initialVehicleValue,
}: {
  cidade: string;
  initialVehicleValue?: number;
}) {
  const city = prettifyCitySlug(cidade);

  const [opportunitiesResult, highlightResult, recentResult] = await Promise.allSettled([
    fetchAdsSearch({ city_slug: cidade, below_fipe: true, sort: "relevance", limit: 6, page: 1 }),
    fetchAdsSearch({ city_slug: cidade, highlight_only: true, sort: "highlight", limit: 4, page: 1 }),
    fetchAdsSearch({ city_slug: cidade, sort: "recent", limit: 6, page: 1 }),
  ]);

  // Defesa em profundidade (hasRealPrice + normalizePublicAd) — safety net
  // redundante ao filtro do backend; nada de R$ 0, slug inválido ou dirty data.
  const filterPublic = <T,>(ad: T) =>
    hasRealPrice(ad as Parameters<typeof hasRealPrice>[0]) && normalizePublicAd(ad) !== null;

  const recentAds = (
    recentResult.status === "fulfilled" ? recentResult.value.data || [] : []
  ).filter(filterPublic);

  const opportunityAdsRaw =
    opportunitiesResult.status === "fulfilled" ? opportunitiesResult.value.data || [] : [];
  const opportunityAds =
    opportunityAdsRaw.length > 0 ? opportunityAdsRaw.filter(filterPublic) : recentAds.slice(0, 6);

  const highlightAdsRaw =
    highlightResult.status === "fulfilled" ? highlightResult.value.data || [] : [];
  const highlightAds =
    highlightAdsRaw.length > 0 ? highlightAdsRaw.filter(filterPublic) : recentAds.slice(0, 4);

  const heroVehicle = highlightAds[0] ?? opportunityAds[0] ?? null;

  return (
    <FinancingLandingPageClient
      citySlug={cidade}
      cityName={city.name}
      cityLabel={city.label}
      heroVehicle={heroVehicle}
      highlightAds={highlightAds}
      opportunityAds={opportunityAds}
      initialVehicleValue={initialVehicleValue}
    />
  );
}

/**
 * SimuladorFinanciamentoCidadePage — SÍNCRONA de propósito (NÃO tornar async).
 *
 * O H1 vem do <SimuladorIntroSync> síncrono, ANTES do <Suspense> → entra no
 * `<main>` antes do footer no HTML real. Os fetches estão isolados em
 * <SimuladorAsyncContent> dentro do <Suspense>. H1 não fica em client
 * component nem depende de fetch.
 */
export default function SimuladorFinanciamentoCidadePage({ params, searchParams = {} }: PageProps) {
  const city = prettifyCitySlug(params.cidade);
  const initialVehicleValue = parseValorFromSearch(searchParams);

  return (
    <>
      <SimuladorIntroSync cityLabel={city.label} />
      <Suspense fallback={<SimuladorSkeleton />}>
        <SimuladorAsyncContent cidade={params.cidade} initialVehicleValue={initialVehicleValue} />
      </Suspense>
    </>
  );
}
