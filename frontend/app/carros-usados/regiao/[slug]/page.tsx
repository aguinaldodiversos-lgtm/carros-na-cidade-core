import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { isRegionalPageEnabled } from "@/lib/env/feature-flags";
import {
  fetchRegionByCitySlug,
  regionToAdsSearchFilters,
  type RegionPayload,
} from "@/lib/regions/fetch-region";
import { fetchAdsSearch } from "@/lib/search/ads-search";
import { toAbsoluteUrl } from "@/lib/seo/site";
import { RegionPageView } from "./region-page-view";
export const revalidate = 300;

/**
 * Página Regional pública — `/carros-usados/regiao/[slug]`.
 *
 * Estado de rollout (ver `docs/runbooks/regional-page-rollout.md`):
 *  - Fase A: flag `REGIONAL_PAGE_ENABLED=false` → notFound() sem renderizar.
 *  - Fase B: flag `true` em staging → renderiza com `noindex, follow`.
 *  - Fase C: flag `true` em produção, ainda `noindex` até aprovação SEO.
 *  - Fase D: canonical próprio + entrada no sitemap (futuro PR).
 *
 * Atualmente (Fase A→B): noindex obrigatório, canonical apontando para a
 * página da cidade-base como proteção temporária contra indexação cruzada,
 * NÃO entra no sitemap.
 *
 * Pipeline de dados:
 *   isRegionalPageEnabled? → fetchRegionByCitySlug → regionToAdsSearchFilters
 *   → fetchAdsSearch (status=active filtrado pelo backend) → render.
 *
 * O raio usado pelo backend vem de platform_settings (key
 * `regional.radius_km`, default 80, range 10..150) — editável pelo admin
 * em /admin/regional-settings. O frontend NÃO passa radius — o backend
 * lê do DB. Fonte única de verdade.
 */

interface RegionPageProps {
  params: { slug: string };
}

const getRegionData = cache(async (slug: string): Promise<RegionPayload | null> => {
  return fetchRegionByCitySlug(slug);
});

const getAdsForRegion = cache(async (region: RegionPayload) => {
  const filters = regionToAdsSearchFilters(region, { includeState: true });
  return fetchAdsSearch(filters);
});

function buildTitle(name: string, state: string) {
  return `Carros usados na região de ${name} — ${state.toUpperCase()}`;
}

function buildDescription(name: string, memberCount: number) {
  if (memberCount === 0) {
    return `Veja veículos anunciados em ${name} e arredores. Anúncios verificados, com filtros e contato direto com o anunciante.`;
  }
  return `Veja veículos anunciados em ${name} e em ${memberCount} cidade${memberCount === 1 ? "" : "s"} próxima${memberCount === 1 ? "" : "s"}. Anúncios verificados, com filtros e contato direto.`;
}

export async function generateMetadata({ params }: RegionPageProps): Promise<Metadata> {
  if (!isRegionalPageEnabled()) {
    // Defesa em profundidade: mesmo com fetcher não chamado abaixo, garantir
    // que metadata vazia não seja indexada se a flag estiver off por engano.
    return { robots: { index: false, follow: false } };
  }

  const region = await getRegionData(params.slug);
  if (!region) {
    return {
      title: "Região não encontrada — Carros na Cidade",
      robots: { index: false, follow: true },
    };
  }

  const title = buildTitle(region.base.name, region.base.state);
  const description = buildDescription(region.base.name, region.members.length);

  // Canonical aponta para a página da cidade-base — proteção temporária
  // do runbook §5 Fase A/B/C. Em Fase D (aprovação SEO) este canonical
  // muda para self-canonical na regional.
  const canonical = toAbsoluteUrl(`/carros-em/${encodeURIComponent(region.base.slug)}`);

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
    },
    twitter: {
      card: "summary",
      title,
      description,
    },
    robots: {
      index: false,
      follow: true,
      googleBot: {
        index: false,
        follow: true,
      },
    },
  };
}

export default async function RegionPage({ params }: RegionPageProps) {
  if (!isRegionalPageEnabled()) {
    notFound();
  }

  const region = await getRegionData(params.slug);
  if (!region) {
    notFound();
  }

  const adsResponse = await getAdsForRegion(region);
  const ads = Array.isArray(adsResponse?.data) ? adsResponse.data : [];

  // `radius_km` vem do backend (foi adicionado em getRegionByBaseSlugDynamic).
  // Casts defensivos: se o BFF antigo for cacheado e voltar sem o campo,
  // fallback para 80 (o default declarado em platform_settings).
  const radiusKm = (region as RegionPayload & { radius_km?: number }).radius_km ?? 80;

  return (
    <RegionPageView
      base={region.base}
      members={region.members}
      ads={ads}
      radiusKm={radiusKm}
    />
  );
}
