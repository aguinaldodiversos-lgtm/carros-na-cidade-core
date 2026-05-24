// @vitest-environment node
import { describe, expect, it } from "vitest";

import { buildPublicVehicleHref } from "./build-public-vehicle-href";

describe("buildPublicVehicleHref — briefing P2 2026-05-25", () => {
  describe("slug válido", () => {
    it.each([
      ["byd-dolphin-mini-eletrico-2026-1776912624710", "/veiculo/byd-dolphin-mini-eletrico-2026-1776912624710"],
      ["toyota-corolla-2020-campinas-sp", "/veiculo/toyota-corolla-2020-campinas-sp"],
      ["honda-civic-2020", "/veiculo/honda-civic-2020"],
    ])("slug '%s' → '%s'", (slug, expected) => {
      expect(buildPublicVehicleHref({ slug })).toBe(expected);
    });

    it("trims whitespace", () => {
      expect(buildPublicVehicleHref({ slug: "  abc-123  " })).toBe("/veiculo/abc-123");
    });
  });

  describe("fallback para id quando slug ausente", () => {
    it("id numérico → /veiculo/<id>", () => {
      expect(buildPublicVehicleHref({ id: 42 })).toBe("/veiculo/42");
    });

    it("id string numérica → /veiculo/<id>", () => {
      expect(buildPublicVehicleHref({ id: "42" })).toBe("/veiculo/42");
    });

    it("slug vazio + id válido → usa id", () => {
      expect(buildPublicVehicleHref({ slug: "", id: 99 })).toBe("/veiculo/99");
    });
  });

  describe("nada utilizável → null (caller NÃO renderiza)", () => {
    it.each([null, undefined, {}, { slug: null }, { slug: "" }, { id: null }, { id: 0 }, { id: -1 }])(
      "entrada %j → null",
      (input) => {
        expect(buildPublicVehicleHref(input as never)).toBeNull();
      }
    );

    it("slug com caracteres proibidos → null", () => {
      expect(buildPublicVehicleHref({ slug: "abc def" })).toBeNull(); // espaço
      expect(buildPublicVehicleHref({ slug: "abc/def" })).toBeNull(); // slash
      expect(buildPublicVehicleHref({ slug: "abc?x=1" })).toBeNull(); // querystring
    });

    it("slug muito longo (>200 chars) → null (defensivo)", () => {
      const long = "a-".repeat(110);
      expect(buildPublicVehicleHref({ slug: long })).toBeNull();
    });
  });
});
