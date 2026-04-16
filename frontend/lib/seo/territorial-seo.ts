import type { Metadata } from "next";
import type { TerritorialPagePayload } from "../search/territorial-public";
import { getSiteUrl, toAbsoluteUrl } from "./site";

type TerritorialSeoMode = "city" | "brand" | "model" | "opportunities" | "below_fipe";

function sanitizeText(value?: string | null, fallback = ""): string {
  return String(value || fallback).trim();
}

function normalizeTitle(title?: string | null): string {
  const raw = sanitizeText(title, "Carros na Cidade");
  return raw.length <= 70 ? raw : `${raw.slice(0, 67)}...`;
}

function normalizeDescription(description?: string | null): string {
  const raw = sanitizeText(
    description,
    "Marketplace automotivo regional: carros por cidade e estado, com filtros e rotas que respeitam o território — Carros na Cidade."
  );

  return raw.length <= 160 ? raw : `${raw.slice(0, 157)}...`;
}

function resolveOgImage(data: TerritorialPagePayload): string | undefined {
  const items =
    data.sections?.ads ||
    data.sections?.recentAds ||
    data.sections?.highlightAds ||
    data.sections?.opportunityAds ||
    data.sections?.belowFipeAds ||
    [];

  const first = items[0];

  const candidate =
    first?.image_url ||
    (Array.isArray(first?.images) && first.images.length > 0 ? first.images[0] : null);

  return candidate ? toAbsoluteUrl(candidate) : undefined;
}

function buildMetadataTitle(data: TerritorialPagePayload): string {
  return normalizeTitle(data.seo?.title || "Carros na Cidade");
}

function buildMetadataDescription(data: TerritorialPagePayload): string {
  return normalizeDescription(data.seo?.description);
}

function buildKeywords(data: TerritorialPagePayload, mode: TerritorialSeoMode): string[] {
  const city = sanitizeText(data.city?.name);
  const state = sanitizeText(data.city?.state);
  const brand = sanitizeText(data.brand?.name);
  const model = sanitizeText(data.model?.name);

  const keywords = new Set<string>();

  if (city) keywords.add(`carros em ${city}`);
  if (city && state) keywords.add(`carros em ${city} ${state}`);
  if (city) keywords.add(`veículos em ${city}`);
  if (brand && city) keywords.add(`${brand} em ${city}`);
  if (brand && model && city) keywords.add(`${brand} ${model} em ${city}`);

  if (mode === "opportunities" && city) {
    keywords.add(`oportunidades de carros em ${city}`);
  }

  if (mode === "below_fipe" && city) {
    keywords.add(`carros abaixo da fipe em ${city}`);
  }

  keywords.add("carros na cidade");
  keywords.add("portal de carros");

  return [...keywords];
}

function hasMeaningfulFilterValue(value: unknown): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "boolean") return value;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulFilterValue(item));
  return true;
}

function shouldIndexTerritorialPage(
  data: TerritorialPagePayload,
  mode: TerritorialSeoMode
): boolean {
  if (data.seo?.robots === "noindex,nofollow") {
    return false;
  }

  const filters = data.filters ?? {};
  const routeOwnedKeys = new Set<string>([
    "city",
    "city_id",
    "city_slug",
    "slug",
    "brand",
    "brand_slug",
    "model",
    "model_slug",
    "mode",
    "cluster",
    "type",
  ]);

  if (mode === "opportunities") {
    routeOwnedKeys.add("opportunities");
  }

  if (mode === "below_fipe") {
    routeOwnedKeys.add("below_fipe");
  }

  for (const [key, rawValue] of Object.entries(filters)) {
    if (!hasMeaningfulFilterValue(rawValue)) {
      continue;
    }

    const normalizedKey = key.trim().toLowerCase();

    if (normalizedKey === "page") {
      if (Number(rawValue) > 1) {
        return false;
      }
      continue;
    }

    if (normalizedKey === "sort" || normalizedKey === "order") {
      return false;
    }

    if (!routeOwnedKeys.has(normalizedKey)) {
      return false;
    }
  }

  return true;
}

export function buildTerritorialMetadata(
  data: TerritorialPagePayload,
  mode: TerritorialSeoMode
): Metadata {
  const siteUrl = getSiteUrl();
  const title = buildMetadataTitle(data);
  const description = buildMetadataDescription(data);
  const canonicalPath =
    data.seo?.canonicalPath ||
    (data.city?.slug ? `/cidade/${data.city.slug}` : "/");
  const canonical = toAbsoluteUrl(canonicalPath);
  const ogImage = resolveOgImage(data);
  const indexable = shouldIndexTerritorialPage(data, mode);
  const followable = data.seo?.robots !== "noindex,nofollow";

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    keywords: buildKeywords(data, mode),
    alternates: {
      canonical,
    },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: canonical,
      siteName: "Carros na Cidade",
      title,
      description,
      images: ogImage
        ? [
            {
              url: ogImage,
              width: 1200,
              height: 630,
              alt: title,
            },
          ]
        : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: indexable,
      follow: followable,
      googleBot: {
        index: indexable,
        follow: followable,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}

function buildListItemUrl(
  slug?: string,
  item?: { slug?: string; id?: number | string }
): string | undefined {
  if (!item) return undefined;
  if (item.slug) return toAbsoluteUrl(`/veiculo/${item.slug}`);
  if (item.id !== undefined && item.id !== null) {
    return slug ? toAbsoluteUrl(`/cidade/${slug}`) : undefined;
  }
  return slug ? toAbsoluteUrl(`/cidade/${slug}`) : undefined;
}

export function buildTerritorialJsonLd(
  data: TerritorialPagePayload,
  mode: TerritorialSeoMode
): Record<string, unknown> {
  const canonicalPath =
    data.seo?.canonicalPath ||
    (data.city?.slug ? `/cidade/${data.city.slug}` : "/");
  const canonical = toAbsoluteUrl(canonicalPath);
  const city = sanitizeText(data.city?.name);
  const state = sanitizeText(data.city?.state);
  const title = buildMetadataTitle(data);
  const description = buildMetadataDescription(data);

  const items =
    data.sections?.ads ||
    data.sections?.recentAds ||
    data.sections?.highlightAds ||
    data.sections?.opportunityAds ||
    data.sections?.belowFipeAds ||
    [];

  const itemListElements = items.slice(0, 12).map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    url: buildListItemUrl(data.city?.slug, item),
    name:
      item.title ||
      [item.brand, item.model, item.year].filter(Boolean).join(" ") ||
      `Veículo ${index + 1}`,
  }));

  const aboutParts = [city, state].filter(Boolean).join(" - ");

  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: canonical,
    inLanguage: "pt-BR",
    isPartOf: {
      "@type": "WebSite",
      name: "Carros na Cidade",
      url: toAbsoluteUrl("/"),
    },
    about: {
      "@type": "Place",
      name: aboutParts || "Brasil",
      address: {
        "@type": "PostalAddress",
        addressLocality: city || undefined,
        addressRegion: state || undefined,
        addressCountry: "BR",
      },
    },
    mainEntity:
      itemListElements.length > 0
        ? {
            "@type": "ItemList",
            itemListOrder: "https://schema.org/ItemListOrderAscending",
            numberOfItems: itemListElements.length,
            itemListElement: itemListElements,
          }
        : undefined,
    additionalType:
      mode === "below_fipe"
        ? "https://schema.org/OfferCatalog"
        : mode === "opportunities"
          ? "https://schema.org/OfferCatalog"
          : undefined,
  };
}
