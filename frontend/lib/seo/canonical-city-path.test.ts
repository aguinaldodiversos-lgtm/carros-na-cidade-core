import { describe, expect, it } from "vitest";

import {
  buildCanonicalCityHref,
  buildCanonicalCityPathWithQuery,
  CANONICAL_CITY_PATH_PREFIX,
  extractCitySlugFromCanonicalPath,
  getCanonicalCityPath,
  isValidCanonicalCitySlug,
  normalizeCitySlug,
} from "@/lib/seo/canonical-city-path";

/**
 * Duas cidades em TODOS os casos, de propósito.
 *
 * Um teste com uma cidade só passa igual se a função devolver "atibaia-sp"
 * fixo — que é exatamente o defeito que este módulo existe para impedir. O par
 * (Atibaia, Bragança Paulista) mora na mesma UF e compartilha prefixo nenhum,
 * então um hardcode acidental quebra o teste de imediato.
 */
const CIDADE_A = "atibaia-sp";
const CIDADE_B = "braganca-paulista-sp";

describe("getCanonicalCityPath — parametrizada, nunca fixa", () => {
  it("preserva o slug recebido", () => {
    expect(getCanonicalCityPath(CIDADE_A)).toBe("/carros-em/atibaia-sp");
    expect(getCanonicalCityPath(CIDADE_B)).toBe("/carros-em/braganca-paulista-sp");
  });

  it("cobre cidades de outras UFs sem tratamento especial", () => {
    expect(getCanonicalCityPath("campinas-sp")).toBe("/carros-em/campinas-sp");
    expect(getCanonicalCityPath("curitiba-pr")).toBe("/carros-em/curitiba-pr");
    expect(getCanonicalCityPath("belo-horizonte-mg")).toBe("/carros-em/belo-horizonte-mg");
    expect(getCanonicalCityPath("altaneira-ce")).toBe("/carros-em/altaneira-ce");
  });

  it("uma cidade NUNCA aparece no path de outra", () => {
    for (const [entrada, outra] of [
      [CIDADE_A, CIDADE_B],
      [CIDADE_B, CIDADE_A],
    ]) {
      const path = getCanonicalCityPath(entrada);
      expect(path).toContain(entrada);
      expect(path).not.toContain(outra);
    }
  });

  it("usa o prefixo canônico único", () => {
    expect(getCanonicalCityPath(CIDADE_A)?.startsWith(`${CANONICAL_CITY_PATH_PREFIX}/`)).toBe(true);
  });

  it("não emite sort, city_slug nem tracking", () => {
    const path = getCanonicalCityPath(CIDADE_A) ?? "";
    expect(path).not.toContain("?");
    expect(path).not.toContain("sort=");
    expect(path).not.toContain("city_slug=");
    expect(path).not.toContain("utm_");
  });

  it("normaliza barras e caixa sem mudar de cidade", () => {
    expect(getCanonicalCityPath("/atibaia-sp/")).toBe("/carros-em/atibaia-sp");
    expect(getCanonicalCityPath("  BRAGANCA-PAULISTA-SP  ")).toBe(
      "/carros-em/braganca-paulista-sp"
    );
    expect(getCanonicalCityPath("atibaia--sp")).toBe("/carros-em/atibaia-sp");
  });

  it("rejeita slug inválido em vez de cair numa cidade padrão", () => {
    for (const invalido of [
      "",
      "   ",
      null,
      undefined,
      "atibaia", // sem UF
      "xpto-zz", // UF inexistente
      "cidade-falsa-xx",
      "sp",
      "/",
    ]) {
      expect(getCanonicalCityPath(invalido)).toBeNull();
    }
  });
});

describe("isValidCanonicalCitySlug", () => {
  it("aceita cidade brasileira real em qualquer UF", () => {
    expect(isValidCanonicalCitySlug(CIDADE_A)).toBe(true);
    expect(isValidCanonicalCitySlug(CIDADE_B)).toBe(true);
    expect(isValidCanonicalCitySlug("rio-de-janeiro-rj")).toBe(true);
  });

  it("recusa UF que não existe", () => {
    expect(isValidCanonicalCitySlug("xpto-zz")).toBe(false);
    expect(isValidCanonicalCitySlug("qualquer-coisa-aa")).toBe(false);
  });

  it("recusa slug sem sufixo de UF", () => {
    expect(isValidCanonicalCitySlug("atibaia")).toBe(false);
    expect(isValidCanonicalCitySlug("foo")).toBe(false);
  });
});

describe("normalizeCitySlug", () => {
  it("não transcreve acento nem inventa UF", () => {
    expect(normalizeCitySlug(" Atibaia-SP ")).toBe("atibaia-sp");
    expect(normalizeCitySlug("//braganca-paulista-sp//")).toBe("braganca-paulista-sp");
    expect(normalizeCitySlug(null)).toBe("");
  });
});

describe("buildCanonicalCityHref — fallback é do chamador e nunca é cidade", () => {
  it("devolve a canônica quando o slug é válido", () => {
    expect(buildCanonicalCityHref(CIDADE_B, "/comprar")).toBe("/carros-em/braganca-paulista-sp");
  });

  it("devolve o fallback declarado quando o slug é inválido", () => {
    expect(buildCanonicalCityHref("xpto-zz", "/comprar")).toBe("/comprar");
    expect(buildCanonicalCityHref(null, "/tabela-fipe")).toBe("/tabela-fipe");
  });
});

describe("buildCanonicalCityPathWithQuery", () => {
  it("anexa só o que foi pedido", () => {
    expect(buildCanonicalCityPathWithQuery(CIDADE_A, { page: 2 })).toBe(
      "/carros-em/atibaia-sp?page=2"
    );
    expect(buildCanonicalCityPathWithQuery(CIDADE_A, { page: undefined })).toBe(
      "/carros-em/atibaia-sp"
    );
  });

  it("propaga a rejeição de slug inválido", () => {
    expect(buildCanonicalCityPathWithQuery("xpto-zz", { page: 2 })).toBeNull();
  });
});

describe("extractCitySlugFromCanonicalPath", () => {
  it("reconhece path relativo e absoluto", () => {
    expect(extractCitySlugFromCanonicalPath("/carros-em/atibaia-sp")).toBe(CIDADE_A);
    expect(
      extractCitySlugFromCanonicalPath("https://carrosnacidade.com/carros-em/braganca-paulista-sp")
    ).toBe(CIDADE_B);
  });

  it("recusa alias e rotas de outra família", () => {
    expect(extractCitySlugFromCanonicalPath("/comprar/cidade/atibaia-sp")).toBeNull();
    expect(extractCitySlugFromCanonicalPath("/cidade/atibaia-sp")).toBeNull();
    expect(extractCitySlugFromCanonicalPath("/comprar?city_slug=atibaia-sp")).toBeNull();
    expect(extractCitySlugFromCanonicalPath("/carros-em/atibaia-sp/marca/fiat")).toBeNull();
  });
});
