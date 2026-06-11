// frontend/lib/seo/territorial-content-engine.ts
//
// Fase 4.3 (§2/§3) — TerritorialSeoContentEngine.
//
// Gera conteúdo FACTUAL (title, meta, h1, intro, stats, highlights, FAQ,
// links internos) + política de indexação + JSON-LD para páginas de cidade,
// região, estado e abaixo da FIPE, a partir de dados REAIS agregados. Sem
// I/O e sem texto manual por cidade: é um template nacional alimentado por
// dados locais. Regra de ouro (§4): NUNCA inventar estatística — toda frase
// sem dado correspondente é omitida.
import { toAbsoluteUrl } from "./site";
import {
  buildCityFaqEntries,
  buildBelowFipeFaqEntries,
  buildFaqPageJsonLd,
  type FaqEntry,
} from "./faq";

export type TerritorialEntityType =
  | "city"
  | "region"
  | "state"
  | "below_fipe_city"
  | "below_fipe_region";

export type BrandCount = { brand: string; count?: number };
export type ModelCount = { model: string; count?: number };
export type NearbyPlace = { name: string; slug: string };

export interface TerritorialContentInput {
  entityType: TerritorialEntityType;
  slug: string;
  uf?: string;
  cityName?: string;
  regionName?: string;
  stateName?: string;
  activeAds?: number;
  belowFipeAds?: number;
  topBrands?: BrandCount[];
  topModels?: ModelCount[];
  minPrice?: number | null;
  avgPrice?: number | null;
  nearby?: NearbyPlace[];
  lastmod?: string | null;
  /** Cidade/região estratégica: relaxa o limiar de indexação (§3). */
  isStrategic?: boolean;
}

export type StatItem = { label: string; value: string };

export interface TerritorialSeoContent {
  entityType: TerritorialEntityType;
  slug: string;
  title: string;
  metaDescription: string;
  h1: string;
  intro: string;
  stats: StatItem[];
  highlights: string[];
  faq: FaqEntry[];
  internalLinks: Array<{ label: string; href: string }>;
  indexable: boolean;
  robots: { index: boolean; follow: boolean };
  canonicalUrl: string;
  lastmod: string | null;
  jsonLd: Record<string, unknown>[];
}

/** Limiares de indexação (§3) — ajustáveis (platform_settings/env/admin). */
export interface IndexThresholds {
  cityMinAds: number;
  regionMinAds: number;
  belowFipeMinAds: number;
  stateMinAds: number;
}

export const DEFAULT_INDEX_THRESHOLDS: IndexThresholds = {
  cityMinAds: 3,
  regionMinAds: 5,
  belowFipeMinAds: 2,
  stateMinAds: 1,
};

function brl(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function plural(n: number, singular: string, pluralForm: string): string {
  return n === 1 ? singular : pluralForm;
}

/** Junta itens em linguagem natural: "A, B e C". */
function joinPt(items: string[]): string {
  const arr = items.filter(Boolean);
  if (arr.length === 0) return "";
  if (arr.length === 1) return arr[0];
  return `${arr.slice(0, -1).join(", ")} e ${arr[arr.length - 1]}`;
}

function placeLabel(input: TerritorialContentInput): string {
  const name = input.cityName || input.regionName || input.stateName || "";
  const uf = input.uf ? ` - ${input.uf}` : "";
  return name ? `${name}${uf}` : "sua região";
}

/**
 * Política de indexação programática (§3). PURA e configurável.
 * Retorna { indexable, reason }.
 */
export function resolveTerritorialIndexation(
  input: TerritorialContentInput,
  thresholds: IndexThresholds = DEFAULT_INDEX_THRESHOLDS
): { indexable: boolean; reason: string } {
  const active = Math.max(0, Number(input.activeAds) || 0);
  const belowFipe = Math.max(0, Number(input.belowFipeAds) || 0);
  const strategic = Boolean(input.isStrategic);

  switch (input.entityType) {
    case "city": {
      if (active >= thresholds.cityMinAds) return { indexable: true, reason: "active>=limiar" };
      if (active >= 1 && strategic) return { indexable: true, reason: "estratégica" };
      return { indexable: false, reason: active === 0 ? "sem inventário" : "inventário baixo" };
    }
    case "region": {
      if (active >= thresholds.regionMinAds) return { indexable: true, reason: "active>=limiar" };
      if (active >= 1 && strategic) return { indexable: true, reason: "estratégica" };
      return { indexable: false, reason: "inventário regional baixo" };
    }
    case "below_fipe_city":
    case "below_fipe_region": {
      if (belowFipe >= thresholds.belowFipeMinAds)
        return { indexable: true, reason: "ofertas suficientes" };
      if (belowFipe === 1 && strategic)
        return { indexable: true, reason: "estratégica (1 oferta)" };
      return { indexable: false, reason: "sem oferta real abaixo da FIPE" };
    }
    case "state": {
      if (active >= thresholds.stateMinAds)
        return { indexable: true, reason: "inventário estadual" };
      return { indexable: false, reason: "sem inventário no estado" };
    }
    default:
      return { indexable: false, reason: "tipo desconhecido" };
  }
}

function buildCanonicalPath(input: TerritorialContentInput): string {
  const slug = encodeURIComponent(input.slug);
  switch (input.entityType) {
    case "city":
      return `/carros-em/${slug}`;
    case "below_fipe_city":
      return `/carros-baratos-em/${slug}`;
    case "region":
    case "below_fipe_region":
      return `/carros-usados/regiao/${slug}`;
    case "state":
      return `/carros-usados/${(input.uf || slug).toLowerCase()}`;
    default:
      return `/${slug}`;
  }
}

function buildH1(input: TerritorialContentInput): string {
  const place = placeLabel(input);
  switch (input.entityType) {
    case "below_fipe_city":
    case "below_fipe_region":
      return `Carros abaixo da FIPE em ${place}`;
    case "region":
      return `Carros usados na região de ${input.regionName || input.cityName || place}`;
    case "state":
      return `Carros usados em ${input.stateName || place}`;
    default:
      return `Carros usados em ${place}`;
  }
}

function buildStats(input: TerritorialContentInput): StatItem[] {
  const stats: StatItem[] = [];
  const active = Number(input.activeAds) || 0;
  if (active > 0) {
    stats.push({ label: "Anúncios ativos", value: String(active) });
  }
  if (input.belowFipeAds && input.belowFipeAds > 0) {
    stats.push({ label: "Abaixo da FIPE", value: String(input.belowFipeAds) });
  }
  if (input.minPrice != null && input.minPrice > 0) {
    stats.push({ label: "Menor preço", value: brl(input.minPrice) });
  }
  if (input.avgPrice != null && input.avgPrice > 0) {
    stats.push({ label: "Preço médio", value: brl(input.avgPrice) });
  }
  const topBrand = (input.topBrands || []).find((b) => b.brand);
  if (topBrand) {
    stats.push({ label: "Marca em destaque", value: topBrand.brand });
  }
  return stats;
}

function buildHighlights(input: TerritorialContentInput): string[] {
  const out: string[] = [];
  const brands = (input.topBrands || [])
    .map((b) => b.brand)
    .filter(Boolean)
    .slice(0, 3);
  if (brands.length > 0) out.push(`Marcas mais encontradas: ${joinPt(brands)}.`);
  const models = (input.topModels || [])
    .map((m) => m.model)
    .filter(Boolean)
    .slice(0, 3);
  if (models.length > 0) out.push(`Modelos frequentes: ${joinPt(models)}.`);
  const nearby = (input.nearby || [])
    .map((n) => n.name)
    .filter(Boolean)
    .slice(0, 4);
  if (nearby.length > 0) out.push(`Cidades próximas: ${joinPt(nearby)}.`);
  return out;
}

/**
 * Intro factual — só inclui orações com dado real (§4). Espelha os exemplos
 * de São Paulo e Águas de Lindóia do briefing.
 */
function buildIntro(input: TerritorialContentInput): string {
  const place = placeLabel(input);
  const active = Number(input.activeAds) || 0;
  const belowFipe = Number(input.belowFipeAds) || 0;
  const topBrand = (input.topBrands || []).find((b) => b.brand)?.brand;

  const parts: string[] = [];

  if (input.entityType === "region") {
    parts.push(
      `Na região de ${input.regionName || input.cityName || place}, o Carros na Cidade reúne ofertas de ${input.cityName || "diversas cidades"} e cidades próximas.`
    );
  } else if (input.entityType === "below_fipe_city" || input.entityType === "below_fipe_region") {
    parts.push(
      `Veja carros abaixo da Tabela FIPE em ${place} no Carros na Cidade — veículos cujo preço anunciado está abaixo da referência de mercado.`
    );
  } else if (input.entityType === "state") {
    parts.push(`Encontre carros usados em ${input.stateName || place} no Carros na Cidade.`);
  } else {
    parts.push(`Encontre carros usados em ${place} no Carros na Cidade.`);
  }

  if (active > 0) {
    const brandClause = topBrand
      ? `, com destaque para ${joinPt(
          (input.topBrands || [])
            .map((b) => b.brand)
            .filter(Boolean)
            .slice(0, 3)
        )}`
      : "";
    parts.push(
      `Hoje há ${active} ${plural(active, "anúncio ativo", "anúncios ativos")}${brandClause}.`
    );
  }

  if (
    belowFipe > 0 &&
    input.entityType !== "below_fipe_city" &&
    input.entityType !== "below_fipe_region"
  ) {
    parts.push(
      `Também há ${belowFipe} ${plural(belowFipe, "veículo classificado como abaixo da FIPE", "veículos classificados como abaixo da FIPE")}.`
    );
  }

  if (input.avgPrice != null && input.avgPrice > 0) {
    parts.push(`O preço médio aproximado é ${brl(input.avgPrice)}.`);
  }

  return parts.join(" ");
}

function buildFaq(input: TerritorialContentInput): FaqEntry[] {
  if (input.entityType === "below_fipe_city" || input.entityType === "below_fipe_region") {
    return buildBelowFipeFaqEntries({ cityName: input.cityName || input.regionName });
  }
  return buildCityFaqEntries({
    cityName: input.cityName || input.regionName || input.stateName || "",
    stateUf: input.uf,
  });
}

function buildInternalLinks(
  input: TerritorialContentInput
): Array<{ label: string; href: string }> {
  const slug = encodeURIComponent(input.slug);
  const links: Array<{ label: string; href: string }> = [];
  const place = input.cityName || input.regionName || "";

  if (input.entityType === "city") {
    links.push({ label: `Carros abaixo da FIPE em ${place}`, href: `/carros-baratos-em/${slug}` });
    if (input.uf) {
      links.push({
        label: `Carros usados em ${input.uf}`,
        href: `/carros-usados/${input.uf.toLowerCase()}`,
      });
    }
  } else if (input.entityType === "below_fipe_city") {
    links.push({ label: `Todos os carros em ${place}`, href: `/carros-em/${slug}` });
  } else if (input.entityType === "region") {
    links.push({ label: `Carros em ${input.cityName || place}`, href: `/carros-em/${slug}` });
  }

  // Conteúdo editorial de apoio (compra segura / FIPE).
  links.push({
    label: "Como saber se um carro está abaixo da FIPE",
    href: "/blog/como-comprar-carro-usado-com-seguranca",
  });
  links.push({ label: "Comprar com segurança", href: "/comprar" });
  return links;
}

function buildJsonLd(
  input: TerritorialContentInput,
  content: { title: string; metaDescription: string; canonicalUrl: string; faq: FaqEntry[] }
): Record<string, unknown>[] {
  const place = placeLabel(input);
  const collectionPage: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: content.title,
    description: content.metaDescription,
    url: content.canonicalUrl,
    inLanguage: "pt-BR",
    isPartOf: { "@type": "WebSite", name: "Carros na Cidade", url: toAbsoluteUrl("/") },
    about: {
      "@type": "Place",
      name: place,
      address: {
        "@type": "PostalAddress",
        addressLocality: input.cityName || undefined,
        addressRegion: input.uf || undefined,
        addressCountry: "BR",
      },
    },
  };

  const breadcrumb: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Início", item: toAbsoluteUrl("/") },
      ...(input.uf
        ? [
            {
              "@type": "ListItem",
              position: 2,
              name: input.uf.toUpperCase(),
              item: toAbsoluteUrl(`/carros-usados/${input.uf.toLowerCase()}`),
            },
          ]
        : []),
      {
        "@type": "ListItem",
        position: input.uf ? 3 : 2,
        name: content.title,
        item: content.canonicalUrl,
      },
    ],
  };

  const out: Record<string, unknown>[] = [collectionPage, breadcrumb];
  const faqLd = buildFaqPageJsonLd(content.faq);
  if (faqLd) out.push(faqLd);
  return out;
}

/**
 * Gera todo o pacote SEO/IA factual de uma página territorial.
 * Saída conforme §2 do briefing.
 */
export function buildTerritorialSeoContent(
  input: TerritorialContentInput,
  thresholds: IndexThresholds = DEFAULT_INDEX_THRESHOLDS
): TerritorialSeoContent {
  const place = placeLabel(input);
  const active = Number(input.activeAds) || 0;
  const belowFipe = Number(input.belowFipeAds) || 0;

  const h1 = buildH1(input);

  // Title (≤70) — inclui contagem só quando há dado.
  let title: string;
  if (input.entityType === "below_fipe_city" || input.entityType === "below_fipe_region") {
    title =
      belowFipe > 0
        ? `Carros abaixo da FIPE em ${place} — ${belowFipe} ${plural(belowFipe, "oferta", "ofertas")}`
        : `Carros abaixo da FIPE em ${place}`;
  } else if (active > 0) {
    title = `Carros usados em ${place} — ${active} ${plural(active, "anúncio", "anúncios")}`;
  } else {
    title = `Carros usados em ${place}`;
  }
  title = title.slice(0, 70);

  const intro = buildIntro(input);
  const metaDescription = intro.slice(0, 160);
  const stats = buildStats(input);
  const highlights = buildHighlights(input);
  const faq = buildFaq(input);
  const internalLinks = buildInternalLinks(input);
  const canonicalUrl = toAbsoluteUrl(buildCanonicalPath(input));

  const { indexable } = resolveTerritorialIndexation(input, thresholds);
  const jsonLd = buildJsonLd(input, { title, metaDescription, canonicalUrl, faq });

  return {
    entityType: input.entityType,
    slug: input.slug,
    title,
    metaDescription,
    h1,
    intro,
    stats,
    highlights,
    faq,
    internalLinks,
    indexable,
    robots: { index: indexable, follow: true },
    canonicalUrl,
    lastmod: input.lastmod || null,
    jsonLd,
  };
}
