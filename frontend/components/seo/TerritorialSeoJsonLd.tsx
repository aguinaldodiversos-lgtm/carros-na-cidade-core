// frontend/components/seo/TerritorialSeoJsonLd.tsx

import React from "react";

type BreadcrumbItem = {
  name: string;
  item: string;
};

export type TerritorialSeoJsonLdProps = {
  /** URL absoluta da página (preferível). Se vier relativa, tentamos compor. */
  url?: string;

  /** Título e descrição para WebPage/CollectionPage */
  title?: string;
  description?: string;

  /** Tipo lógico (livre) para ajudar na composição */
  type?: string;

  /** Cidade / estado / marca / modelo (opcionais) */
  city?: { name?: string; slug?: string; state?: string } | string;
  state?: string;
  brand?: string;
  model?: string;

  /** Breadcrumbs custom (se a página já monta) */
  breadcrumbs?: BreadcrumbItem[];

  /** Se tiver lista (ads/itens), dá pra gerar ItemList básico */
  items?: Array<{ url?: string; name?: string }> | Array<any>;
  itemCount?: number;

  /** Forçar URL base do site (para resolver url relativa) */
  baseSiteUrl?: string;

  /** Qualquer payload extra sem quebrar typings */
  [key: string]: any;
};

function resolveSiteUrl(explicit?: string) {
  const fromEnv =
    (process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "").trim();

  if (explicit?.trim()) return explicit.trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv.replace(/\/+$/, "");

  // fallback seguro (não quebra build)
  return "https://carrosnacidade.com";
}

function toAbsoluteUrl(input: string | undefined, base: string) {
  if (!input) return "";
  const raw = String(input).trim();
  if (!raw) return "";
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  const normalized = raw.startsWith("/") ? raw : `/${raw}`;
  return `${base}${normalized}`;
}

function safeJsonStringify(value: unknown) {
  try {
    return JSON.stringify(value, (_k, v) => {
      if (typeof v === "bigint") return v.toString();
      return v;
    });
  } catch {
    return "";
  }
}

function defaultBreadcrumbs(
  pageUrlAbs: string,
  props: TerritorialSeoJsonLdProps,
  base: string
): BreadcrumbItem[] {
  const crumbs: BreadcrumbItem[] = [
    { name: "Início", item: `${base}/` },
  ];

  // tenta inferir cidade/estado/marca/modelo quando existir
  const cityName =
    typeof props.city === "string"
      ? props.city
      : props.city?.name || undefined;

  const state =
    props.state ||
    (typeof props.city === "object" ? props.city?.state : undefined);

  if (cityName) {
    const label = state ? `${cityName} - ${state}` : cityName;
    crumbs.push({ name: label, item: pageUrlAbs });
  } else {
    // se não tiver nada, ao menos a página atual
    crumbs.push({ name: props.title || "Página", item: pageUrlAbs });
  }

  return crumbs;
}

/**
 * Componente “server-safe” (sem use client) para injetar JSON-LD.
 * Ele NÃO deve quebrar build/SSR: se faltar dado, simplesmente não injeta.
 */
export function TerritorialSeoJsonLd(props: TerritorialSeoJsonLdProps) {
  const base = resolveSiteUrl(props.baseSiteUrl);

  const pageUrlAbs = toAbsoluteUrl(props.url, base);
  if (!pageUrlAbs) return null;

  const title =
    props.title ||
    (typeof props.city === "string"
      ? `Carros em ${props.city}`
      : props.city?.name
      ? `Carros em ${props.city.name}`
      : "Carros na Cidade");

  const description =
    props.description ||
    "Encontre carros usados e seminovos com páginas territoriais por cidade, marca e modelo.";

  const breadcrumbs =
    Array.isArray(props.breadcrumbs) && props.breadcrumbs.length > 0
      ? props.breadcrumbs.map((c) => ({
          name: String(c.name || "").trim(),
          item: toAbsoluteUrl(c.item, base),
        }))
      : defaultBreadcrumbs(pageUrlAbs, props, base);

  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: breadcrumbs
      .filter((c) => c.name && c.item)
      .map((c, idx) => ({
        "@type": "ListItem",
        position: idx + 1,
        name: c.name,
        item: c.item,
      })),
  };

  const pageLd = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description,
    url: pageUrlAbs,
    isPartOf: {
      "@type": "WebSite",
      name: "Carros na Cidade",
      url: `${base}/`,
    },
  };

  // ItemList opcional (não assume shape, só tenta extrair url/name)
  const rawItems = Array.isArray(props.items) ? props.items : [];
  const itemListElements = rawItems
    .slice(0, 20)
    .map((it, idx) => {
      const url =
        typeof it?.url === "string" ? toAbsoluteUrl(it.url, base) : "";
      const name =
        typeof it?.name === "string"
          ? it.name
          : typeof it?.title === "string"
          ? it.title
          : "";
      if (!url && !name) return null;
      return {
        "@type": "ListItem",
        position: idx + 1,
        url: url || pageUrlAbs,
        name: name || undefined,
      };
    })
    .filter(Boolean);

  const itemListLd =
    itemListElements.length > 0
      ? {
          "@context": "https://schema.org",
          "@type": "ItemList",
          itemListElement: itemListElements,
          numberOfItems:
            typeof props.itemCount === "number"
              ? props.itemCount
              : itemListElements.length,
        }
      : null;

  const graph = itemListLd ? [pageLd, breadcrumbLd, itemListLd] : [pageLd, breadcrumbLd];
  const json = safeJsonStringify(graph);
  if (!json) return null;

  return (
    <script
      type="application/ld+json"
      // evita warning de hydration em cenários mistos
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: json }}
    />
  );
}

export default TerritorialSeoJsonLd;
