import { notFound } from "next/navigation";
import type { AdItem, AdsSearchFilters } from "@/lib/search/ads-search";
import { fetchAdsFacets, fetchAdsSearch } from "@/lib/search/ads-search";
import { buildSearchQueryString } from "@/lib/search/ads-search-url";
import {
  fetchCityBelowFipeTerritorialPage,
  fetchCityTerritorialPage,
} from "@/lib/search/territorial-public";

export type LocalSeoVariant = "em" | "baratos" | "automaticos";

export interface LocalSeoLandingModel {
  variant: LocalSeoVariant;
  slug: string;
  cityName: string;
  state?: string | null;
  region?: string | null;
  /** Total para o recorte desta landing (filtro da página). */
  totalAds: number;
  /** Catálogo geral na cidade (para fallback e contexto). */
  catalogTotalAds: number;
  avgPrice: number | null;
  topBrands: Array<{ brand: string; total: number }>;
  sampleAds: AdItem[];
  /** Nenhum anúncio no recorte, mas pode haver estoque na cidade. */
  isEmptyVariant: boolean;
  /** Sem anúncios ativos na cidade. */
  isEmptyCity: boolean;
  comprarHref: string;
  hubHref: string;
  paths: {
    em: string;
    baratos: string;
    automaticos: string;
  };
  h1: string;
  paragraphs: string[];
}

const TRANSMISSION_AUTO = "automatico";

function averagePriceFromAds(ads: Array<{ price?: number }>): number | null {
  const nums = ads.map((a) => a.price).filter((p): p is number => typeof p === "number" && p > 0);
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function maxTotal(...values: Array<number | undefined | null>): number {
  let m = 0;
  for (const v of values) {
    const n = typeof v === "number" && Number.isFinite(v) ? v : 0;
    if (n > m) m = n;
  }
  return Math.max(0, Math.floor(m));
}

function buildComprarHref(filters: AdsSearchFilters): string {
  const q = buildSearchQueryString(filters);
  return q ? `/comprar?${q}` : "/comprar";
}

function topBrandsFromFacets(
  brands: Array<{ brand: string; total: number }> | undefined,
  limit = 8
) {
  if (!Array.isArray(brands)) return [];
  return brands
    .filter((b) => b.brand && Number(b.total) > 0)
    .slice(0, limit)
    .map((b) => ({ brand: String(b.brand), total: Number(b.total) || 0 }));
}

function formatBrandList(brands: Array<{ brand: string }>): string {
  const names = brands.map((b) => b.brand).filter(Boolean);
  if (names.length === 0) return "diversas marcas";
  if (names.length <= 3) return names.join(", ");
  return `${names.slice(0, 3).join(", ")} e outras`;
}

function buildParagraphs(model: Omit<LocalSeoLandingModel, "paragraphs">): string[] {
  const {
    cityName,
    state,
    region,
    variant,
    totalAds,
    catalogTotalAds,
    avgPrice,
    topBrands,
    isEmptyVariant,
    isEmptyCity,
  } = model;
  const uf = state ? ` (${state})` : "";
  const priceText =
    avgPrice !== null
      ? `Preço médio observado nos anúncios listados: cerca de ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }).format(avgPrice)}.`
      : "Os valores variam conforme ano, versão e estado de conservação.";

  const brandSentence = `Entre as marcas com mais ofertas${uf ? ` em ${cityName}` : ""}: ${formatBrandList(topBrands)}.`;

  if (isEmptyCity) {
    const lines: string[] = [
      `Ainda não há veículos publicados em ${cityName}${uf}. Enquanto o estoque regional cresce, você pode explorar o catálogo nacional e salvar alertas para esta região.`,
    ];
    if (region) {
      lines.push(`Região: ${region}.`);
    }
    return lines;
  }

  if (variant === "em") {
    const lines = [
      `Hoje há ${totalAds} anúncio(s) ativo(s) em ${cityName}${uf} neste marketplace territorial. ${priceText}`,
      brandSentence,
      `Use os filtros do catálogo para refinar por preço, ano, combustível e tipo de câmbio — sempre com foco em ${cityName}.`,
    ];
    return lines;
  }

  if (variant === "baratos") {
    if (isEmptyVariant && catalogTotalAds > 0) {
      return [
        `No momento não há veículos listados explicitamente abaixo da FIPE em ${cityName}${uf}, embora existam ${catalogTotalAds} anúncio(s) na cidade. Abra o catálogo com filtro “abaixo da FIPE” para capturar novas entradas.`,
        brandSentence,
        `A página da cidade reúne oportunidades, destaques e rotas por marca em ${cityName}.`,
      ];
    }
    return [
      `Encontramos ${totalAds} veículo(s) com preço abaixo da tabela FIPE em ${cityName}${uf}. ${priceText}`,
      brandSentence,
      `Ofertas abaixo da FIPE costumam rotacionar rápido — vale comparar quilometragem, histórico e revisões antes de fechar.`,
    ];
  }

  // automaticos
  if (isEmptyVariant && catalogTotalAds > 0) {
    return [
      `Não há câmbio automático listado no momento em ${cityName}${uf}, mas o estoque local soma ${catalogTotalAds} anúncio(s). Amplie a busca no catálogo com filtro de câmbio automático para encontrar novidades.`,
      brandSentence,
      `Em muitas cidades, carros automáticos aparecem em levas — configure alerta ou volte em breve.`,
    ];
  }
  return [
    `Há ${totalAds} anúncio(s) de carros com câmbio automático em ${cityName}${uf}. ${priceText}`,
    brandSentence,
    `Compare versões e consumo: automático em cidade costuma valorizar conforto no trânsito diário.`,
  ];
}

async function ensureAvgPrice(
  slug: string,
  ads: AdItem[],
  kind: "general" | "below_fipe" | "auto"
): Promise<number | null> {
  const direct = averagePriceFromAds(ads);
  if (direct !== null) return direct;

  const filters: AdsSearchFilters = {
    city_slug: slug,
    limit: 60,
    page: 1,
    sort: "recent",
  };
  if (kind === "below_fipe") filters.below_fipe = true;
  if (kind === "auto") filters.transmission = TRANSMISSION_AUTO;

  const res = await fetchAdsSearch(filters);
  return averagePriceFromAds(res.data);
}

export async function loadLocalSeoLanding(
  slug: string,
  variant: LocalSeoVariant
): Promise<LocalSeoLandingModel> {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) notFound();

  const paths = {
    em: `/carros-em/${encodeURIComponent(safeSlug)}`,
    baratos: `/carros-baratos-em/${encodeURIComponent(safeSlug)}`,
    automaticos: `/carros-automaticos-em/${encodeURIComponent(safeSlug)}`,
  };

  const hubHref = `/cidade/${encodeURIComponent(safeSlug)}`;

  try {
    if (variant === "em") {
      const data = await fetchCityTerritorialPage(safeSlug);
      const city = data.city;
      if (!city?.name) notFound();

      const catalogTotalAds = maxTotal(data.stats?.totalAds, data.pagination?.recentAds?.total);
      const totalAds = catalogTotalAds;
      const sampleAds = (data.sections?.recentAds || []).slice(0, 10);
      const topBrands = topBrandsFromFacets(data.facets?.brands);
      const avgPrice = await ensureAvgPrice(safeSlug, sampleAds, "general");
      const isEmptyCity = catalogTotalAds === 0;

      const comprarHref = buildComprarHref({
        city_slug: safeSlug,
        sort: "recent",
        page: 1,
        limit: 20,
      });

      const base: Omit<LocalSeoLandingModel, "paragraphs" | "h1"> = {
        variant: "em",
        slug: safeSlug,
        cityName: city.name,
        state: city.state,
        region: city.region,
        totalAds,
        catalogTotalAds,
        avgPrice,
        topBrands,
        sampleAds,
        isEmptyVariant: totalAds === 0,
        isEmptyCity,
        comprarHref,
        hubHref,
        paths,
      };

      const h1 = isEmptyCity
        ? `Carros em ${city.name}${city.state ? ` — ${city.state}` : ""}`
        : `Carros em ${city.name}${city.state ? ` (${city.state})` : ""}`;

      return {
        ...base,
        h1,
        paragraphs: buildParagraphs({ ...base, h1 }),
      };
    }

    if (variant === "baratos") {
      const [belowData, mainData] = await Promise.all([
        fetchCityBelowFipeTerritorialPage(safeSlug),
        fetchCityTerritorialPage(safeSlug),
      ]);

      const city = belowData.city || mainData.city;
      if (!city?.name) notFound();

      const catalogTotalAds = maxTotal(
        mainData.stats?.totalAds,
        mainData.pagination?.recentAds?.total
      );
      const totalAds = maxTotal(
        belowData.pagination?.belowFipeAds?.total,
        belowData.stats?.totalBelowFipeAds
      );
      const sampleAds = (belowData.sections?.belowFipeAds || []).slice(0, 10);
      const topBrands = topBrandsFromFacets(mainData.facets?.brands);
      const avgPrice = await ensureAvgPrice(safeSlug, sampleAds, "below_fipe");
      const isEmptyCity = catalogTotalAds === 0;
      const isEmptyVariant = totalAds === 0 && !isEmptyCity;

      const comprarHref = buildComprarHref({
        city_slug: safeSlug,
        below_fipe: true,
        sort: "recent",
        page: 1,
        limit: 20,
      });

      const base: Omit<LocalSeoLandingModel, "paragraphs" | "h1"> = {
        variant: "baratos",
        slug: safeSlug,
        cityName: city.name,
        state: city.state,
        region: city.region,
        totalAds,
        catalogTotalAds,
        avgPrice,
        topBrands,
        sampleAds,
        isEmptyVariant,
        isEmptyCity,
        comprarHref,
        hubHref,
        paths,
      };

      const h1 = `Carros baratos em ${city.name}${city.state ? ` — ${city.state}` : ""}`;

      return {
        ...base,
        h1,
        paragraphs: buildParagraphs({ ...base, h1 }),
      };
    }

    // automaticos
    const [mainData, searchResult, facetsResult] = await Promise.all([
      fetchCityTerritorialPage(safeSlug),
      fetchAdsSearch({
        city_slug: safeSlug,
        transmission: TRANSMISSION_AUTO,
        limit: 12,
        page: 1,
        sort: "recent",
      }),
      fetchAdsFacets({
        city_slug: safeSlug,
        transmission: TRANSMISSION_AUTO,
      }),
    ]);

    const city = mainData.city;
    if (!city?.name) notFound();

    const catalogTotalAds = maxTotal(
      mainData.stats?.totalAds,
      mainData.pagination?.recentAds?.total
    );
    const totalAds = searchResult.pagination?.total ?? 0;
    const sampleAds = searchResult.data.slice(0, 10);
    const topBrands = topBrandsFromFacets(facetsResult.facets?.brands);
    const avgPrice = await ensureAvgPrice(safeSlug, sampleAds, "auto");
    const isEmptyCity = catalogTotalAds === 0;
    const isEmptyVariant = totalAds === 0 && !isEmptyCity;

    const comprarHref = buildComprarHref({
      city_slug: safeSlug,
      transmission: TRANSMISSION_AUTO,
      sort: "recent",
      page: 1,
      limit: 20,
    });

    const base: Omit<LocalSeoLandingModel, "paragraphs" | "h1"> = {
      variant: "automaticos",
      slug: safeSlug,
      cityName: city.name,
      state: city.state,
      region: city.region,
      totalAds,
      catalogTotalAds,
      avgPrice,
      topBrands,
      sampleAds,
      isEmptyVariant,
      isEmptyCity,
      comprarHref,
      hubHref,
      paths,
    };

    const h1 = `Carros automáticos em ${city.name}${city.state ? ` (${city.state})` : ""}`;

    return {
      ...base,
      h1,
      paragraphs: buildParagraphs({ ...base, h1 }),
    };
  } catch {
    notFound();
  }
}
