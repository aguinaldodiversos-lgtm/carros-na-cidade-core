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

import { getCanonicalCityPath } from "@/lib/seo/canonical-city-path";

import { DEFAULT_PUBLIC_CITY_SLUG } from "./public-config";

export type TerritorialContext = {
  /** Slug canônico da cidade ativa (ex.: "atibaia-sp"). Opcional. */
  citySlug?: string | null;
  /** UF ativa (ex.: "SP"). Opcional — derivado de citySlug quando ausente. */
  stateUf?: string | null;
};

export type TerritorialRoutesOptions = {
  /**
   * A cidade pertence ao conjunto público (tem anúncio ativo)?
   *
   * `undefined` = "ainda não sei" e é tratado como TRUE — ver a nota de
   * fail-open abaixo.
   */
  isPublicCity?: boolean;
};

/**
 * Rotas territoriais do cabeçalho para uma cidade.
 *
 * ── Por que existe o `isPublicCity` ──────────────────────────────────────
 * Com o invariante territorial no ar, cidade sem anúncio responde 404. Um
 * visitante com `altaneira-ce` guardado no cliente via TRÊS dos quatro links
 * principais levarem a 404 (medido em produção 2026-08-05):
 *
 *   Simular financiamento → /simulador-financiamento/altaneira-ce   404
 *   FIPE                  → /tabela-fipe/altaneira-ce               404
 *   Blog                  → /blog/altaneira-ce                      404
 *
 * Quando a cidade não é pública, caímos nas rotas-índice — que existem e
 * respondem 200 — em vez de montar link para uma URL que não existe.
 *
 * ── Fail-open ────────────────────────────────────────────────────────────
 * `isPublicCity: undefined` (conjunto ainda carregando, ou a chamada falhou)
 * mantém o comportamento territorial de sempre. Um cabeçalho degradado é
 * preferível a um cabeçalho vazio, e uma falha de rede não pode apagar a
 * navegação do site. Mesma política do gate no servidor.
 */
export function getTerritorialRoutesForCity(citySlug: string, opts?: TerritorialRoutesOptions) {
  const slug = (citySlug || DEFAULT_PUBLIC_CITY_SLUG).trim() || DEFAULT_PUBLIC_CITY_SLUG;
  const enc = encodeURIComponent(slug);
  const canonicalCity = getCanonicalCityPath(slug);

  // Slug inválido cai no mesmo tratamento de cidade não-pública: rotas-índice.
  // Montar `/carros-em/<lixo>` produziria link para 404 no chrome global.
  if (opts?.isPublicCity === false || !canonicalCity) {
    return {
      // `/comprar` sem `city_slug`: a vitrine nacional, sem filtro fantasma.
      comprar: "/comprar",
      comprarBelowFipe: "/comprar",
      fipe: "/tabela-fipe",
      financing: "/simulador-financiamento",
      cidade: "/comprar",
      regional: "/comprar",
      blog: "/blog",
    } as const;
  }

  return {
    // "Buscar" na cidade ativa = a CANÔNICA da cidade, direta.
    //
    // Era `/comprar?city_slug=<slug>` — presente no header e no rodapé, ou
    // seja, em TODA página do site. O link interno de maior volume do portal
    // apontava para uma URL cuja única função era redirecionar, e que o
    // Search Console reportava como "página com canônica diferente". A cidade
    // canônica ficava sem link interno direto vindo do chrome.
    comprar: canonicalCity,
    // A indexável da intenção "abaixo da FIPE" é `/carros-baratos-em/[slug]`
    // (rota limpa, canonical autorreferente). `/comprar?below_fipe=true&...`
    // não era página nenhuma — era um filtro numa URL de redirect.
    comprarBelowFipe: `/carros-baratos-em/${enc}`,
    fipe: `/tabela-fipe/${enc}`,
    financing: `/simulador-financiamento/${enc}`,
    cidade: canonicalCity,
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
 * Inventário que alimenta as colunas territoriais do rodapé.
 *
 * Shape espelha `lib/site/footer-inventory.ts` (server-only) sem importá-lo:
 * este módulo é consumido por client components, e importar um módulo
 * `server-only` quebraria o build.
 */
export type FooterInventoryInput = {
  cities: ReadonlyArray<{ slug: string; name: string; state?: string | null; total?: number }>;
  models: ReadonlyArray<{
    label: string;
    brandSlug: string;
    modelSlug: string;
    total?: number;
  }>;
  modelsCity: { slug: string; name: string; state?: string | null } | null;
};

export const EMPTY_FOOTER_INVENTORY_INPUT: FooterInventoryInput = {
  cities: [],
  models: [],
  modelsCity: null,
};

/** Teto por coluna — rodapé é chrome, não índice. */
const FOOTER_COLUMN_LIMIT = 6;

/**
 * Cidades e modelos saem do INVENTÁRIO ATIVO (auditoria 2026-07-28).
 *
 * Antes eram duas listas hardcoded: 6 cidades com ZERO anúncios (São Paulo,
 * Campinas, Santos…) e 5 modelos dos quais só o HB20 existia — os outros
 * levavam a `/comprar?q=` sem resultado. Como o rodapé é global, o site
 * inteiro não linkava Atibaia, a única cidade com estoque, e o Search Console
 * reportava "Nenhuma página de referência detectada" para ela.
 *
 * Coluna sem item é OMITIDA (ver filtro no fim de `buildFooterNavSections`) —
 * título sem link é pior que ausência.
 */
function buildCityLinks(inventory: FooterInventoryInput): SiteNavLink[] {
  return inventory.cities.slice(0, FOOTER_COLUMN_LIMIT).map((c) => ({
    id: `city-${c.slug}`,
    label: c.name,
    href: `/carros-em/${encodeURIComponent(c.slug)}`,
  }));
}

/**
 * Modelos apontam para a página de cluster REAL
 * (`/cidade/{cidade}/marca/{marca}/modelo/{modelo}`), não para `/comprar?q=`.
 *
 * Os slugs vêm prontos do backend, gerados pelas mesmas funções que o resolver
 * usa para casar a URL com o valor real de `ads.brand`/`ads.model`. Remontá-los
 * aqui reintroduziria o risco de link para página com "0 anúncios".
 */
function buildModelLinks(inventory: FooterInventoryInput): SiteNavLink[] {
  const citySlug = inventory.modelsCity?.slug;
  if (!citySlug) return [];

  return inventory.models.slice(0, FOOTER_COLUMN_LIMIT).map((m) => ({
    id: `model-${m.brandSlug}-${m.modelSlug}`,
    label: m.label,
    href: `/cidade/${encodeURIComponent(citySlug)}/marca/${encodeURIComponent(
      m.brandSlug
    )}/modelo/${encodeURIComponent(m.modelSlug)}`,
  }));
}

/**
 * Título honesto: os modelos são de UMA cidade, então o rótulo diz qual.
 * "Modelos mais buscados" era uma afirmação que o dado não sustentava.
 */
function buildModelsTitle(inventory: FooterInventoryInput): string {
  const city = inventory.modelsCity;
  return city?.name ? `Modelos disponíveis em ${city.name}` : "Modelos disponíveis";
}

export function buildFooterNavSections(
  citySlug: string,
  context: TerritorialContext = {},
  inventory: FooterInventoryInput = EMPTY_FOOTER_INVENTORY_INPUT
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

  // "Carros por cidade" — o link só segue o contexto quando a cidade da página
  // TEM estoque. Antes ele usava `context.citySlug` cru, que vem do cookie da
  // última cidade visitada: quem passasse por Altaneira-CE (zero anúncios)
  // passava a ver, em TODA página do site, um link do rodapé para
  // `/carros-em/altaneira-ce` — página vazia. Sem cidade útil no contexto,
  // aponta para a de maior estoque; sem inventário nenhum, para o catálogo.
  const contextCityHasStock = Boolean(
    context.citySlug && inventory.cities.some((c) => c.slug === context.citySlug)
  );
  const topInventoryCity = inventory.cities[0]?.slug ?? null;
  const cityLinkHref = contextCityHasStock
    ? `/carros-em/${encodeURIComponent(context.citySlug as string)}`
    : topInventoryCity
      ? `/carros-em/${encodeURIComponent(topInventoryCity)}`
      : SITE_ROUTES.comprarOpen;

  // Anotação explícita: sem ela o `.filter()` no fim descarta a tipagem
  // contextual do literal e `id: string` deixa de casar com `SiteNavSectionId`.
  const sections: SiteNavSection[] = [
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
      title: buildModelsTitle(inventory),
      links: buildModelLinks(inventory),
    },
    {
      id: "cidades",
      title: "Cidades com mais carros",
      links: buildCityLinks(inventory),
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

  // Coluna sem link é OMITIDA. As colunas de inventário ficam vazias quando o
  // backend falha ou quando não há estoque — e título sozinho é pior que
  // ausência: promete navegação que não existe e ainda ocupa uma célula do
  // grid. As colunas estáticas (Comprar, Ferramentas, Vender, Institucional)
  // nunca são afetadas porque seus links são constantes.
  return sections.filter((section) => section.links.length > 0);
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
