import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildPublicCitySet, citySetHas, ufSetHas } from "../../src/read-models/cities/public-city-set.service.js";

/**
 * A REGRA FUNDAMENTAL do portal, travada contra regressão:
 *
 *   "Uma cidade somente pode possuir página pública quando existir pelo menos
 *    um anúncio ATIVO nessa cidade."
 *
 * O conjunto de cidades públicas não é uma lista mantida à mão — é o resultado
 * de `SELECT DISTINCT cidade FROM ads WHERE status = 'active'`. Toda rota
 * pública, todo gerador de link e o sitemap consomem essa mesma função.
 *
 * Esta suíte cobre os dois lados da regra: a CONSULTA (só status='active' entra)
 * e a DERIVAÇÃO (o que o conjunto responde sobre cidade e UF).
 */

const REPOSITORY = readFileSync(
  join(process.cwd(), "src/read-models/seo/territorial-inventory-sitemap.repository.js"),
  "utf8"
);

/** Bloco SQL de `listActiveCityRows` — a origem do conjunto público. */
function activeCityRowsQuery() {
  const start = REPOSITORY.indexOf("export async function listActiveCityRows");
  expect(start, "listActiveCityRows não encontrada").toBeGreaterThan(-1);
  const end = REPOSITORY.indexOf("export ", start + 10);
  return REPOSITORY.slice(start, end === -1 ? undefined : end);
}

describe("a fonte do conjunto público filtra por status='active'", () => {
  it("a query exige status = 'active'", () => {
    expect(activeCityRowsQuery()).toContain("a.status = 'active'");
  });

  it.each(["paused", "blocked", "pending", "pending_review", "removed", "expired", "draft"])(
    "a query não abre exceção para status '%s'",
    (status) => {
      expect(activeCityRowsQuery()).not.toContain(status);
    }
  );

  it("a contagem sai de ads, não de uma lista de municípios", () => {
    const sql = activeCityRowsQuery();
    expect(sql).toContain("FROM ads a");
    expect(sql).toContain("JOIN cities c ON c.id = a.city_id");
  });
});

/**
 * As linhas abaixo simulam o que a query devolve: ela já filtrou por
 * status='active', então um anúncio pausado/bloqueado/pending simplesmente NÃO
 * aparece — e é exatamente isso que os casos representam.
 */
describe("cidade existe ⟺ tem anúncio ativo", () => {
  const CIDADE_COM_ATIVO = "atibaia-sp";
  const CIDADE_SEM_ATIVO = "altaneira-ce";
  const OUTRA_COM_ATIVO = "braganca-paulista-sp";

  it("cidade com anúncio ativo entra no conjunto", () => {
    const set = buildPublicCitySet([{ city_slug: CIDADE_COM_ATIVO, state: "SP", total: 19 }]);
    expect(citySetHas(set, CIDADE_COM_ATIVO)).toBe(true);
    expect(set.cities[CIDADE_COM_ATIVO]).toBe(19);
  });

  it("duas cidades diferentes coexistem, cada uma com o próprio total", () => {
    const set = buildPublicCitySet([
      { city_slug: CIDADE_COM_ATIVO, state: "SP", total: 19 },
      { city_slug: OUTRA_COM_ATIVO, state: "SP", total: 4 },
    ]);

    expect(set.cities[CIDADE_COM_ATIVO]).toBe(19);
    expect(set.cities[OUTRA_COM_ATIVO]).toBe(4);
    expect(set.total).toBe(2);
  });

  it("cidade sem NENHUM anúncio ativo não entra (a query nem a devolve)", () => {
    const set = buildPublicCitySet([{ city_slug: CIDADE_COM_ATIVO, state: "SP", total: 3 }]);
    expect(citySetHas(set, CIDADE_SEM_ATIVO)).toBe(false);
    expect(set.cities[CIDADE_SEM_ATIVO]).toBeUndefined();
  });

  it("cidade que aparece com total 0 é descartada (defesa contra linha degenerada)", () => {
    const set = buildPublicCitySet([{ city_slug: CIDADE_SEM_ATIVO, state: "CE", total: 0 }]);
    expect(citySetHas(set, CIDADE_SEM_ATIVO)).toBe(false);
    expect(set.total).toBe(0);
  });

  it("perder o último anúncio ativo tira a cidade do conjunto", () => {
    const comEstoque = buildPublicCitySet([{ city_slug: CIDADE_COM_ATIVO, state: "SP", total: 1 }]);
    const semEstoque = buildPublicCitySet([]);

    expect(citySetHas(comEstoque, CIDADE_COM_ATIVO)).toBe(true);
    expect(citySetHas(semEstoque, CIDADE_COM_ATIVO)).toBe(false);
  });

  it("o conjunto não pré-cria cidades — só existe o que veio do estoque", () => {
    const set = buildPublicCitySet([{ city_slug: CIDADE_COM_ATIVO, state: "SP", total: 5 }]);
    expect(Object.keys(set.cities)).toEqual([CIDADE_COM_ATIVO]);
    expect(citySetHas(set, "sao-paulo-sp")).toBe(false);
    expect(citySetHas(set, "campinas-sp")).toBe(false);
  });
});

describe("UF existe ⟺ alguma cidade dela tem anúncio ativo", () => {
  it("a UF é derivada das MESMAS cidades, não de segunda fonte", () => {
    const set = buildPublicCitySet([
      { city_slug: "atibaia-sp", state: "SP", total: 19 },
      { city_slug: "braganca-paulista-sp", state: "SP", total: 4 },
      { city_slug: "curitiba-pr", state: "PR", total: 2 },
    ]);

    expect(ufSetHas(set, "sp")).toBe(true);
    expect(ufSetHas(set, "pr")).toBe(true);
    expect(set.ufs.sp).toBe(23);
    expect(set.ufs.pr).toBe(2);
  });

  it("UF sem nenhuma cidade com estoque não existe", () => {
    const set = buildPublicCitySet([{ city_slug: "atibaia-sp", state: "SP", total: 19 }]);
    expect(ufSetHas(set, "ce")).toBe(false);
    expect(ufSetHas(set, "rj")).toBe(false);
  });
});
