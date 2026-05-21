// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  decideTerritoryGate,
  extractSlugUf,
  isValidBrUf,
} from "./territory-gate";

describe("isValidBrUf — UFs brasileiras canônicas", () => {
  it.each(["SP", "MG", "RJ", "PR", "PE", "BA", "RS", "SC", "GO", "DF"])(
    "%s é UF válida",
    (uf) => {
      expect(isValidBrUf(uf)).toBe(true);
    }
  );

  it("aceita lowercase ('sp')", () => {
    expect(isValidBrUf("sp")).toBe(true);
  });

  it.each(["ZZ", "XX", "BR", "spp", "1a", "", "  ", "abc", "sao-paulo"])(
    "rejeita inválida '%s'",
    (uf) => {
      expect(isValidBrUf(uf)).toBe(false);
    }
  );
});

describe("extractSlugUf — UF embutida no slug", () => {
  it.each([
    ["atibaia-sp", "sp"],
    ["belo-horizonte-mg", "mg"],
    ["curitiba-pr", "pr"],
    ["santo-andre-sp", "sp"],
    ["mogi-das-cruzes-sp", "sp"],
  ])("slug '%s' → uf '%s'", (slug, expected) => {
    expect(extractSlugUf(slug)).toBe(expected);
  });

  it("slug sem hífen retorna null", () => {
    expect(extractSlugUf("atibaia")).toBe(null);
    expect(extractSlugUf("")).toBe(null);
  });
});

describe("decideTerritoryGate — bug Next 14.2 (briefing auditoria 2026-05-21)", () => {
  describe("Rota estadual /carros-usados/[uf]", () => {
    it.each(["/carros-usados/sp", "/carros-usados/mg", "/carros-usados/pr"])(
      "%s (UF válida) → pass",
      (pathname) => {
        expect(decideTerritoryGate(pathname).kind).toBe("pass");
      }
    );

    it.each([
      "/carros-usados/zz",
      "/carros-usados/abc",
      "/carros-usados/sao-paulo",
      "/carros-usados/spp",
    ])("%s (UF inválida) → block-state-uf-invalid (404 real)", (pathname) => {
      const decision = decideTerritoryGate(pathname);
      expect(decision.kind).toBe("block-state-uf-invalid");
    });
  });

  describe("Rota cidade /carros-em/[slug]", () => {
    it.each([
      "/carros-em/atibaia-sp",
      "/carros-em/belo-horizonte-mg",
      "/carros-em/recife-pe",
      "/carros-em/curitiba-pr",
    ])("%s (slug válido) → pass", (pathname) => {
      expect(decideTerritoryGate(pathname).kind).toBe("pass");
    });

    it.each([
      "/carros-em/cidade-falsa-xx",
      "/carros-em/zz",
      "/carros-em/atibaia",
      "/carros-em/atibaia-spp",
      "/carros-em/cidade-com-uf-1a",
    ])("%s (slug inválido) → block-city-slug-invalid (404 real)", (pathname) => {
      const decision = decideTerritoryGate(pathname);
      expect(decision.kind).toBe("block-city-slug-invalid");
    });
  });

  describe("Rota legada /comprar/estado/[uf]", () => {
    it.each(["/comprar/estado/sp", "/comprar/estado/mg", "/comprar/estado/rj"])(
      "%s (UF válida) → pass",
      (pathname) => {
        expect(decideTerritoryGate(pathname).kind).toBe("pass");
      }
    );

    it.each(["/comprar/estado/zz", "/comprar/estado/abc"])(
      "%s (UF inválida) → block-legacy-state-uf-invalid (404 real)",
      (pathname) => {
        const decision = decideTerritoryGate(pathname);
        expect(decision.kind).toBe("block-legacy-state-uf-invalid");
      }
    );
  });

  describe("Precedência: rotas que NÃO devem ser capturadas", () => {
    it.each([
      "/carros-usados/regiao/atibaia-sp",
      "/carros-usados/regiao/curitiba-pr",
      "/carros-usados",
      "/carros-usados/sp/algo",
      "/carros-em",
      "/carros-em/atibaia-sp/algo",
      "/",
      "/sobre",
    ])("%s → pass (não é gate de UF/slug)", (pathname) => {
      expect(decideTerritoryGate(pathname).kind).toBe("pass");
    });
  });
});
