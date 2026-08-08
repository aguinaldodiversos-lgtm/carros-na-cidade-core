import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O sitemap regional NÃO pode publicar cidade sem estoque ativo.
 *
 * ── A regressão que este arquivo trava ───────────────────────────────────────
 * A correção de 2026-07-04/05 migrou `city_home`, `city_below_fipe`,
 * `city_brand` e `city_brand_model` de `seo_cluster_plans` (tabela de
 * PLANEJAMENTO, que não sabe nada sobre estoque) para o estoque ativo real.
 *
 * `getPublicSitemapByRegion` ficou de fora. Resultado medido em 2026-08-07:
 * `/sitemaps/regiao/sp.xml` anunciava `/carros-em/braganca-paulista-sp` e
 * `/carros-baratos-em/braganca-paulista-sp` com Bragança em ZERO anúncios
 * ativos — as duas URLs respondem 404 pelo gate territorial. O sitemap
 * contradizia a própria aplicação.
 *
 * O comentário de `CITY_BELOW_FIPE` no service já citava Bragança pelo nome
 * como o caso que motivou aquela correção. O mesmo defeito seguiu vivo a um
 * `if` de distância — é essa classe de erro (corrigir uma função e esquecer a
 * irmã) que os testes abaixo existem para tornar difícil de repetir.
 */

const repoMock = vi.hoisted(() => ({
  listActiveCityRows: vi.fn(),
  listActiveCityBelowFipeRows: vi.fn(),
  listActiveCityBrandRows: vi.fn(),
  listActiveCityBrandModelRows: vi.fn(),
}));

vi.mock("../../src/read-models/seo/territorial-inventory-sitemap.repository.js", () => repoMock);

/**
 * Se alguém religar o caminho antigo, este mock devolve a linha venenosa —
 * Bragança com zero anúncios. Nenhum teste abaixo pode passar usando-o.
 */
const legacyRepoMock = vi.hoisted(() => ({
  listSitemapByType: vi.fn(async () => []),
  listSitemapByRegion: vi.fn(async () => [
    {
      path: "/carros-em/braganca-paulista-sp",
      updated_at: "2026-05-28T23:58:34.976Z",
      priority: 0.8,
      cluster_type: "city_home",
      state: "SP",
    },
  ]),
  listAllSitemapEntries: vi.fn(async () => []),
}));

vi.mock("../../src/read-models/seo/sitemap-public.repository.js", () => legacyRepoMock);
vi.mock("../../src/read-models/seo/sitemap-ads.repository.js", () => ({
  listActiveAdRows: vi.fn(async () => []),
}));

const { getPublicSitemapByRegion, getPublicSitemapByType } = await import(
  "../../src/read-models/seo/sitemap-public.service.js"
);

/** Atibaia tem estoque; Bragança não aparece porque a query só devolve ativos. */
const ATIBAIA = {
  city_slug: "atibaia-sp",
  state: "SP",
  total: 27,
  last_updated: "2026-08-07T00:00:00.000Z",
  brand: "Fiat",
  model: "ARGO DRIVE 1.0 6V Flex",
};

const CURITIBA = { ...ATIBAIA, city_slug: "curitiba-pr", state: "PR", total: 5 };

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SITEMAP_MIN_ADS;
  delete process.env.CITY_INDEX_MIN_ADS;

  repoMock.listActiveCityRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBelowFipeRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBrandRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBrandModelRows.mockResolvedValue([ATIBAIA]);
  legacyRepoMock.listSitemapByRegion.mockClear();
});

describe("regional — só cidade com estoque ativo", () => {
  it("Atibaia (com estoque) entra", async () => {
    const entries = await getPublicSitemapByRegion("SP");
    expect(entries.length).toBeGreaterThan(0);
    expect(entries.some((e) => e.loc === "/carros-em/atibaia-sp")).toBe(true);
  });

  it("Bragança (0 ativos) NÃO entra — a regressão original", async () => {
    const entries = await getPublicSitemapByRegion("SP");
    for (const entry of entries) {
      expect(entry.loc, entry.loc).not.toContain("braganca-paulista-sp");
    }
  });

  it("cidade inexistente não entra", async () => {
    const entries = await getPublicSitemapByRegion("SP");
    for (const entry of entries) {
      expect(entry.loc).not.toContain("cidade-inventada");
    }
  });

  it("catálogo vazio produz sitemap vazio, não lixo", async () => {
    repoMock.listActiveCityRows.mockResolvedValue([]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([]);

    expect(await getPublicSitemapByRegion("SP")).toEqual([]);
  });

  /**
   * A trava contra "corrigi uma e esqueci a outra": se `getPublicSitemapByRegion`
   * voltar a ler `seo_cluster_plans`, o mock legado devolve Bragança e o teste
   * acima quebra. Aqui garantimos que ele nem é chamado.
   */
  it("NÃO consulta seo_cluster_plans — a fonte que não valida estoque", async () => {
    await getPublicSitemapByRegion("SP");
    expect(legacyRepoMock.listSitemapByRegion).not.toHaveBeenCalled();
  });
});

describe("regional — filtro por UF é real", () => {
  beforeEach(() => {
    repoMock.listActiveCityRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([ATIBAIA, CURITIBA]);
  });

  it("SP traz só cidade de SP", async () => {
    const entries = await getPublicSitemapByRegion("SP");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.state).toBe("SP");
      expect(entry.loc).not.toContain("curitiba");
    }
  });

  it("PR traz só cidade do PR — nenhuma UF é privilegiada", async () => {
    const entries = await getPublicSitemapByRegion("PR");
    expect(entries.length).toBeGreaterThan(0);
    for (const entry of entries) {
      expect(entry.state).toBe("PR");
      expect(entry.loc).not.toContain("atibaia");
    }
  });

  it("aceita UF em minúsculas", async () => {
    const maiuscula = await getPublicSitemapByRegion("SP");
    const minuscula = await getPublicSitemapByRegion("sp");
    expect(minuscula.map((e) => e.loc)).toEqual(maiuscula.map((e) => e.loc));
  });

  it("UF vazia devolve vazio, sem consultar nada", async () => {
    expect(await getPublicSitemapByRegion("")).toEqual([]);
    expect(repoMock.listActiveCityRows).not.toHaveBeenCalled();
  });

  it("UF sem estoque devolve vazio", async () => {
    expect(await getPublicSitemapByRegion("CE")).toEqual([]);
  });
});

/**
 * A propriedade estrutural que impede a divergência de voltar: o regional é,
 * por construção, um SUBCONJUNTO do que os sitemaps por tipo publicam.
 * Se um dia ele publicar algo a mais, é porque alguém quebrou a composição.
 */
describe("regional ⊆ sitemaps por tipo", () => {
  it("toda URL do regional também é publicada pelo tipo correspondente", async () => {
    repoMock.listActiveCityRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([ATIBAIA, CURITIBA]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([ATIBAIA, CURITIBA]);

    const porTipo = new Set(
      (
        await Promise.all([
          getPublicSitemapByType("city_home"),
          getPublicSitemapByType("city_below_fipe"),
          getPublicSitemapByType("city_brand"),
          getPublicSitemapByType("city_brand_model"),
        ])
      )
        .flat()
        .map((e) => e.loc)
    );

    const regional = [
      ...(await getPublicSitemapByRegion("SP")),
      ...(await getPublicSitemapByRegion("PR")),
    ];

    expect(regional.length).toBeGreaterThan(0);
    for (const entry of regional) {
      expect(porTipo.has(entry.loc), `regional publica ${entry.loc}, os tipos não`).toBe(true);
    }
  });
});

/**
 * `models.xml` vazio NÃO é bug — é o limiar de qualidade fazendo o trabalho
 * dele. Medido em 2026-08-07: o modelo mais frequente do estoque tem 2
 * anúncios e o limiar é 3.
 */
describe("limiar de modelo — vazio legítimo", () => {
  it("modelo com 2 anúncios não entra (limiar 3)", async () => {
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([{ ...ATIBAIA, total: 2 }]);
    expect(await getPublicSitemapByType("city_brand_model")).toEqual([]);
  });

  it("modelo com 3 anúncios entra", async () => {
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([{ ...ATIBAIA, total: 3 }]);
    const entries = await getPublicSitemapByType("city_brand_model");
    expect(entries).toHaveLength(1);
    expect(entries[0].loc).toContain("/modelo/");
  });

  it("o mesmo limiar vale no regional", async () => {
    repoMock.listActiveCityRows.mockResolvedValue([]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([{ ...ATIBAIA, total: 2 }]);

    expect(await getPublicSitemapByRegion("SP")).toEqual([]);
  });
});

describe("lastmod vem de dado real, nunca de `new Date()`", () => {
  it("preserva o updated_at da origem", async () => {
    const entries = await getPublicSitemapByRegion("SP");
    const cidade = entries.find((e) => e.loc === "/carros-em/atibaia-sp");
    expect(cidade.lastmod).toBe(new Date(ATIBAIA.last_updated).toISOString());
  });

  it("duas leituras sem mudança de dado produzem lastmod idêntico", async () => {
    const a = await getPublicSitemapByRegion("SP");
    const b = await getPublicSitemapByRegion("SP");
    expect(b.map((e) => e.lastmod)).toEqual(a.map((e) => e.lastmod));
  });
});
