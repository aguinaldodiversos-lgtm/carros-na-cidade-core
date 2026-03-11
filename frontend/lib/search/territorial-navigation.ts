// frontend/lib/search/territorial-navigation.ts

import type { TerritorialPagePayload } from "./territorial-public";
export * from "../territorial-navigation";
export type TerritorialMode =
  | "city"
  | "brand"
  | "model"
  | "opportunities"
  | "below_fipe";

export interface TerritorialNavItem {
  label: string;
  href: string;
  badge?: string;
}

export interface TerritorialNavGroup {
  title: string;
  items: TerritorialNavItem[];
}

function normalizePath(path?: string | null): string | null {
  if (!path) return null;
  return path.startsWith("/") ? path : `/${path}`;
}

function safeSlug(value?: string | null): string {
  return String(value || "").trim().toLowerCase();
}

function cityBasePath(data: TerritorialPagePayload): string | null {
  const slug = data.city?.slug;
  return slug ? `/cidade/${slug}` : null;
}

function cityBrandPath(data: TerritorialPagePayload): string | null {
  const base = cityBasePath(data);
  const brand = data.brand?.slug || safeSlug(data.brand?.name);

  if (!base || !brand) return null;
  return `${base}/marca/${encodeURIComponent(brand)}`;
}

function cityModelPath(data: TerritorialPagePayload): string | null {
  const brandPath = cityBrandPath(data);
  const model = data.model?.slug || safeSlug(data.model?.name);

  if (!brandPath || !model) return null;
  return `${brandPath}/modelo/${encodeURIComponent(model)}`;
}

export function buildTerritorialBreadcrumbs(
  data: TerritorialPagePayload,
  mode: TerritorialMode
): TerritorialNavItem[] {
  const items: TerritorialNavItem[] = [{ label: "Início", href: "/" }];

  const cityPath = cityBasePath(data);
  if (cityPath && data.city?.name) {
    items.push({
      label: data.city.name,
      href: cityPath,
    });
  }

  if (mode === "brand" || mode === "model") {
    const brandPath = cityBrandPath(data);
    if (brandPath && data.brand?.name) {
      items.push({
        label: data.brand.name,
        href: brandPath,
      });
    }
  }

  if (mode === "model") {
    const modelPath = cityModelPath(data);
    if (modelPath && data.model?.name) {
      items.push({
        label: data.model.name,
        href: modelPath,
      });
    }
  }

  if (mode === "opportunities" && cityPath) {
    items.push({
      label: "Oportunidades",
      href: `${cityPath}/oportunidades`,
    });
  }

  if (mode === "below_fipe" && cityPath) {
    items.push({
      label: "Abaixo da FIPE",
      href: `${cityPath}/abaixo-da-fipe`,
    });
  }

  return items;
}

export function buildTerritorialHeroLinks(
  data: TerritorialPagePayload
): TerritorialNavItem[] {
  const base = cityBasePath(data);
  if (!base) return [];

  const links: TerritorialNavItem[] = [
    { label: "Página da cidade", href: base },
    { label: "Oportunidades", href: `${base}/oportunidades` },
    { label: "Abaixo da FIPE", href: `${base}/abaixo-da-fipe` },
  ];

  if (cityBrandPath(data) && data.brand?.name) {
    links.push({
      label: `Ver ${data.brand.name}`,
      href: cityBrandPath(data)!,
    });
  }

  if (cityModelPath(data) && data.model?.name) {
    links.push({
      label: `Ver ${data.model.name}`,
      href: cityModelPath(data)!,
    });
  }

  return links;
}

export function buildTerritorialInternalLinkGroups(
  data: TerritorialPagePayload
): TerritorialNavGroup[] {
  const groups: TerritorialNavGroup[] = [];
  const base = cityBasePath(data);

  if (!base) return groups;

  const coreItems: TerritorialNavItem[] = [];

  if (data.internalLinks?.city) {
    coreItems.push({
      label: "Todos os carros da cidade",
      href: normalizePath(data.internalLinks.city)!,
    });
  }

  if (data.internalLinks?.highlights) {
    coreItems.push({
      label: "Anúncios em destaque",
      href: normalizePath(data.internalLinks.highlights)!,
    });
  }

  if (data.internalLinks?.opportunities) {
    coreItems.push({
      label: "Oportunidades locais",
      href: normalizePath(data.internalLinks.opportunities)!,
    });
  }

  if (data.internalLinks?.belowFipe) {
    coreItems.push({
      label: "Abaixo da FIPE",
      href: normalizePath(data.internalLinks.belowFipe)!,
    });
  }

  if (data.internalLinks?.recent) {
    coreItems.push({
      label: "Anúncios recentes",
      href: normalizePath(data.internalLinks.recent)!,
    });
  }

  if (coreItems.length > 0) {
    groups.push({
      title: "Explorar esta cidade",
      items: coreItems,
    });
  }

  if (Array.isArray(data.internalLinks?.brands) && data.internalLinks.brands.length > 0) {
    groups.push({
      title: "Marcas populares",
      items: data.internalLinks.brands.slice(0, 10).map((item) => ({
        label: item.brand,
        href: normalizePath(item.path)!,
        badge: `${item.total}`,
      })),
    });
  }

  if (Array.isArray(data.internalLinks?.models) && data.internalLinks.models.length > 0) {
    groups.push({
      title: "Modelos populares",
      items: data.internalLinks.models.slice(0, 10).map((item) => ({
        label: [item.brand, item.model].filter(Boolean).join(" "),
        href: normalizePath(item.path)!,
        badge: `${item.total}`,
      })),
    });
  }

  return groups;
}
