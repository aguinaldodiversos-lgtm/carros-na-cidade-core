// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildPublicTerritoryLabel } from "./build-public-territory-label";

describe("buildPublicTerritoryLabel — briefing P2 2026-05-25", () => {
  describe("city + state", () => {
    it("ambos presentes → 'Cidade (UF)'", () => {
      expect(buildPublicTerritoryLabel({ city: "Atibaia", state: "SP" })).toBe("Atibaia (SP)");
    });

    it("UF lowercase normaliza para UPPER", () => {
      expect(buildPublicTerritoryLabel({ city: "Curitiba", state: "pr" })).toBe("Curitiba (PR)");
    });

    it("city minúscula vira title case", () => {
      expect(buildPublicTerritoryLabel({ city: "são paulo", state: "SP" })).toBe("São Paulo (SP)");
    });
  });

  describe("city/state parciais", () => {
    it("só city → 'Cidade'", () => {
      expect(buildPublicTerritoryLabel({ city: "Atibaia" })).toBe("Atibaia");
    });

    it("só state → 'UF'", () => {
      expect(buildPublicTerritoryLabel({ state: "SP" })).toBe("SP");
    });

    it("nenhum → 'Localização não informada'", () => {
      expect(buildPublicTerritoryLabel({})).toBe("Localização não informada");
      expect(buildPublicTerritoryLabel({ city: null, state: null })).toBe(
        "Localização não informada"
      );
      expect(buildPublicTerritoryLabel(null)).toBe("Localização não informada");
    });
  });

  describe("anti double-format", () => {
    it("city já contém parênteses → preserva", () => {
      expect(buildPublicTerritoryLabel({ city: "Atibaia (SP)", state: "SP" })).toBe("Atibaia (SP)");
    });
  });

  describe("região (base + members)", () => {
    it("região com members → 'Base e região'", () => {
      expect(
        buildPublicTerritoryLabel({
          region: { base: { name: "Atibaia", state: "SP" }, memberCount: 5 },
        })
      ).toBe("Atibaia e região");
    });

    it("região sem members → só nome da base (sem 'e região')", () => {
      expect(
        buildPublicTerritoryLabel({
          region: { base: { name: "Atibaia", state: "SP" }, memberCount: 0 },
        })
      ).toBe("Atibaia");
    });

    it("região com base sem nome → 'Localização não informada'", () => {
      expect(
        buildPublicTerritoryLabel({ region: { base: { name: "", state: "SP" } } })
      ).toBe("Localização não informada");
    });
  });

  describe("NUNCA defaulta para 'São Paulo' / 'SP'", () => {
    it("entrada vazia NÃO vira 'São Paulo (SP)'", () => {
      const out = buildPublicTerritoryLabel({ city: null, state: null });
      expect(out).not.toContain("São Paulo");
      expect(out).not.toContain("SP");
    });
  });
});
