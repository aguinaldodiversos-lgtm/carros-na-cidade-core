import { describe, expect, it } from "vitest";

import {
  ancoraHrefFromParts,
  slugFromAncoraParts,
  slugToAncoraHref,
  slugToRegionHref,
} from "./ancora-url";

/**
 * Contrato de URL da Página Regional — anti-regressão.
 *
 * Histórico:
 *   - Fase 4 (2026-05-17): URL canônica tentou virar `/sp/regiao/atibaia`.
 *   - Fase 5 (2026-05-18): revertido para `/carros-usados/regiao/atibaia-sp`
 *     (slug completo nome-uf, alinhado com /carros-em/[slug]).
 *
 * Estes testes existem para garantir que ninguém reverta acidentalmente
 * e volte a emitir a URL legada como link interno. Qualquer mudança no
 * helper que faça `slugToRegionHref` emitir formato `/uf/regiao/ancora`
 * é REGRESSÃO crítica e quebra estes testes.
 */
describe("slugToRegionHref — contrato canônico /carros-usados/regiao/{slug}", () => {
  it("emite URL canônica com slug completo nome-uf", () => {
    expect(slugToRegionHref("atibaia-sp")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(slugToRegionHref("campinas-sp")).toBe("/carros-usados/regiao/campinas-sp");
    expect(slugToRegionHref("belo-horizonte-mg")).toBe("/carros-usados/regiao/belo-horizonte-mg");
  });

  it("NUNCA emite o formato legado /uf/regiao/ancora", () => {
    const samples = [
      "atibaia-sp",
      "campinas-sp",
      "sao-jose-dos-campos-sp",
      "belo-horizonte-mg",
      "salvador-ba",
      "rio-de-janeiro-rj",
      "manaus-am",
      "brasilia-df",
      "porto-alegre-rs",
      "florianopolis-sc",
    ];
    for (const slug of samples) {
      const href = slugToRegionHref(slug);
      expect(href, `slug ${slug}`).toMatch(/^\/carros-usados\/regiao\//);
      expect(href, `slug ${slug}`).not.toMatch(/^\/[a-z]{2}\/regiao\//);
    }
  });

  it("escala para qualquer cidade brasileira sem hardcode", () => {
    // Slugs aleatórios brasileiros que NÃO estão em lista curada — provam
    // que o helper não tem allowlist embutida.
    const samples = [
      "sumare-sp",
      "ipatinga-mg",
      "barreiras-ba",
      "feijo-ac",
      "tobias-barreto-se",
      "paraiso-do-tocantins-to",
      "tangara-da-serra-mt",
    ];
    for (const slug of samples) {
      expect(slugToRegionHref(slug)).toBe(`/carros-usados/regiao/${slug}`);
    }
  });

  it("normaliza entrada (trim + lowercase)", () => {
    expect(slugToRegionHref("  ATIBAIA-SP  ")).toBe("/carros-usados/regiao/atibaia-sp");
  });

  it("entrada vazia/null/undefined → '/' (não /carros-usados/regiao/)", () => {
    expect(slugToRegionHref("")).toBe("/");
    // @ts-expect-error testando coerção defensiva
    expect(slugToRegionHref(null)).toBe("/");
    // @ts-expect-error testando coerção defensiva
    expect(slugToRegionHref(undefined)).toBe("/");
  });
});

describe("slugToAncoraHref — alias deprecated mantido para backward compat", () => {
  it("é o mesmo que slugToRegionHref (alias)", () => {
    const slug = "atibaia-sp";
    expect(slugToAncoraHref(slug)).toBe(slugToRegionHref(slug));
  });
});

describe("ancoraHrefFromParts — reconstrói canônica a partir de (uf, ancora)", () => {
  it("monta canônica a partir das partes do path legado", () => {
    expect(ancoraHrefFromParts("sp", "atibaia")).toBe("/carros-usados/regiao/atibaia-sp");
    expect(ancoraHrefFromParts("MG", "Belo-Horizonte")).toBe(
      "/carros-usados/regiao/belo-horizonte-mg"
    );
  });

  it("parts vazias → '/'", () => {
    expect(ancoraHrefFromParts("", "atibaia")).toBe("/");
    expect(ancoraHrefFromParts("sp", "")).toBe("/");
  });
});

describe("slugFromAncoraParts — usado pelo middleware no redirect 301", () => {
  it("reconstrói slug canônico nome-uf", () => {
    expect(slugFromAncoraParts("sp", "atibaia")).toBe("atibaia-sp");
    expect(slugFromAncoraParts("MG", "Belo-Horizonte")).toBe("belo-horizonte-mg");
  });

  it("parts vazias → ''", () => {
    expect(slugFromAncoraParts("", "")).toBe("");
    expect(slugFromAncoraParts("sp", "")).toBe("");
  });
});
