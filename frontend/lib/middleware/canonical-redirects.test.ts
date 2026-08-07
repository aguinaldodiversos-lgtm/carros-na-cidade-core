import { describe, expect, it } from "vitest";

import {
  decideAnunciosListRedirect,
  decideComprarLegacyQueryRedirect,
  decideLegacyCityRedirect,
  decideQueryNormalizationRedirect,
  isCatalogPathname,
} from "@/lib/middleware/canonical-redirects";

/**
 * Duas cidades em todo caso territorial.
 *
 * Um teste com uma cidade só não distingue "preserva o slug" de "devolve
 * atibaia-sp fixo" — e destino territorial fixo é exatamente a regressão que
 * transformaria estes redirects em doorway pages.
 */
const CIDADE_A = "atibaia-sp";
const CIDADE_B = "braganca-paulista-sp";

describe("decideLegacyCityRedirect — /comprar/cidade/[slug] → /carros-em/[slug]", () => {
  it.each([
    [CIDADE_A, "/carros-em/atibaia-sp"],
    [CIDADE_B, "/carros-em/braganca-paulista-sp"],
    ["campinas-sp", "/carros-em/campinas-sp"],
    ["curitiba-pr", "/carros-em/curitiba-pr"],
  ])("%s → %s", (slug, esperado) => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${slug}`, "");
    expect(d).toEqual({ kind: "redirect-permanent", pathname: esperado, search: "" });
  });

  it("uma cidade nunca redireciona para a outra", () => {
    const a = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}`, "");
    const b = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_B}`, "");

    expect(a.kind === "redirect-permanent" && a.pathname).toContain(CIDADE_A);
    expect(a.kind === "redirect-permanent" && a.pathname).not.toContain(CIDADE_B);
    expect(b.kind === "redirect-permanent" && b.pathname).toContain(CIDADE_B);
    expect(b.kind === "redirect-permanent" && b.pathname).not.toContain(CIDADE_A);
  });

  it("aceita barra final", () => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}/`, "");
    expect(d.kind === "redirect-permanent" && d.pathname).toBe("/carros-em/atibaia-sp");
  });

  it("sort=relevance é descartado no destino (é a ordenação padrão)", () => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}`, "?sort=relevance");
    expect(d).toEqual({
      kind: "redirect-permanent",
      pathname: "/carros-em/atibaia-sp",
      search: "",
    });
  });

  it("page=1 é descartado no destino", () => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_B}`, "?page=1");
    expect(d.kind === "redirect-permanent" && d.search).toBe("");
  });

  it("filtro real do usuário é preservado", () => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}`, "?brand=Honda&page=2");
    expect(d.kind === "redirect-permanent" && d.pathname).toBe("/carros-em/atibaia-sp");
    expect(d.kind === "redirect-permanent" && d.search).toContain("brand=Honda");
    expect(d.kind === "redirect-permanent" && d.search).toContain("page=2");
  });

  it("o destino é FINAL — nunca /comprar nem outro alias (sem cadeia)", () => {
    const d = decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}`, "?sort=relevance");
    const target = d.kind === "redirect-permanent" ? `${d.pathname}${d.search}` : "";
    expect(target).toBe("/carros-em/atibaia-sp");
    expect(target).not.toContain("/comprar");
  });

  it("slug inválido NÃO redireciona — o 404 territorial é de outro gate", () => {
    for (const slug of ["xpto-zz", "cidade-falsa-xx", "atibaia", "foo"]) {
      expect(decideLegacyCityRedirect(`/comprar/cidade/${slug}`, "").kind).toBe("pass");
    }
  });

  it("ignora sub-rotas e outras famílias", () => {
    expect(decideLegacyCityRedirect(`/comprar/cidade/${CIDADE_A}/marca/fiat`, "").kind).toBe("pass");
    expect(decideLegacyCityRedirect("/comprar/estado/sp", "").kind).toBe("pass");
    expect(decideLegacyCityRedirect(`/carros-em/${CIDADE_A}`, "").kind).toBe("pass");
  });
});

describe("decideComprarLegacyQueryRedirect — /comprar?city_slug= e ?state=", () => {
  it.each([
    [CIDADE_A, "/carros-em/atibaia-sp"],
    [CIDADE_B, "/carros-em/braganca-paulista-sp"],
  ])("city_slug=%s → 308 %s", (slug, esperado) => {
    const d = decideComprarLegacyQueryRedirect("/comprar", `?city_slug=${slug}`);
    expect(d).toEqual({ kind: "redirect-permanent", pathname: esperado, search: "" });
  });

  it("state=UF vai para a vitrine estadual, não para uma cidade", () => {
    const d = decideComprarLegacyQueryRedirect("/comprar", "?state=mg");
    expect(d).toEqual({ kind: "redirect-permanent", pathname: "/comprar/estado/mg", search: "" });
  });

  it("o território sai da query (passa a viver no path)", () => {
    const d = decideComprarLegacyQueryRedirect(
      "/comprar",
      `?city_slug=${CIDADE_A}&state=SP&city_id=2&brand=Honda`
    );
    expect(d.kind === "redirect-permanent" && d.search).toBe("?brand=Honda");
  });

  it("city_slug tem precedência sobre state", () => {
    const d = decideComprarLegacyQueryRedirect("/comprar", `?state=mg&city_slug=${CIDADE_B}`);
    expect(d.kind === "redirect-permanent" && d.pathname).toBe("/carros-em/braganca-paulista-sp");
  });

  it("sem território → pass: a vitrine nacional renderiza", () => {
    expect(decideComprarLegacyQueryRedirect("/comprar", "").kind).toBe("pass");
    expect(decideComprarLegacyQueryRedirect("/comprar", "?brand=Honda").kind).toBe("pass");
    expect(decideComprarLegacyQueryRedirect("/comprar", "?utm_source=google").kind).toBe("pass");
  });

  it("city_slug inválido cai na vitrine nacional — nunca num estado default", () => {
    const d = decideComprarLegacyQueryRedirect("/comprar", "?city_slug=xpto-zz");
    expect(d.kind).toBe("pass");
  });

  it("não age fora de /comprar", () => {
    expect(decideComprarLegacyQueryRedirect("/carros-em/atibaia-sp", "?city_slug=x-sp").kind).toBe(
      "pass"
    );
  });
});

describe("decideAnunciosListRedirect — /anuncios → /comprar", () => {
  it("redireciona a listagem legada para o destino final", () => {
    expect(decideAnunciosListRedirect("/anuncios")).toEqual({
      kind: "redirect-permanent",
      pathname: "/comprar",
      search: "",
    });
    expect(decideAnunciosListRedirect("/anuncios/").kind).toBe("redirect-permanent");
  });

  it("não toca no detalhe de anúncio (esse alias vai para /veiculo)", () => {
    expect(decideAnunciosListRedirect("/anuncios/algum-anuncio").kind).toBe("pass");
  });
});

describe("isCatalogPathname — escopo da normalização de query", () => {
  it.each([
    "/carros-em/atibaia-sp",
    "/carros-baratos-em/atibaia-sp",
    "/carros-automaticos-em/atibaia-sp",
    "/carros-usados/sp",
    "/carros-usados/regiao/atibaia-sp",
    "/comprar/estado/sp",
    "/cidade/atibaia-sp",
    "/cidade/atibaia-sp/marca/fiat",
  ])("%s é vitrine", (path) => {
    expect(isCatalogPathname(path)).toBe(true);
  });

  it.each(["/", "/veiculo/algum-carro", "/painel/anuncios", "/api/ads", "/blog/atibaia-sp"])(
    "%s NÃO é vitrine",
    (path) => {
      expect(isCatalogPathname(path)).toBe(false);
    }
  );
});

describe("decideQueryNormalizationRedirect", () => {
  it("sort=relevance normaliza para a URL limpa", () => {
    const d = decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?sort=relevance");
    expect(d).toEqual({
      kind: "redirect-permanent",
      pathname: "/carros-em/atibaia-sp",
      search: "",
    });
  });

  it("page=1 e valores inválidos de page normalizam", () => {
    for (const query of ["?page=1", "?page=0", "?page=-2", "?page=abc"]) {
      const d = decideQueryNormalizationRedirect("/carros-em/atibaia-sp", query);
      expect(d.kind === "redirect-permanent" && d.search).toBe("");
    }
  });

  it("preserva a cidade ao normalizar", () => {
    const d = decideQueryNormalizationRedirect(
      `/carros-em/${CIDADE_B}`,
      "?sort=relevance&brand=Honda"
    );
    expect(d.kind === "redirect-permanent" && d.pathname).toBe("/carros-em/braganca-paulista-sp");
    expect(d.kind === "redirect-permanent" && d.search).toBe("?brand=Honda");
  });

  it("NÃO redireciona ordenação real nem filtro — só desindexa (outro eixo)", () => {
    expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?sort=price_asc").kind).toBe(
      "pass"
    );
    expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?raio=25").kind).toBe("pass");
    expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?page=2").kind).toBe("pass");
  });

  it("NÃO remove tracking (apagaria a atribuição da campanha)", () => {
    expect(
      decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?utm_source=google").kind
    ).toBe("pass");
  });

  it("fora das vitrines não age", () => {
    expect(decideQueryNormalizationRedirect("/painel/anuncios", "?page=1").kind).toBe("pass");
    expect(decideQueryNormalizationRedirect("/veiculo/algum-carro", "?sort=relevance").kind).toBe(
      "pass"
    );
  });

  it("query vazia não gera redirect", () => {
    expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "").kind).toBe("pass");
    expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", "?").kind).toBe("pass");
  });

  /**
   * A propriedade que impede loop infinito de 308: aplicar a normalização ao
   * resultado dela precisa devolver `pass`.
   */
  it("é idempotente — o destino do redirect nunca redireciona de novo", () => {
    for (const query of [
      "?sort=relevance",
      "?page=1",
      "?sort=relevance&page=1&brand=Honda",
      "?q=fiat uno&sort=relevance",
      "?page=0&utm_source=google",
    ]) {
      const primeira = decideQueryNormalizationRedirect("/carros-em/atibaia-sp", query);
      expect(primeira.kind).toBe("redirect-permanent");

      const search = primeira.kind === "redirect-permanent" ? primeira.search : "";
      expect(decideQueryNormalizationRedirect("/carros-em/atibaia-sp", search).kind).toBe("pass");
    }
  });
});
