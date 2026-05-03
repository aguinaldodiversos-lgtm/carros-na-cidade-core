import type { Metadata } from "next";
import type { LocalSeoLandingModel } from "@/lib/seo/local-seo-data";
import { getSiteUrl, toAbsoluteUrl } from "@/lib/seo/site";

function truncateTitle(raw: string, max = 70): string {
  const t = raw.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

function truncateDesc(raw: string, max = 160): string {
  const t = raw.trim();
  return t.length <= max ? t : `${t.slice(0, max - 3)}...`;
}

/**
 * Política de canonical de transição (sem 301): cada variante de landing
 * "carros-em / carros-baratos-em / carros-automaticos-em" canonicaliza para
 * a URL canônica intermediária equivalente da família /comprar+/cidade.
 * Isso consolida a autoridade SEO numa única URL por intenção, mantendo
 * a página antiga acessível para usuários e backlinks externos.
 *
 *   /carros-em/[slug]            → /comprar/cidade/[slug]
 *   /carros-baratos-em/[slug]    → /cidade/[slug]/abaixo-da-fipe
 *   /carros-automaticos-em/[slug]→ /comprar/cidade/[slug]   (+ noindex,follow)
 */
function transitionCanonicalPath(model: LocalSeoLandingModel): string {
  const slug = encodeURIComponent(model.slug);
  if (model.variant === "baratos") return `/cidade/${slug}/abaixo-da-fipe`;
  return `/comprar/cidade/${slug}`;
}

function resolveCanonical(model: LocalSeoLandingModel): string {
  return toAbsoluteUrl(transitionCanonicalPath(model));
}

/**
 * /carros-automaticos-em/[slug] cobre uma intenção de busca específica
 * ("câmbio automático em X") com pouca demanda própria e grande sobreposição
 * com /comprar/cidade/[slug]. Em transição, recebe noindex,follow para
 * impedir indexação concorrente, mas links continuam navegáveis.
 */
function shouldIndexLocalSeo(model: LocalSeoLandingModel): boolean {
  return model.variant !== "automaticos";
}

function resolveOgImage(model: LocalSeoLandingModel): string | undefined {
  const first = model.sampleAds[0];
  const url =
    first?.image_url ||
    (Array.isArray(first?.images) && first.images.length > 0 ? first.images[0] : null);
  return url ? toAbsoluteUrl(url) : undefined;
}

function buildDescription(model: LocalSeoLandingModel): string {
  const { cityName, state, variant, totalAds, catalogTotalAds, avgPrice, topBrands } = model;
  const uf = state ? `, ${state}` : "";
  const brands = topBrands
    .slice(0, 3)
    .map((b) => b.brand)
    .filter(Boolean)
    .join(", ");
  const price =
    avgPrice !== null
      ? ` Preço médio aproximado: ${new Intl.NumberFormat("pt-BR", {
          style: "currency",
          currency: "BRL",
          maximumFractionDigits: 0,
        }).format(avgPrice)}.`
      : "";

  if (model.isEmptyCity) {
    return truncateDesc(
      `Portal de carros em ${cityName}${uf}. Estoque local em atualização — explore o catálogo nacional e a página da cidade.`
    );
  }

  if (variant === "em") {
    return truncateDesc(
      `Carros à venda em ${cityName}${uf}: ${totalAds} anúncio(s) ativo(s). Marcas frequentes: ${brands || "diversas"}.${price} Catálogo com filtros por preço, ano e câmbio.`
    );
  }

  if (variant === "baratos") {
    if (model.isEmptyVariant) {
      return truncateDesc(
        `Carros baratos e abaixo da FIPE em ${cityName}${uf}. Agora há ${catalogTotalAds} anúncio(s) na cidade — abra o catálogo filtrado para ver ofertas que entram em tempo real.`
      );
    }
    return truncateDesc(
      `Carros abaixo da FIPE em ${cityName}${uf}: ${totalAds} oferta(s) com potencial de economia.${price} Compare modelos e negocie localmente.`
    );
  }

  if (model.isEmptyVariant) {
    return truncateDesc(
      `Carros automáticos em ${cityName}${uf}: estoque automático em atualização (${catalogTotalAds} veículo(s) na cidade). Use o filtro de câmbio automático no catálogo.`
    );
  }

  return truncateDesc(
    `Carros automáticos em ${cityName}${uf}: ${totalAds} anúncio(s) com câmbio automático.${price} Veja marcas como ${brands || "diversas"} e refine a busca.`
  );
}

function buildTitle(model: LocalSeoLandingModel): string {
  const { cityName, state, variant, totalAds } = model;
  const uf = state ? ` - ${state}` : "";

  if (model.isEmptyCity) {
    if (variant === "baratos") {
      return truncateTitle(`Carros baratos em ${cityName}${uf} | Carros na Cidade`);
    }
    if (variant === "automaticos") {
      return truncateTitle(`Carros automáticos em ${cityName}${uf} | Carros na Cidade`);
    }
    return truncateTitle(`Carros em ${cityName}${uf} | Carros na Cidade`);
  }

  if (variant === "em") {
    return truncateTitle(`Carros em ${cityName}${uf} — ${totalAds} anúncios | Carros na Cidade`);
  }

  if (variant === "baratos") {
    return truncateTitle(
      `Carros baratos em ${cityName}${uf} — ${totalAds} abaixo da FIPE | Carros na Cidade`
    );
  }

  return truncateTitle(
    `Carros automáticos em ${cityName}${uf} — ${totalAds} ofertas | Carros na Cidade`
  );
}

function buildKeywords(model: LocalSeoLandingModel): string[] {
  const city = model.cityName;
  const state = model.state || "";
  const k = new Set<string>([
    `carros em ${city}`,
    `carros ${city}`,
    `comprar carro ${city}`,
    "carros na cidade",
  ]);
  if (state) {
    k.add(`carros em ${city} ${state}`);
    k.add(`veículos ${city} ${state}`);
  }
  if (model.variant === "baratos") {
    k.add(`carros baratos ${city}`);
    k.add(`abaixo da fipe ${city}`);
  }
  if (model.variant === "automaticos") {
    k.add(`carro automático ${city}`);
    k.add(`câmbio automático ${city}`);
  }
  return [...k];
}

export function buildLocalSeoJsonLd(model: LocalSeoLandingModel): Record<string, unknown> {
  const canonical = resolveCanonical(model);
  const description = buildDescription(model);
  const title = buildTitle(model);
  const city = model.cityName;
  const state = model.state || "";

  const items = model.sampleAds.slice(0, 12).map((item, index) => ({
    "@type": "ListItem",
    position: index + 1,
    name:
      item.title ||
      [item.brand, item.model, item.year].filter(Boolean).join(" ") ||
      `Veículo ${index + 1}`,
  }));

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
      name: [city, state].filter(Boolean).join(" - ") || "Brasil",
      address: {
        "@type": "PostalAddress",
        addressLocality: city || undefined,
        addressRegion: state || undefined,
        addressCountry: "BR",
      },
    },
    mainEntity:
      items.length > 0
        ? {
            "@type": "ItemList",
            itemListOrder: "https://schema.org/ItemListOrderAscending",
            numberOfItems: items.length,
            itemListElement: items,
          }
        : undefined,
  };
}

export function buildLocalSeoMetadata(model: LocalSeoLandingModel): Metadata {
  const siteUrl = getSiteUrl();
  const title = buildTitle(model);
  const description = buildDescription(model);
  const canonical = resolveCanonical(model);
  const ogImage = resolveOgImage(model);
  const indexable = shouldIndexLocalSeo(model);

  return {
    metadataBase: new URL(siteUrl),
    title,
    description,
    keywords: buildKeywords(model),
    alternates: { canonical },
    openGraph: {
      type: "website",
      locale: "pt_BR",
      url: canonical,
      siteName: "Carros na Cidade",
      title,
      description,
      images: ogImage ? [{ url: ogImage, width: 1200, height: 630, alt: title }] : undefined,
    },
    twitter: {
      card: ogImage ? "summary_large_image" : "summary",
      title,
      description,
      images: ogImage ? [ogImage] : undefined,
    },
    robots: {
      index: indexable,
      follow: true,
      googleBot: {
        index: indexable,
        follow: true,
        "max-image-preview": "large",
        "max-snippet": -1,
        "max-video-preview": -1,
      },
    },
  };
}
