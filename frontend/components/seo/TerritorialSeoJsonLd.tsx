// frontend/components/seo/TerritorialSeoJsonLd.tsx
import React from "react";

export type BreadcrumbItem = {
  name: string;
  item?: string; // url absoluta ou path
};

export interface TerritorialSeoJsonLdProps {
  /** URL base do site, ex: https://carrosnacidade.com */
  baseUrl?: string;

  /** Path canônico (começando com /). Se não vier, tentamos montar */
  path?: string;

  /** Title/description opcionais (se não vier, geramos algo aceitável) */
  title?: string;
  description?: string;

  /** Dados territoriais (qualquer combinação) */
  citySlug?: string;
  cityName?: string;
  state?: string;
  brand?: string;
  model?: string;

  /** Variação da página (opcional) */
  variant?:
    | "city"
    | "oportunidades"
    | "abaixo-da-fipe"
    | "marca"
    | "modelo";

  /** Quantidade de itens (opcional) */
  itemCount?: number;

  /** Breadcrumbs opcionais */
  breadcrumbs?: BreadcrumbItem[];

  /** Permite props extras sem quebrar TS nas páginas que chamam com outros nomes */
  [key: string]: any;
}

function normalizeBaseUrl(raw?: string) {
  const env =
    raw ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    "";
  const base = String(env).trim().replace(/\/+$/, "");
  return base || "https://carrosnacidade.com";
}

function ensureAbsolute(baseUrl: string, maybeUrlOrPath?: string) {
  if (!maybeUrlOrPath) return baseUrl;
  const v = String(maybeUrlOrPath).trim();
  if (!v) return baseUrl;
  if (v.startsWith("http://") || v.startsWith("https://")) return v;
  if (!v.startsWith("/")) return `${baseUrl}/${v}`;
  return `${baseUrl}${v}`;
}

function safeJsonLd(obj: unknown) {
  // evita quebrar HTML com "<"
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

function buildPathFromParts(p: TerritorialSeoJsonLdProps) {
  const citySlug = p.citySlug || p.slug || p.cidadeSlug || p.cidadeSlug;
  const brand = p.brand || p.marca;
  const model = p.model || p.modelo;
  const variant = p.variant;

  if (!citySlug) return "/";

  // Rotas que você tem no projeto (app/cidade/[slug]/...)
  if (variant === "oportunidades") return `/cidade/${citySlug}/oportunidades`;
  if (variant === "abaixo-da-fipe") return `/cidade/${citySlug}/abaixo-da-fipe`;
  if (variant === "marca" && brand) return `/cidade/${citySlug}/marca/${brand}`;
  if (variant === "modelo" && brand && model)
    return `/cidade/${citySlug}/marca/${brand}/modelo/${model}`;

  // fallback "city"
  if (brand && model) return `/cidade/${citySlug}/marca/${brand}/modelo/${model}`;
  if (brand) return `/cidade/${citySlug}/marca/${brand}`;
  return `/cidade/${citySlug}`;
}

function buildDefaultTitle(p: TerritorialSeoJsonLdProps) {
  const cityName = p.cityName || p.cidadeNome || p.city || p.cidade;
  const state = p.state || p.uf;
  const brand = p.brand || p.marca;
  const model = p.model || p.modelo;
  const variant = p.variant;

  const place = cityName ? `${cityName}${state ? ` - ${state}` : ""}` : "sua cidade";

  if (variant === "oportunidades") return `Oportunidades em ${place} | Carros na Cidade`;
  if (variant === "abaixo-da-fipe") return `Abaixo da FIPE em ${place} | Carros na Cidade`;
  if (brand && model) return `${brand} ${model} em ${place} | Carros na Cidade`;
  if (brand) return `${brand} em ${place} | Carros na Cidade`;
  return `Carros em ${place} | Carros na Cidade`;
}

function buildDefaultDescription(p: TerritorialSeoJsonLdProps) {
  const cityName = p.cityName || p.cidadeNome || p.city || p.cidade;
  const state = p.state || p.uf;
  const brand = p.brand || p.marca;
  const model = p.model || p.modelo;
  const variant = p.variant;

  const place = cityName ? `${cityName}${state ? ` - ${state}` : ""}` : "sua cidade";

  if (variant === "oportunidades")
    return `Encontre oportunidades e ofertas de veículos em ${place}.`;
  if (variant === "abaixo-da-fipe")
    return `Veja veículos abaixo da FIPE em ${place}.`;
  if (brand && model)
    return `Confira anúncios de ${brand} ${model} em ${place}.`;
  if (brand) return `Confira anúncios de ${brand} em ${place}.`;
  return `Confira anúncios de veículos em ${place}.`;
}

function buildBreadcrumbs(p: TerritorialSeoJsonLdProps, baseUrl: string, url: string) {
  if (Array.isArray(p.breadcrumbs) && p.breadcrumbs.length) {
    return p.breadcrumbs.map((b, idx) => ({
      "@type": "ListItem",
      position: idx + 1,
      name: b.name,
      item: ensureAbsolute(baseUrl, b.item),
    }));
  }

  // fallback simples
  return [
    { "@type": "ListItem", position: 1, name: "Início", item: baseUrl },
    { "@type": "ListItem", position: 2, name: "Cidade", item: url },
  ];
}

export default function TerritorialSeoJsonLd(props: TerritorialSeoJsonLdProps) {
  const baseUrl = normalizeBaseUrl(props.baseUrl);
  const path = (props.path && String(props.path).trim()) || buildPathFromParts(props);
  const url = ensureAbsolute(baseUrl, path);

  const title = String(props.title || buildDefaultTitle(props));
  const description = String(props.description || buildDefaultDescription(props));

  const webPage = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: title,
    description,
    url,
  };

  const breadcrumbList = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: buildBreadcrumbs(props, baseUrl, url),
  };

  const graph: any[] = [webPage, breadcrumbList];

  if (typeof props.itemCount === "number" && props.itemCount >= 0) {
    graph.push({
      "@context": "https://schema.org",
      "@type": "ItemList",
      name: title,
      url,
      numberOfItems: props.itemCount,
    });
  }

  return (
    <script
      type="application/ld+json"
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: safeJsonLd({ "@graph": graph }) }}
    />
  );
}

export { TerritorialSeoJsonLd };
