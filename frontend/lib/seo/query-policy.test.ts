import { describe, expect, it } from "vitest";

import {
  buildCanonicalUrlWithPolicy,
  buildRobotsWithPolicy,
  classifySeoQueryParam,
  decideSeoQueryPolicy,
  DEFAULT_CATALOG_LIMIT,
  DEFAULT_CATALOG_SORT,
  normalizePageParam,
  SEO_QUERY_POLICY,
} from "@/lib/seo/query-policy";

const CIDADE = "/carros-em/atibaia-sp";

describe("classifySeoQueryParam — cobertura dos parâmetros REAIS do catálogo", () => {
  /**
   * A regressão que este bloco trava: `hasRestrictiveFilters` conhecia onze
   * parâmetros enquanto o catálogo já usava vinte. Os filtros da Fase 3 e o
   * raio ficaram de fora e cada valor deles virou uma página indexável.
   */
  it.each([
    ["sort", "sorting"],
    ["page", "pagination"],
    ["limit", "pagination"],
    ["raio", "filter"],
    ["radius", "filter"],
    ["seller_kind", "filter"],
    ["opportunity", "filter"],
    ["priority_tier", "filter"],
    ["price_min", "filter"],
    ["price_max", "filter"],
    ["min_price", "filter"],
    ["max_price", "filter"],
    ["year_min", "filter"],
    ["year_max", "filter"],
    ["mileage_max", "filter"],
    ["transmission", "filter"],
    ["fuel", "filter"],
    ["fuel_type", "filter"],
    ["body_type", "filter"],
    ["below_fipe", "filter"],
    ["highlight_only", "filter"],
    ["q", "filter"],
    ["brand", "filter"],
    ["model", "filter"],
    ["utm_source", "tracking"],
    ["utm_medium", "tracking"],
    ["utm_campaign", "tracking"],
    ["utm_content", "tracking"],
    ["utm_term", "tracking"],
    ["gclid", "tracking"],
    ["fbclid", "tracking"],
    ["city_slug", "territory"],
    ["state", "territory"],
  ])("%s → %s", (param, categoria) => {
    expect(classifySeoQueryParam(param)).toBe(categoria);
  });

  it("parâmetro desconhecido é tratado como filtro (nunca como tracking)", () => {
    // Tracking mantém `index`. Se o desconhecido caísse ali, qualquer
    // `?foo=bar` inventado por crawler viraria página indexável nova.
    expect(classifySeoQueryParam("foo")).toBe("filter");
    expect(classifySeoQueryParam("")).toBe("filter");
  });

  it("é case-insensitive no nome do parâmetro", () => {
    expect(classifySeoQueryParam("UTM_Source")).toBe("tracking");
  });

  it("a tabela é imutável em runtime", () => {
    expect(Object.isFrozen(SEO_QUERY_POLICY)).toBe(true);
  });
});

describe("normalizePageParam", () => {
  it.each([
    ["2", 2],
    ["10", 10],
    ["1", 1],
    ["0", 1],
    ["-3", 1],
    ["abc", 1],
    ["1.5", 1],
    ["", 1],
    [null, 1],
    [undefined, 1],
    [" 3 ", 3],
  ])("%s → %s", (input, esperado) => {
    expect(normalizePageParam(input as string)).toBe(esperado);
  });
});

describe("ordenação", () => {
  it(`sort=${DEFAULT_CATALOG_SORT} é normalizado por redirect para a URL limpa`, () => {
    const d = decideSeoQueryPolicy("sort=relevance");
    expect(d.normalizedQuery).toBe("");
    expect(d.shouldNormalize).toBe(true);
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("");
  });

  it.each(["price_asc", "price_desc", "newest", "recent"])(
    "sort=%s → noindex,follow + canonical limpa",
    (valor) => {
      const d = decideSeoQueryPolicy(`sort=${valor}`);
      expect(d.hasSorting).toBe(true);
      expect(d.index).toBe(false);
      expect(d.canonicalQuery).toBe("");
      expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
      // A ordenação continua funcionando: não é redirecionada para fora.
      expect(d.normalizedQuery).toBe(`sort=${valor}`);
      expect(d.shouldNormalize).toBe(false);
    }
  );
});

describe("paginação", () => {
  it("page=1 normaliza para a URL limpa", () => {
    const d = decideSeoQueryPolicy("page=1");
    expect(d.normalizedQuery).toBe("");
    expect(d.shouldNormalize).toBe(true);
  });

  it.each(["page=0", "page=-2", "page=abc", "page="])("%s é descartado", (query) => {
    const d = decideSeoQueryPolicy(query);
    expect(d.page).toBe(1);
    expect(d.normalizedQuery).toBe("");
  });

  it("page>=2 é página própria: indexável com canonical autorreferente", () => {
    const d = decideSeoQueryPolicy("page=2");
    expect(d.page).toBe(2);
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("page=2");
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(`${CIDADE}?page=2`);
    expect(d.shouldNormalize).toBe(false);
  });

  it("limit não desindexa nem entra na canonical", () => {
    const d = decideSeoQueryPolicy("limit=20");
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("");
  });
});

describe("filtros arbitrários", () => {
  it.each([
    "raio=25",
    "radius=75",
    "seller_kind=dealer",
    "opportunity=true",
    "priority_tier=4",
    "price_min=20000",
    "price_max=90000",
    "year_min=2018",
    "year_max=2024",
    "transmission=automatico",
    "fuel=flex",
    "below_fipe=true",
    "brand=Honda",
    "q=civic",
  ])("%s → noindex,follow + canonical territorial limpa", (query) => {
    const d = decideSeoQueryPolicy(query);
    expect(d.hasFilter).toBe(true);
    expect(d.index).toBe(false);
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
    // Continua funcionando para o usuário — nada é redirecionado para fora.
    expect(d.shouldNormalize).toBe(false);
    expect(buildRobotsWithPolicy(d)).toEqual({ index: false, follow: true });
  });

  it("filtro + paginação: o filtro manda, canonical volta para a limpa", () => {
    const d = decideSeoQueryPolicy("brand=Honda&page=3");
    expect(d.index).toBe(false);
    expect(d.canonicalQuery).toBe("");
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
  });
});

describe("tracking", () => {
  it.each(["utm_source=google", "utm_medium=cpc", "gclid=abc123", "fbclid=xyz"])(
    "%s: acessível, robots inalterado, canonical limpa",
    (query) => {
      const d = decideSeoQueryPolicy(query);
      expect(d.hasTracking).toBe(true);
      expect(d.hasFilter).toBe(false);
      expect(d.index).toBe(true);
      expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
    }
  );

  it("nunca é removido por redirect — apagaria a atribuição da campanha", () => {
    const d = decideSeoQueryPolicy("utm_source=google&utm_campaign=verao");
    expect(d.shouldNormalize).toBe(false);
    expect(d.normalizedQuery).toContain("utm_source=google");
  });

  it("tracking + página 2 mantém a canonical da página", () => {
    const d = decideSeoQueryPolicy("utm_source=google&page=2");
    expect(d.index).toBe(true);
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(`${CIDADE}?page=2`);
  });
});

describe("território na query de rota de catálogo", () => {
  it("desindexa: o território já está no path, isto é resquício de URL legada", () => {
    const d = decideSeoQueryPolicy("city_slug=atibaia-sp");
    expect(d.hasTerritory).toBe(true);
    expect(d.index).toBe(false);
  });
});

describe("normalização é idempotente (não pode virar loop de redirect)", () => {
  it.each([
    "sort=relevance",
    "page=1",
    "page=0",
    "sort=relevance&page=1&brand=Honda",
    "q=fiat uno&sort=relevance",
    "limit=50",
    "limit=50&page=1",
    "limit=50&page=2",
    "limit=10&page=2",
    "",
  ])("aplicar duas vezes dá o mesmo resultado: %s", (query) => {
    const primeira = decideSeoQueryPolicy(query);
    const segunda = decideSeoQueryPolicy(primeira.normalizedQuery);
    expect(segunda.normalizedQuery).toBe(primeira.normalizedQuery);
    expect(segunda.shouldNormalize).toBe(false);
  });
});

describe("formatos de entrada aceitos", () => {
  it("URLSearchParams, string e objeto de searchParams concordam", () => {
    const esperado = decideSeoQueryPolicy("brand=Honda&page=2");
    expect(decideSeoQueryPolicy(new URLSearchParams("brand=Honda&page=2"))).toEqual(esperado);
    expect(decideSeoQueryPolicy({ brand: "Honda", page: "2" })).toEqual(esperado);
  });

  it("array de valores (searchParams do Next) não quebra", () => {
    const d = decideSeoQueryPolicy({ brand: ["Honda", "Toyota"], page: undefined });
    expect(d.hasFilter).toBe(true);
    expect(d.page).toBe(1);
  });

  it("query vazia é a vitrine canônica", () => {
    const d = decideSeoQueryPolicy({});
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("");
    expect(d.shouldNormalize).toBe(false);
  });
});

describe("buildCanonicalUrlWithPolicy — não depende de cidade", () => {
  it("preserva o path recebido", () => {
    const limpa = decideSeoQueryPolicy("");
    expect(buildCanonicalUrlWithPolicy("/carros-em/atibaia-sp", limpa)).toBe(
      "/carros-em/atibaia-sp"
    );
    expect(buildCanonicalUrlWithPolicy("/carros-em/braganca-paulista-sp", limpa)).toBe(
      "/carros-em/braganca-paulista-sp"
    );
  });

  it("descarta query que já viesse no path", () => {
    const d = decideSeoQueryPolicy("page=2");
    expect(buildCanonicalUrlWithPolicy("/carros-em/atibaia-sp?sort=price_asc", d)).toBe(
      "/carros-em/atibaia-sp?page=2"
    );
  });
});

/**
 * `limit` — auditoria 2026-08-07.
 *
 * A paginação emitia `?limit=50` em todo href porque `normalizeCityFilters`
 * sempre preenche o campo com o default. Cada página do catálogo passou a ter
 * duas grafias, geradas pela própria navegação interna.
 *
 * Não existe controle de tamanho de página na UI (verificado em
 * `components/buy/`), então `limit` nunca é escolha explícita do usuário: ou é
 * o eco do default, ou é URL montada à mão.
 */
describe("limit — nunca canônico, default normalizado", () => {
  it("?limit=50 (default) normaliza para a URL limpa", () => {
    const d = decideSeoQueryPolicy(`limit=${DEFAULT_CATALOG_LIMIT}`);
    expect(d.normalizedQuery).toBe("");
    expect(d.shouldNormalize).toBe(true);
  });

  it("?limit=10 mantém a página funcionando, mas fora da canonical", () => {
    const d = decideSeoQueryPolicy("limit=10");
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("");
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
  });

  it("?limit=10&page=1 → URL limpa (as duas normalizações juntas)", () => {
    const d = decideSeoQueryPolicy("limit=10&page=1");
    expect(d.canonicalQuery).toBe("");
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(CIDADE);
  });

  /**
   * A regressão mais cara possível aqui: se `limit` desindexasse ou zerasse a
   * paginação, a página 2 canonicalizaria para a página 1 e o acervo do fim da
   * lista sumiria do índice.
   */
  it("?limit=10&page=2 → canonical ?page=2, NUNCA a página 1", () => {
    const d = decideSeoQueryPolicy("limit=10&page=2");
    expect(d.page).toBe(2);
    expect(d.index).toBe(true);
    expect(d.canonicalQuery).toBe("page=2");
    expect(buildCanonicalUrlWithPolicy(CIDADE, d)).toBe(`${CIDADE}?page=2`);
  });

  it(`?limit=${DEFAULT_CATALOG_LIMIT}&page=2 → canonical ?page=2, sem limit`, () => {
    const d = decideSeoQueryPolicy(`limit=${DEFAULT_CATALOG_LIMIT}&page=2`);
    expect(d.canonicalQuery).toBe("page=2");
    expect(d.normalizedQuery).toBe("page=2");
    expect(d.shouldNormalize).toBe(true);
  });

  it("?page=2 sem limit é o destino estável das variantes acima", () => {
    const d = decideSeoQueryPolicy("page=2");
    expect(d.canonicalQuery).toBe("page=2");
    expect(d.shouldNormalize).toBe(false);
  });

  it("limit nunca aparece na canonical, em nenhuma combinação", () => {
    for (const query of [
      "limit=10",
      "limit=50",
      "limit=10&page=2",
      "limit=50&page=3",
      "limit=10&brand=Honda",
      "limit=10&page=2&utm_source=google",
    ]) {
      const d = decideSeoQueryPolicy(query);
      expect(buildCanonicalUrlWithPolicy(CIDADE, d), query).not.toContain("limit");
    }
  });

  it("limit não desindexa — é mecânica de paginação, não recorte de conteúdo", () => {
    expect(decideSeoQueryPolicy("limit=10").index).toBe(true);
    expect(decideSeoQueryPolicy("limit=10&page=2").index).toBe(true);
  });
});
