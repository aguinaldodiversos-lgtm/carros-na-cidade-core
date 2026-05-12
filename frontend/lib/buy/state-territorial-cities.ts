/**
 * Lista curada de cidades destacadas por UF para o bloco de navegação
 * territorial da Página Estadual (`/comprar/estado/[uf]`).
 *
 * Por que curada e não derivada da pagination?
 *   1. O catálogo estadual retorna uma amostra paginada — usar apenas as
 *      cidades que aparecem nessa amostra (17 cards na SP, por exemplo)
 *      esconde cidades reais com estoque ativo paginado fora.
 *   2. O backend ainda não expõe um endpoint de "cidades destacadas por
 *      UF". Quando expuser, trocar a fonte aqui sem mudar a interface
 *      pública (`getStateCuratedCities(uf)`).
 *
 * Decisões:
 *   - Allowlist explícita por UF. UFs não mapeados retornam lista vazia
 *     → bloco é suprimido (não promete cidades inexistentes).
 *   - Cada cidade tem `slug` canônico (`nome-uf` minúsculo, sem acento) +
 *     `name` para exibição. UF derivada do sufixo do slug (defesa).
 *   - Ordem deliberada: cidade-capital primeiro, depois cidades médias
 *     que aparecem em campanhas/SEO do portal, depois o resto.
 *   - Atibaia, Bragança Paulista e Jundiaí incluídos em SP porque foram
 *     identificados na auditoria territorial 2026-05-11 como cidades
 *     com estoque ativo invisíveis na nav do catálogo estadual.
 *
 * Quando o backend publicar agregação por UF, trocar para fetch SSR
 * cached(); a interface `StateCuratedCity` continua válida.
 */

export type StateCuratedCity = {
  /** Slug canônico no padrão `nome-uf` (regex `^[a-z0-9-]+-[a-z]{2}$`). */
  slug: string;
  /** Nome para exibição (com acentos). */
  name: string;
};

const CURATED_BY_UF: Readonly<Record<string, ReadonlyArray<StateCuratedCity>>> = {
  sp: [
    { slug: "sao-paulo-sp", name: "São Paulo" },
    { slug: "campinas-sp", name: "Campinas" },
    { slug: "atibaia-sp", name: "Atibaia" },
    { slug: "bragança-paulista-sp", name: "Bragança Paulista" },
    { slug: "jundiai-sp", name: "Jundiaí" },
    { slug: "ribeirao-preto-sp", name: "Ribeirão Preto" },
    { slug: "santos-sp", name: "Santos" },
    { slug: "sao-jose-dos-campos-sp", name: "São José dos Campos" },
    { slug: "sorocaba-sp", name: "Sorocaba" },
    { slug: "guarulhos-sp", name: "Guarulhos" },
    { slug: "osasco-sp", name: "Osasco" },
    { slug: "santo-andre-sp", name: "Santo André" },
  ],
  rj: [
    { slug: "rio-de-janeiro-rj", name: "Rio de Janeiro" },
    { slug: "niteroi-rj", name: "Niterói" },
    { slug: "duque-de-caxias-rj", name: "Duque de Caxias" },
    { slug: "petropolis-rj", name: "Petrópolis" },
    { slug: "campos-dos-goytacazes-rj", name: "Campos dos Goytacazes" },
  ],
  mg: [
    { slug: "belo-horizonte-mg", name: "Belo Horizonte" },
    { slug: "uberlandia-mg", name: "Uberlândia" },
    { slug: "contagem-mg", name: "Contagem" },
    { slug: "juiz-de-fora-mg", name: "Juiz de Fora" },
  ],
};

/**
 * Cap visível por padrão. Limita o bloco a uma faixa compacta no SSR
 * sem deixar a lista crescer indefinidamente quando a curadoria
 * aumentar. UI pode oferecer "Ver todas" no futuro.
 */
export const DEFAULT_CURATED_LIMIT = 12;

/**
 * Retorna as cidades curadas de um UF. UF normalizado para lowercase.
 * UFs não mapeados retornam `[]` — caller deve suprimir o bloco.
 *
 * Bug de slug histórico: `bragança-paulista-sp` carrega um cedilha
 * (`ç`) que NÃO é o slug canônico do backend
 * (`braganca-paulista-sp`). Normalizamos aqui antes de devolver — o
 * map literal mantém o nome bonito mas o slug sai limpo.
 */
export function getStateCuratedCities(
  uf: string | null | undefined,
  limit = DEFAULT_CURATED_LIMIT
): StateCuratedCity[] {
  const key = String(uf || "").trim().toLowerCase();
  if (!key) return [];
  const list = CURATED_BY_UF[key];
  if (!list) return [];
  // Defesa: normaliza qualquer slug com acento residual no map literal.
  return list.slice(0, Math.max(0, limit)).map((c) => ({
    ...c,
    slug: normalizeCitySlug(c.slug),
  }));
}

function normalizeCitySlug(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}
