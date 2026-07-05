import { describe, expect, it } from "vitest";

import { buildPublicAdLocation } from "./public-ad-location";

describe("buildPublicAdLocation — bairro só para loja (trava de segurança PF)", () => {
  it("LOJA com bairro comercial → expõe bairro", () => {
    const loc = buildPublicAdLocation({
      city: "Atibaia",
      citySlug: "atibaia-sp",
      sellerType: "dealer",
      neighborhood: "Centro",
    });
    expect(loc).toEqual({ city: "Atibaia", citySlug: "atibaia-sp", bairro: "Centro" });
  });

  it("PESSOA FÍSICA → bairro SEMPRE null, mesmo com neighborhood preenchido", () => {
    const loc = buildPublicAdLocation({
      city: "Atibaia",
      citySlug: "atibaia-sp",
      sellerType: "private",
      neighborhood: "Jardim dos Pinheiros", // residência — NUNCA pode vazar
    });
    expect(loc.bairro).toBeNull();
  });

  it("tipo desconhecido/ausente → bairro null (fail-safe restritivo)", () => {
    for (const sellerType of [undefined, null, "", "pf", "PESSOA_FISICA", "DEALERSHIP"]) {
      const loc = buildPublicAdLocation({
        city: "Atibaia",
        sellerType,
        neighborhood: "Centro",
      });
      expect(loc.bairro).toBeNull();
    }
  });

  it("loja SEM bairro → null (não inventa)", () => {
    expect(
      buildPublicAdLocation({ city: "Atibaia", sellerType: "dealer", neighborhood: "  " }).bairro
    ).toBeNull();
  });

  it("'dealer' é case-insensitive", () => {
    expect(
      buildPublicAdLocation({ city: "X", sellerType: "Dealer", neighborhood: "Centro" }).bairro
    ).toBe("Centro");
  });
});
