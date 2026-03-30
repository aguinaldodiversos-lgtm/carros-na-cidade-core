import type {
  TerritorialInternalLinks,
  TerritorialModelLink,
  TerritorialPagePayload,
} from "./territorial-public";

export type TerritorialMode = "city" | "brand" | "model" | "opportunities" | "below_fipe";

export interface TerritorialNavItem {
  label: string;
  href: string;
  badge?: string;
}

export interface TerritorialNavGroup {
  title: string;
  items: TerritorialNavItem[];
}

function toTotalBadge(value?: number) {
  if (!value || value <= 0) return undefined;
  return value.toLocaleString("pt-BR");
}

function getCanonicalPath(data: TerritorialPagePayload) {
  return data.seo?.canonicalPath || "";
}

function isCurrentPath(data: TerritorialPagePayload, href?: string | null) {
  if (!href) return false;
  return getCanonicalPath(data) === href;
}

function compactItems<T>(items: Array<T | null | undefined>): T[] {
  return items.filter(Boolean) as T[];
}

function buildPrimaryRouteItems(data: TerritorialPagePayload, links: TerritorialInternalLinks) {
  return compactItems<TerritorialNavItem>([
    links.city && !isCurrentPath(data, links.city)
      ? {
          label: `Ver todos os carros em ${data.city?.name || "sua cidade"}`,
          href: links.city,
          badge: toTotalBadge(data.stats?.totalAds),
        }
      : null,
    links.opportunities && !isCurrentPath(data, links.opportunities)
      ? {
          label: "Ver oportunidades locais",
          href: links.opportunities,
          badge: toTotalBadge(data.stats?.totalOpportunityAds),
        }
      : null,
    links.belowFipe && !isCurrentPath(data, links.belowFipe)
      ? {
          label: "Ver carros abaixo da FIPE",
          href: links.belowFipe,
          badge: toTotalBadge(data.stats?.totalBelowFipeAds),
        }
      : null,
    links.brand && data.brand?.name && !isCurrentPath(data, links.brand)
      ? {
          label: `${data.brand.name} em ${data.city?.name || "sua cidade"}`,
          href: links.brand,
        }
      : null,
    links.model && data.brand?.name && data.model?.name && !isCurrentPath(data, links.model)
      ? {
          label: `${data.brand.name} ${data.model.name} em ${data.city?.name || "sua cidade"}`,
          href: links.model,
        }
      : null,
  ]);
}

function buildModelItems(models?: TerritorialModelLink[]) {
  return (models || [])
    .filter((item) => Boolean(item.path))
    .slice(0, 8)
    .map((item) => ({
      label: item.brand ? `${item.brand} ${item.model}` : item.model,
      href: item.path as string,
      badge: toTotalBadge(item.total),
    }));
}

export function buildTerritorialBreadcrumbs(
  data: TerritorialPagePayload,
  mode: TerritorialMode
): TerritorialNavItem[] {
  const cityName = data.city?.name;
  const citySlug = data.city?.slug;
  const brandName = data.brand?.name;
  const brandSlug = data.brand?.slug;
  const modelName = data.model?.name;
  const modelSlug = data.model?.slug;

  const breadcrumbs: TerritorialNavItem[] = [
    { label: "Home", href: "/" },
    { label: "Anúncios", href: "/anuncios" },
  ];

  if (cityName && citySlug) {
    breadcrumbs.push({
      label: cityName,
      href: `/cidade/${citySlug}`,
    });
  }

  if ((mode === "brand" || mode === "model") && citySlug && brandName && brandSlug) {
    breadcrumbs.push({
      label: brandName,
      href: `/cidade/${citySlug}/marca/${brandSlug}`,
    });
  }

  if (mode === "model" && citySlug && brandSlug && modelName && modelSlug) {
    breadcrumbs.push({
      label: modelName,
      href: `/cidade/${citySlug}/marca/${brandSlug}/modelo/${modelSlug}`,
    });
  }

  if (mode === "opportunities" && citySlug) {
    breadcrumbs.push({
      label: "Oportunidades",
      href: `/cidade/${citySlug}/oportunidades`,
    });
  }

  if (mode === "below_fipe" && citySlug) {
    breadcrumbs.push({
      label: "Abaixo da FIPE",
      href: `/cidade/${citySlug}/abaixo-da-fipe`,
    });
  }

  return breadcrumbs;
}

export function buildTerritorialHeroLinks(data: TerritorialPagePayload): TerritorialNavItem[] {
  const links = data.internalLinks;
  if (!links) return [];

  return buildPrimaryRouteItems(data, links).slice(0, 4);
}

export function buildTerritorialInternalLinkGroups(
  data: TerritorialPagePayload
): TerritorialNavGroup[] {
  const links = data.internalLinks;
  if (!links) return [];

  const groups = compactItems<TerritorialNavGroup>([
    (() => {
      const items = buildPrimaryRouteItems(data, links);
      if (!items.length) return null;

      return {
        title: "Rotas principais",
        items,
      };
    })(),
    (() => {
      const items = (links.brands || []).slice(0, 8).map((item) => ({
        label: item.brand,
        href: item.path,
        badge: toTotalBadge(item.total),
      }));

      if (!items.length) return null;

      return {
        title: "Marcas na cidade",
        items,
      };
    })(),
    (() => {
      const items = buildModelItems(links.models);
      if (!items.length) return null;

      return {
        title: "Modelos em destaque",
        items,
      };
    })(),
  ]);

  return groups;
}
