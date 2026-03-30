/**
 * Navegação institucional — fonte única para header, footer e variantes compactas (ex.: home).
 * Pilares: Comprar · Vender · Conteúdo · Institucional.
 * Rotas territoriais (FIPE, blog da cidade, comprar com city_slug) vêm de `getTerritorialRoutesForCity`.
 */

import { DEFAULT_PUBLIC_CITY_SLUG } from "./public-config";

export function getTerritorialRoutesForCity(citySlug: string) {
  const slug = (citySlug || DEFAULT_PUBLIC_CITY_SLUG).trim() || DEFAULT_PUBLIC_CITY_SLUG;
  const enc = encodeURIComponent(slug);
  return {
    comprar: `/comprar?city_slug=${enc}`,
    comprarBelowFipe: `/comprar?below_fipe=true&city_slug=${enc}`,
    fipe: `/tabela-fipe/${enc}`,
    financing: `/simulador-financiamento/${enc}`,
    cidade: `/cidade/${enc}`,
    blog: `/blog/${enc}`,
  } as const;
}

const DEFAULT_TERRITORY = getTerritorialRoutesForCity(DEFAULT_PUBLIC_CITY_SLUG);

export const SITE_ROUTES = {
  home: "/",
  comprar: DEFAULT_TERRITORY.comprar,
  comprarBelowFipe: DEFAULT_TERRITORY.comprarBelowFipe,
  planos: "/planos",
  login: "/login",
  dealerArea: "/login?next=/dashboard-loja",
  blog: DEFAULT_TERRITORY.blog,
  fipe: DEFAULT_TERRITORY.fipe,
  financing: DEFAULT_TERRITORY.financing,
  cidade: DEFAULT_TERRITORY.cidade,
  comoFunciona: "/como-funciona",
  ajuda: "/ajuda",
  seguranca: "/seguranca",
  sobre: "/sobre",
  contato: "/contato",
  favoritos: "/favoritos",
  privacy: "/politica-de-privacidade",
  terms: "/termos-de-uso",
  lgpd: "/lgpd",
} as const;

export const SITE_CONTACT = {
  email: "contato@carrosnacidade.com",
  phoneDisplay: "(11) 98768-4221",
  phoneHref: "tel:+5511987684221",
} as const;

export type SiteNavSectionId = "comprar" | "vender" | "conteudo" | "institucional";

export type SiteNavLink = {
  id: string;
  label: string;
  href: string;
};

export type SiteNavSection = {
  id: SiteNavSectionId;
  /** Rótulo curto para acessibilidade e agrupamento no menu */
  title: string;
  links: SiteNavLink[];
};

export function buildFooterNavSections(citySlug: string): SiteNavSection[] {
  const r = getTerritorialRoutesForCity(citySlug);
  return [
    {
      id: "comprar",
      title: "Comprar",
      links: [
        { id: "buscar", label: "Ver anúncios", href: r.comprar },
        { id: "below-fipe", label: "Oportunidades abaixo da FIPE", href: r.comprarBelowFipe },
        { id: "financiamento", label: "Simulador de financiamento", href: r.financing },
      ],
    },
    {
      id: "vender",
      title: "Vender",
      links: [
        { id: "planos", label: "Planos e anunciar", href: SITE_ROUTES.planos },
        { id: "lojista", label: "Área do lojista", href: SITE_ROUTES.dealerArea },
      ],
    },
    {
      id: "conteudo",
      title: "Conteúdo",
      links: [
        { id: "fipe", label: "Tabela FIPE", href: r.fipe },
        { id: "blog", label: "Blog", href: r.blog },
        { id: "cidade", label: "Página da cidade", href: r.cidade },
      ],
    },
    {
      id: "institucional",
      title: "Institucional",
      links: [
        { id: "como-funciona", label: "Como funciona", href: SITE_ROUTES.comoFunciona },
        { id: "ajuda", label: "Central de ajuda", href: SITE_ROUTES.ajuda },
        { id: "seguranca", label: "Segurança", href: SITE_ROUTES.seguranca },
        { id: "sobre", label: "Sobre", href: SITE_ROUTES.sobre },
        { id: "contato", label: "Contato", href: SITE_ROUTES.contato },
        { id: "entrar", label: "Entrar", href: SITE_ROUTES.login },
      ],
    },
  ];
}

/**
 * Header — mesmos pilares, rótulos curtos para caber na barra; alinhado ao rodapé.
 * Favoritos fica fora dos grupos (atalho global).
 */
export function buildHeaderNavSections(citySlug: string): SiteNavSection[] {
  const r = getTerritorialRoutesForCity(citySlug);
  return [
    {
      id: "comprar",
      title: "Comprar",
      links: [
        { id: "buscar", label: "Buscar", href: r.comprar },
        { id: "oportunidades", label: "Oportunidades", href: r.comprarBelowFipe },
      ],
    },
    {
      id: "vender",
      title: "Vender",
      links: [{ id: "anunciar", label: "Anunciar", href: SITE_ROUTES.planos }],
    },
    {
      id: "conteudo",
      title: "Conteúdo",
      links: [
        { id: "blog", label: "Blog", href: r.blog },
        { id: "fipe", label: "FIPE", href: r.fipe },
        { id: "financiamento", label: "Financiamento", href: r.financing },
      ],
    },
  ];
}

/** Rodapé completo — fallback com cidade padrão (SSR / testes). */
export const FOOTER_NAV_SECTIONS = buildFooterNavSections(DEFAULT_PUBLIC_CITY_SLUG);

export const HEADER_NAV_SECTIONS = buildHeaderNavSections(DEFAULT_PUBLIC_CITY_SLUG);

/** Ativo considerando pathname, query e sub-rotas conhecidas (blog, FIPE, cidade…). */
export function isNavLinkActive(
  pathname: string,
  searchParams: URLSearchParams,
  href: string
): boolean {
  const [path, queryString] = href.split("?");

  if (path.startsWith("/blog/")) {
    return pathname === path || pathname.startsWith(`${path}/`);
  }
  if (path.startsWith("/tabela-fipe")) {
    return pathname.startsWith("/tabela-fipe");
  }
  if (path.startsWith("/simulador-financiamento")) {
    return pathname.startsWith("/simulador-financiamento");
  }
  if (path.startsWith("/cidade/")) {
    return pathname.startsWith("/cidade/");
  }

  if (path === "/comprar") {
    if (pathname !== "/comprar") return false;
    const required = queryString ? new URLSearchParams(queryString) : new URLSearchParams();
    const reqBelow = required.get("below_fipe") === "true";
    const reqCity = required.get("city_slug");
    const curBelow = searchParams.get("below_fipe") === "true";
    const curCity = searchParams.get("city_slug");
    if (reqBelow !== curBelow) return false;
    if (reqCity) {
      return curCity === reqCity;
    }
    return !curCity && !curBelow;
  }

  if (pathname !== path) return false;

  if (!queryString) {
    if (path === "/login") {
      return !searchParams.get("next");
    }
    return true;
  }

  const required = new URLSearchParams(queryString);
  for (const [key, value] of required.entries()) {
    if (searchParams.get(key) !== value) return false;
  }
  return true;
}
