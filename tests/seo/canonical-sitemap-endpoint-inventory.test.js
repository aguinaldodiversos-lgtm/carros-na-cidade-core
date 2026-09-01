import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * O endpoint CANÔNICO (`/api/public/seo/sitemap.{json,xml}`) não pode publicar
 * cidade sem estoque ativo — SEO Fase 4.1A, achado P1-1.
 *
 * ── A regressão que este arquivo trava ───────────────────────────────────────
 * `public-seo.service.js#listEntries` lia
 *
 *     seo_cluster_plans LEFT JOIN seo_publications
 *
 * sem NENHUMA validação de estoque. Medido em produção em 2026-08-31:
 *
 *     GET /api/public/seo/sitemap.xml → 200, 4 <url>, entre elas
 *        /carros-em/braganca-paulista-sp           ← 404 no site
 *        /carros-baratos-em/braganca-paulista-sp   ← 404 no site
 *
 * Bragança tem 3 anúncios, TODOS `deleted`. As linhas de `seo_publications`
 * são de um bootstrap de 2026-05-27 e continuam marcadas
 * `status='published' + is_indexable=true` porque o pipeline que as escreve
 * está desligado desde então e nada as arquivou.
 *
 * Era o último sobrevivente do caminho antigo: `getPublicSitemapByType` migrou
 * para estoque em 2026-07-04/05, `getPublicSitemapByRegion` em 2026-08-07, e o
 * canônico ficou para trás. Este arquivo existe para que ele não volte.
 *
 * ── Como o teste PROVA que a fonte mudou ─────────────────────────────────────
 * `dbMock.query` devolve a linha venenosa de Bragança. Se alguém religar a
 * consulta a `seo_cluster_plans`, Bragança aparece e os testes caem. Um teste
 * que só afirmasse "Atibaia está presente" passaria com as duas fontes.
 */

const repoMock = vi.hoisted(() => ({
  listActiveCityRows: vi.fn(),
  listActiveCityBelowFipeRows: vi.fn(),
  listActiveCityBrandRows: vi.fn(),
  listActiveCityBrandModelRows: vi.fn(),
}));

vi.mock("../../src/read-models/seo/territorial-inventory-sitemap.repository.js", () => repoMock);

/**
 * O caminho ANTIGO, armado com a linha venenosa. Qualquer leitura de
 * `seo_cluster_plans`/`seo_publications` traz Bragança de volta.
 */
const dbMock = vi.hoisted(() => ({
  query: vi.fn(async () => ({
    rows: [
      {
        loc: "/carros-em/braganca-paulista-sp",
        lastmod: "2026-05-28T23:58:34.976Z",
        cluster_type: "city_home",
        stage: "seed",
        money_page: false,
        state: "SP",
      },
      {
        loc: "/carros-baratos-em/braganca-paulista-sp",
        lastmod: "2026-05-28T23:58:34.976Z",
        cluster_type: "city_below_fipe",
        stage: "seed",
        money_page: true,
        state: "SP",
      },
    ],
  })),
  pool: { query: vi.fn(async () => ({ rows: [] })) },
}));

vi.mock("../../src/infrastructure/database/db.js", () => dbMock);

const legacyRepoMock = vi.hoisted(() => ({
  listSitemapByType: vi.fn(async () => []),
  listSitemapByRegion: vi.fn(async () => []),
  listAllSitemapEntries: vi.fn(async () => []),
}));

vi.mock("../../src/read-models/seo/sitemap-public.repository.js", () => legacyRepoMock);
vi.mock("../../src/read-models/seo/sitemap-ads.repository.js", () => ({
  listActiveAdRows: vi.fn(async () => []),
}));

const { listPublicSitemapEntries } = await import("../../src/modules/public/public-seo.service.js");

/** Atibaia tem estoque; Bragança não sai da query porque não tem anúncio ativo. */
const ATIBAIA = {
  city_slug: "atibaia-sp",
  state: "SP",
  total: 27,
  last_updated: "2026-08-08T07:13:24.411Z",
  brand: "Fiat",
  model: "ARGO DRIVE 1.0 6V Flex",
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.SITEMAP_MIN_ADS;
  delete process.env.CITY_INDEX_MIN_ADS;

  repoMock.listActiveCityRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBelowFipeRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBrandRows.mockResolvedValue([ATIBAIA]);
  repoMock.listActiveCityBrandModelRows.mockResolvedValue([ATIBAIA]);
});

describe("sitemap canônico — fonte é o estoque ativo, não a publicação congelada", () => {
  it("publica Atibaia (27 anúncios ativos)", async () => {
    const locs = (await listPublicSitemapEntries({ limit: 50 })).map((e) => e.loc);
    expect(locs).toContain("/carros-em/atibaia-sp");
  });

  it("NÃO publica Bragança, que tem zero anúncios ativos e responde 404", async () => {
    const locs = (await listPublicSitemapEntries({ limit: 50 })).map((e) => e.loc);

    expect(locs).not.toContain("/carros-em/braganca-paulista-sp");
    expect(locs).not.toContain("/carros-baratos-em/braganca-paulista-sp");
    expect(locs.some((loc) => loc.includes("braganca"))).toBe(false);
  });

  it("não consulta seo_cluster_plans/seo_publications — a fonte antiga não é tocada", async () => {
    await listPublicSitemapEntries({ limit: 50 });

    // Prova positiva: nem sequer chega a fazer a consulta. Sem isto, o teste
    // acima passaria caso alguém filtrasse Bragança POR NOME em vez de trocar
    // a fonte.
    expect(dbMock.query).not.toHaveBeenCalled();
    expect(legacyRepoMock.listAllSitemapEntries).not.toHaveBeenCalled();
  });

  it("cidade abaixo do limiar de indexação não entra", async () => {
    // 2 anúncios < limiar 3: existe (200) mas não indexa, logo não vai a sitemap.
    repoMock.listActiveCityRows.mockResolvedValue([{ ...ATIBAIA, total: 2 }]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([]);

    const locs = (await listPublicSitemapEntries({ limit: 50 })).map((e) => e.loc);
    expect(locs).toEqual([]);
  });

  it("sem estoque nenhum, devolve lista vazia — não inventa URL", async () => {
    repoMock.listActiveCityRows.mockResolvedValue([]);
    repoMock.listActiveCityBelowFipeRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandRows.mockResolvedValue([]);
    repoMock.listActiveCityBrandModelRows.mockResolvedValue([]);

    expect(await listPublicSitemapEntries({ limit: 50 })).toEqual([]);
  });

  it("preserva o contrato: loc, lastmod, changefreq e priority", async () => {
    const entries = await listPublicSitemapEntries({ limit: 50 });
    const cityHome = entries.find((e) => e.loc === "/carros-em/atibaia-sp");

    expect(cityHome).toMatchObject({
      loc: "/carros-em/atibaia-sp",
      changefreq: "daily",
      priority: 0.8,
      clusterType: "city_home",
      state: "SP",
    });
    expect(cityHome.lastmod).toBeTruthy();
  });
});
