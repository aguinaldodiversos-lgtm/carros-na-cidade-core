/**
 * Navegação institucional — fonte única para header e footer.
 *
 * Footer (briefing 2026-05-22 — "Correção no final da página
 * Comprar/Catálogo"): 6 colunas substituem o antigo card "Comprar
 * carros usados em [cidade] é fácil e seguro":
 *
 *   1. Comprar         — buscar, oportunidades, por cidade, por região
 *   2. Modelos         — mais buscados (fixo, top demanda nacional)
 *   3. Cidades         — onde tem mais carros (contextual quando possível)
 *   4. Ferramentas     — FIPE, simulador, dicas, blog
 *   5. Vender          — anunciar grátis, lojista, planos
 *   6. Institucional   — sobre, contato, ajuda, segurança + legais
 *
 * Links territoriais respeitam o contexto da página:
 *   - Em página estadual:  "Carros por região" → /carros-usados/[uf]
 *   - Em página de cidade: "Carros por região" → /carros-usados/regiao/[slug]
 *   - Sem contexto:        ambos os links apontam para /comprar (catálogo)
 *
 * "Anúncios verificados" foi banido do texto público enquanto não houver
 * verificação canônica. Header não foi tocado.
 */

import { DEFAULT_PUBLIC_CITY_SLUG } from "./public-config";

export type TerritorialContext = {
  /** Slug canônico da cidade ativa (ex.: "atibaia-sp"). Opcional. */
  citySlug?: string | null;
  /** UF ativa (ex.: "SP"). Opcional — derivado de citySlug quando ausente. */
  stateUf?: string | null;
};

export function getTerritorialRoutesForCity(citySlug: string) {
  const slug = (citySlug || DEFAULT_PUBLIC_CITY_SLUG).trim() || DEFAULT_PUBLIC_CITY_SLUG;
  const enc = encodeURIComponent(slug);
  return {
    comprar: `/comprar?city_slug=${enc}`,
    comprarBelowFipe: `/comprar?below_fipe=true&city_slug=${enc}`,
    fipe: `/tabela-fipe/${enc}`,
    financing: `/simulador-financiamento/${enc}`,
    cidade: `/carros-em/${enc}`,
    regional: `/carros-usados/regiao/${enc}`,
    blog: `/blog/${enc}`,
  } as const;
}

const DEFAULT_TERRITORY = getTerritorialRoutesForCity(DEFAULT_PUBLIC_CITY_SLUG);

export const SITE_ROUTES = {
  home: "/",
  comprar: DEFAULT_TERRITORY.comprar,
  comprarBelowFipe: DEFAULT_TERRITORY.comprarBelowFipe,
  comprarOpen: "/comprar",
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

export type SiteNavSectionId =
  | "comprar"
  | "modelos"
  | "cidades"
  | "ferramentas"
  | "vender"
  | "institucional"
  | "conteudo";

export type SiteNavLink = {
  id: string;
  label: string;
  href: string;
};

export type SiteNavSection = {
  id: SiteNavSectionId;
  title: string;
  links: SiteNavLink[];
};

/**
 * Modelos populares — lista fixa nacional, derivada da demanda agregada
 * (top 5 do termo de busca q= em /comprar). Não é por cidade porque o
 * footer renderiza em rotas sem contexto territorial (home, sobre, blog).
 * Ranking pode ser revisto trimestralmente com base nas métricas reais.
 */
const POPULAR_MODELS: ReadonlyArray<{ label: string; query: string }> = [
  { label: "Volkswagen T-Cross", query: "T-Cross" },
  { label: "Honda Civic", query: "Civic" },
  { label: "Toyota Corolla", query: "Corolla" },
  { label: "Hyundai HB20", query: "HB20" },
  { label: "Jeep Compass", query: "Compass" },
];

/**
 * Cidades com mais carros — fallback nacional (capitais + polos
 * regionais com maior liquidez histórica em SP). Quando há contexto
 * territorial (UF da cidade ativa), substituiríamos pelas cidades
 * curadas do estado correspondente (helper `getStateCuratedCities`).
 * Aqui mantemos o fallback simples para não forçar import de pesquisa
 * dinâmica num footer puramente declarativo. Re-curar quando rolar
 * expansão para outros estados.
 */
const POPULAR_CITIES_FALLBACK: ReadonlyArray<{ name: string; slug: string }> = [
  { name: "São Paulo", slug: "sao-paulo-sp" },
  { name: "Campinas", slug: "campinas-sp" },
  { name: "Santos", slug: "santos-sp" },
  { name: "Ribeirão Preto", slug: "ribeirao-preto-sp" },
  { name: "São José dos Campos", slug: "sao-jose-dos-campos-sp" },
  { name: "Sorocaba", slug: "sorocaba-sp" },
];

function buildModelSearchHref(query: string): string {
  return `/comprar?q=${encodeURIComponent(query)}`;
}

export function buildFooterNavSections(
  citySlug: string,
  context: TerritorialContext = {}
): SiteNavSection[] {
  const territorial = getTerritorialRoutesForCity(citySlug);

  // "Carros por região" prefere link contextual:
  //   - Se a página atual tem cidade ativa → Página Regional dessa cidade.
  //   - Senão, se tem UF → Página Estadual canônica.
  //   - Senão, fallback para o catálogo geral.
  const regionalLinkHref = context.citySlug
    ? `/carros-usados/regiao/${encodeURIComponent(context.citySlug)}`
    : context.stateUf
      ? `/carros-usados/${context.stateUf.toLowerCase()}`
      : SITE_ROUTES.comprarOpen;

  // "Carros por cidade" também respeita contexto.
  const cityLinkHref = context.citySlug
    ? `/carros-em/${encodeURIComponent(context.citySlug)}`
    : territorial.cidade;

  return [
    {
      id: "comprar",
      title: "Comprar",
      links: [
        { id: "buscar", label: "Ver anúncios", href: SITE_ROUTES.comprarOpen },
        {
          id: "below-fipe",
          label: "Oportunidades abaixo da FIPE",
          href: territorial.comprarBelowFipe,
        },
        { id: "cidade", label: "Carros por cidade", href: cityLinkHref },
        { id: "regiao", label: "Carros por região", href: regionalLinkHref },
      ],
    },
    {
      id: "modelos",
      title: "Modelos mais buscados",
      links: POPULAR_MODELS.map((m) => ({
        id: `model-${m.query.toLowerCase()}`,
        label: m.label,
        href: buildModelSearchHref(m.query),
      })),
    },
    {
      id: "cidades",
      title: "Cidades com mais carros",
      links: POPULAR_CITIES_FALLBACK.map((c) => ({
        id: `city-${c.slug}`,
        label: c.name,
        href: `/carros-em/${encodeURIComponent(c.slug)}`,
      })),
    },
    {
      id: "ferramentas",
      title: "Ferramentas",
      links: [
        { id: "fipe", label: "Tabela FIPE", href: territorial.fipe },
        { id: "financiamento", label: "Simulador de financiamento", href: territorial.financing },
        { id: "seguranca", label: "Dicas de segurança", href: SITE_ROUTES.seguranca },
        { id: "blog", label: "Blog", href: territorial.blog },
      ],
    },
    {
      id: "vender",
      title: "Vender",
      links: [
        { id: "anunciar", label: "Anuncie grátis", href: SITE_ROUTES.planos },
        { id: "lojista", label: "Área do lojista", href: SITE_ROUTES.dealerArea },
        { id: "planos", label: "Planos e destaques", href: SITE_ROUTES.planos },
      ],
    },
    {
      id: "institucional",
      title: "Institucional",
      links: [
        { id: "sobre", label: "Sobre", href: SITE_ROUTES.sobre },
        { id: "contato", label: "Contato", href: SITE_ROUTES.contato },
        { id: "ajuda", label: "Central de ajuda", href: SITE_ROUTES.ajuda },
        { id: "como-funciona", label: "Como funciona", href: SITE_ROUTES.comoFunciona },
        { id: "privacy", label: "Política de privacidade", href: SITE_ROUTES.privacy },
        { id: "terms", label: "Termos de uso", href: SITE_ROUTES.terms },
      ],
    },
  ];
}

/**
 * Header — mantém o set curto de 3 pilares para caber na barra.
 * Não foi tocado pelo briefing do footer.
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
  if (path.startsWith("/carros-em/")) {
    return pathname.startsWith("/carros-em/");
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
