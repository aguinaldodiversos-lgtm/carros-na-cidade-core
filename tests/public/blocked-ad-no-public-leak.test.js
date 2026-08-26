/**
 * Fase 4.10A — nenhuma superfície pública devolve anúncio bloqueado.
 *
 * ESTRATÉGIA
 *   Cada superfície pública é EXERCITADA de verdade (a função real é chamada)
 *   contra um banco falso que captura o SQL emitido. Depois, todo SELECT que
 *   leia `ads` é obrigado a restringir a `status = 'active'`.
 *
 *   Isso é diferente de conferir literais nos arquivos: aqui a asserção é
 *   sobre a consulta que a superfície REALMENTE monta em tempo de execução,
 *   incluindo os pedaços que vêm de builders compartilhados. Uma superfície
 *   que deixasse o filtro de fora não teria como passar.
 *
 *   `blocked` não é um caso especial: a allowlist é `status = 'active'`, então
 *   provar que ela está em toda leitura pública cobre blocked, deleted,
 *   archived, paused, pending_review e qualquer estado futuro de uma vez.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

const captured = [];

/**
 * Lookups auxiliares (existe esta loja? esta cidade? esta âncora?) devolvem
 * uma linha sintética, senão a superfície retorna cedo e nunca chega a
 * consultar anúncios — e o teste passaria sem ter exercitado nada. As
 * consultas à própria tabela `ads` devolvem vazio: o que interessa nelas é o
 * SQL emitido, não o resultado.
 */
const LOOKUP_ROW = {
  id: 77,
  city_id: 1,
  advertiser_id: 77,
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
  uf: "SP",
  latitude: -23.11,
  longitude: -46.55,
  lat: -23.11,
  lng: -46.55,
  distance_km: 10,
  total: 1,
  count: 1,
};

function fakeQuery(sql, params = []) {
  const text = String(sql);
  captured.push(text);
  void params;
  if (readsAdsTable(text)) {
    return Promise.resolve({ rows: [], rowCount: 0 });
  }
  return Promise.resolve({ rows: [{ ...LOOKUP_ROW }], rowCount: 1 });
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (cb) => cb({ query: (sql, params) => fakeQuery(sql, params) }),
  getClient: async () => ({ query: fakeQuery, release: () => {} }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

// Cache desligado: o objetivo é ver o SQL, não uma resposta memoizada.
vi.mock("../../src/shared/cache/cache.middleware.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, cacheInvalidatePrefix: async () => {} };
});

const autocomplete = await import(
  "../../src/modules/ads/autocomplete/ads-autocomplete.repository.js"
);
const facets = await import("../../src/modules/ads/filters/ads-filter.facets.js");
const cityPublic = await import("../../src/read-models/cities/city-public.repository.js");
const sitemapAds = await import("../../src/read-models/seo/sitemap-ads.repository.js");
const territorialSitemap = await import(
  "../../src/read-models/seo/territorial-inventory-sitemap.repository.js"
);
const { buildAdsSearchQuery } = await import("../../src/modules/ads/filters/ads-filter.builder.js");

function normalize(sql) {
  return String(sql).replace(/\s+/g, " ").trim();
}

/**
 * O SQL toca a tabela `ads`?
 *
 * Cobre `FROM ads`, `JOIN ads` e o alias `ads a` — sem isso um SELECT que
 * lesse a tabela por JOIN escaparia da varredura.
 */
function readsAdsTable(sql) {
  return /\b(from|join)\s+(public\.)?ads\b/i.test(normalize(sql));
}

/**
 * A consulta restringe a `active`?
 *
 * Aceita literal (`a.status = 'active'`), lista (`status IN ('active')`) e
 * parâmetro posicional — este último só quando o SQL também menciona a coluna
 * status, para não dar passe livre a uma query que nem filtra.
 */
function restrictsToActive(sql) {
  const s = normalize(sql);
  if (/status\s*(=|in)\s*\(?\s*'active'/i.test(s)) return true;
  if (/status\s*=\s*\$\d+/i.test(s)) return true;
  if (/status\s*=\s*any/i.test(s)) return true;
  return false;
}

function assertNoLeak(surfaceName) {
  const adsQueries = captured.filter(readsAdsTable);

  // Sem esta asserção o teste passaria vazio: uma superfície que não emitisse
  // consulta nenhuma (import quebrado, retorno cedo, assinatura mudada) teria
  // zero infratores e seria lida como "não vaza". Provar que a superfície foi
  // ALCANÇADA é parte de provar que ela está protegida.
  expect(
    adsQueries.length,
    `${surfaceName}: nenhuma consulta à tabela ads foi capturada — a superfície ` +
      `não chegou a ser exercitada, então este teste não provaria nada.`
  ).toBeGreaterThan(0);

  const offenders = adsQueries.filter((sql) => !restrictsToActive(sql)).map(normalize);

  expect(
    offenders,
    `${surfaceName}: consulta lê a tabela ads sem restringir a status='active' — ` +
      `anúncio bloqueado vazaria aqui.\n\n${offenders.join("\n\n---\n\n")}`
  ).toEqual([]);
}

beforeEach(() => {
  captured.length = 0;
});

describe("catálogo /comprar e busca livre", () => {
  it("a query de listagem restringe a active", () => {
    const { dataQuery, countQuery } = buildAdsSearchQuery({});
    captured.push(dataQuery, countQuery);
    assertNoLeak("busca pública");
  });

  it("a paginação e a contagem usam o mesmo guard (bloqueado não desloca total)", () => {
    const { dataQuery, countQuery } = buildAdsSearchQuery({ city_slug: "atibaia-sp", page: 2 });
    expect(restrictsToActive(dataQuery)).toBe(true);
    expect(restrictsToActive(countQuery)).toBe(true);
  });

  it("filtros de veículo preservam o guard", () => {
    const { dataQuery, countQuery } = buildAdsSearchQuery({
      brand: "Honda",
      model: "Civic",
      below_fipe: true,
      seller_kind: "dealer",
    });
    captured.push(dataQuery, countQuery);
    assertNoLeak("busca com filtros");
  });
});

describe("facetas", () => {
  it("nenhuma faceta conta anúncio fora de active", async () => {
    await facets.getAdsFacets({ city_slug: "atibaia-sp" });
    expect(captured.some(readsAdsTable)).toBe(true);
    assertNoLeak("facetas");
  });
});

describe("autocomplete", () => {
  it("o dicionário de marcas não enxerga anúncio bloqueado", async () => {
    await autocomplete.loadBrandDictionary(10);
    assertNoLeak("autocomplete/marcas");
  });

  it("o dicionário de modelos não enxerga anúncio bloqueado", async () => {
    await autocomplete.loadModelDictionary(10);
    assertNoLeak("autocomplete/modelos");
  });

  it("o dicionário de cidades não toca a tabela de anúncios", async () => {
    await autocomplete.loadCityDictionary(10);

    // Este é o catálogo de municípios (semente IBGE), não estoque: ele não
    // consulta `ads`, então não tem por onde vazar um anúncio bloqueado.
    // A asserção é a AUSÊNCIA de leitura — se um dia essa consulta passar a
    // derivar cidades do estoque, o teste falha e obriga a decidir o guard.
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.filter(readsAdsTable)).toEqual([]);
  });

  it("a presença cidade+marca não enxerga anúncio bloqueado", async () => {
    await autocomplete.loadCityBrandPresence(10);
    assertNoLeak("autocomplete/cidade+marca");
  });
});

describe("página de cidade", () => {
  it("o snapshot da cidade não conta anúncio bloqueado", async () => {
    await cityPublic.getCityPublicSnapshot("atibaia-sp");
    expect(captured.some(readsAdsTable)).toBe(true);
    assertNoLeak("cidade/snapshot");
  });

  it("destaques da cidade", async () => {
    await cityPublic.listCityHighlightAds("atibaia-sp", 12);
    assertNoLeak("cidade/destaques");
  });

  it("oportunidades da cidade", async () => {
    await cityPublic.listCityOpportunityAds("atibaia-sp", 12);
    assertNoLeak("cidade/oportunidades");
  });

  it("recentes da cidade", async () => {
    await cityPublic.listRecentCityAds("atibaia-sp", 12);
    assertNoLeak("cidade/recentes");
  });

  it("facetas de marca da cidade", async () => {
    await cityPublic.listCityBrandFacets("atibaia-sp", 20);
    assertNoLeak("cidade/facetas de marca");
  });

  it("facetas de modelo da cidade", async () => {
    await cityPublic.listCityModelFacets("atibaia-sp", 20);
    assertNoLeak("cidade/facetas de modelo");
  });
});

describe("página da loja e diretório de lojas", () => {
  it("o catálogo da loja não exibe anúncio bloqueado", async () => {
    const dealers = await import("../../src/modules/dealers/dealers.repository.js");
    await dealers.listDealerAds("77", 24);
    assertNoLeak("loja/catálogo");
  });

  it("o diretório de lojas não conta anúncio bloqueado no estoque ativo", async () => {
    const dealers = await import("../../src/modules/dealers/dealers.repository.js");
    await dealers.listTopDealersByCitySlug("atibaia-sp", 20);
    assertNoLeak("diretório de lojas");
  });

  it("a loja pública não expõe anúncio bloqueado", async () => {
    const publicDealer = await import("../../src/modules/public/public-dealer.service.js");
    await publicDealer.getPublicDealerBySlug("loja-teste").catch(() => {});
    assertNoLeak("loja pública");
  });
});

describe("região", () => {
  it("a vizinhança por raio é geográfica — não lê a tabela de anúncios", async () => {
    const radius = await import("../../src/read-models/cities/regional-radius.repository.js");
    await radius.getRadiusMembers("atibaia-sp", 50);

    // A vizinhança sai de `region_memberships` (cidade↔cidade), não de estoque.
    // Nada a vazar aqui — quem decide o que aparece é a contagem de ativos.
    expect(captured.length).toBeGreaterThan(0);
    expect(captured.filter(readsAdsTable)).toEqual([]);
  });

  it("o estoque próprio da cidade-âncora não conta anúncio bloqueado", async () => {
    const radius = await import("../../src/read-models/cities/regional-radius.repository.js");
    await radius.getOwnActiveCount("atibaia-sp");
    assertNoLeak("região/estoque da âncora");
  });

  it("os agregados de marca do cluster não contam anúncio bloqueado", async () => {
    const cluster = await import("../../src/read-models/cities/territorial-cluster.repository.js");
    await cluster.getActiveBrandAggregates(1);
    assertNoLeak("cluster/marcas");
  });

  it("os agregados de modelo do cluster não contam anúncio bloqueado", async () => {
    const cluster = await import("../../src/read-models/cities/territorial-cluster.repository.js");
    await cluster.getActiveModelAggregates(1, ["Honda"]);
    assertNoLeak("cluster/modelos");
  });
});

describe("sitemap", () => {
  it("o sitemap de veículos não lista anúncio bloqueado", async () => {
    await sitemapAds.listActiveAdRows(100);
    expect(captured.some(readsAdsTable)).toBe(true);
    assertNoLeak("sitemap/veículos");
  });

  it("o conjunto de cidades públicas ignora anúncio bloqueado", async () => {
    await territorialSitemap.listActiveCityRows(100);
    assertNoLeak("sitemap/cidades");
  });

  it("o sitemap de cidade+marca ignora anúncio bloqueado", async () => {
    await territorialSitemap.listActiveCityBrandRows(100);
    assertNoLeak("sitemap/cidade+marca");
  });

  it("o sitemap de cidade+marca+modelo ignora anúncio bloqueado", async () => {
    await territorialSitemap.listActiveCityBrandModelRows(100);
    assertNoLeak("sitemap/cidade+marca+modelo");
  });

  it("o sitemap de abaixo-da-FIPE ignora anúncio bloqueado", async () => {
    await territorialSitemap.listActiveCityBelowFipeRows(100);
    assertNoLeak("sitemap/abaixo-fipe");
  });
});

describe("detalhe público do anúncio", () => {
  it("a busca por slug/id exige status active", async () => {
    const repo = await import("../../src/modules/ads/ads.repository.js");
    await repo.findAdByIdentifier("honda-civic-2020-atibaia");

    const detailQuery = captured.find(readsAdsTable);
    expect(detailQuery).toBeTruthy();
    expect(restrictsToActive(detailQuery)).toBe(true);
  });

  it("conhecer o slug não contorna o filtro — a mesma query serve id numérico", async () => {
    const repo = await import("../../src/modules/ads/ads.repository.js");
    captured.length = 0;
    await repo.findAdByIdentifier("12345");
    assertNoLeak("detalhe por id");
  });
});

describe("meta-teste da varredura", () => {
  it("o detector reprova uma consulta sem guard de status", () => {
    expect(readsAdsTable("SELECT a.id FROM ads a WHERE a.city_id = 1")).toBe(true);
    expect(restrictsToActive("SELECT a.id FROM ads a WHERE a.city_id = 1")).toBe(false);
  });

  it("o detector reconhece as três formas de guard", () => {
    expect(restrictsToActive("SELECT 1 FROM ads a WHERE a.status = 'active'")).toBe(true);
    expect(restrictsToActive("SELECT 1 FROM ads a WHERE a.status IN ('active')")).toBe(true);
    expect(restrictsToActive("SELECT 1 FROM ads a WHERE a.status = $2")).toBe(true);
  });

  it("o detector enxerga a tabela também via JOIN", () => {
    expect(readsAdsTable("SELECT 1 FROM cities c JOIN ads a ON a.city_id = c.id")).toBe(true);
  });
});
