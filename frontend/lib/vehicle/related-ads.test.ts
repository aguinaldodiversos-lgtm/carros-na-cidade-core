import { describe, expect, it } from "vitest";

import { keepRenderableRelated, mapAdItemToBaseAdData } from "./related-ads";
import type { AdItem } from "@/lib/search/ads-search";

describe("mapAdItemToBaseAdData — regressão de preço 2026-05-24", () => {
  it("preserva price como número (evita 'R$ 103.900' → 103.9 → 'R$ 104')", () => {
    const ad: AdItem = {
      id: 99,
      slug: "honda-civic-2020",
      title: "Honda Civic EXL 2020",
      brand: "Honda",
      model: "Civic",
      price: 103900,
      city: "Campinas",
      state: "SP",
    };

    const baseAd = mapAdItemToBaseAdData(ad);

    // O AdCard espera price numérico para formatar uma única vez.
    expect(typeof baseAd.price).toBe("number");
    expect(baseAd.price).toBe(103900);
  });

  it("preserva null/0 quando preço ausente sem formatar 'R$ 0' fake", () => {
    const ad: AdItem = {
      id: 100,
      slug: "vw-gol",
      title: "VW Gol",
    };
    const baseAd = mapAdItemToBaseAdData(ad);
    expect(baseAd.price ?? null).toBeNull();
  });

  it("propaga campos de selo (priority_tier, opportunity, below_fipe)", () => {
    const ad: AdItem = {
      id: 101,
      slug: "fiat-mobi",
      title: "Fiat Mobi",
      priority_tier: 4,
      opportunity: true,
      below_fipe: true,
    };
    const baseAd = mapAdItemToBaseAdData(ad);
    expect(baseAd.priority_tier).toBe(4);
    expect(baseAd.opportunity).toBe(true);
    expect(baseAd.below_fipe).toBe(true);
  });
});

describe("keepRenderableRelated — briefing P2-C 2026-05-25", () => {
  const validAd: AdItem = {
    id: 42,
    slug: "honda-civic-2020",
    title: "Honda Civic 2020",
    brand: "Honda",
    model: "Civic",
    price: 89900,
    city: "Campinas",
    state: "SP",
  };

  it("ad com slug+preço+id válidos → true", () => {
    expect(keepRenderableRelated(validAd)).toBe(true);
  });

  describe("dropa ads sem href válido (briefing P2-C item 4)", () => {
    it("slug vazio E id inválido → false", () => {
      expect(keepRenderableRelated({ ...validAd, slug: "", id: 0 as unknown as number })).toBe(false);
    });

    it("slug com caracteres inválidos E sem id válido → false", () => {
      // buildPublicVehicleHref rejeita slugs com espaço/slash/?
      // Quando id também é inválido, NÃO há href possível.
      expect(
        keepRenderableRelated({
          ...validAd,
          slug: "honda civic 2020",
          id: 0 as unknown as number,
        })
      ).toBe(false);
    });

    it("slug com caracteres inválidos mas id válido → true (href cai no /veiculo/<id>)", () => {
      // Comportamento intencional: ad com slug corrompido mas id real
      // ainda é roteável por id; melhor renderizar do que perder.
      expect(keepRenderableRelated({ ...validAd, slug: "honda civic 2020" })).toBe(true);
    });
  });

  describe("dropa ads sem preço real (briefing P2-C item 3)", () => {
    it("price=0 → false (não aparece como 'R$ 0')", () => {
      expect(keepRenderableRelated({ ...validAd, price: 0 })).toBe(false);
    });

    it("price=null → false", () => {
      expect(keepRenderableRelated({ ...validAd, price: undefined })).toBe(false);
    });

    it("price=-1 → false", () => {
      expect(keepRenderableRelated({ ...validAd, price: -1 })).toBe(false);
    });
  });

  describe("dropa ads com dirty data residual (briefing P2-C item 1)", () => {
    it("title='TEST Test' → false", () => {
      expect(keepRenderableRelated({ ...validAd, title: "TEST Test Vehicle" })).toBe(false);
    });

    it("model='DeployModel' → false", () => {
      expect(keepRenderableRelated({ ...validAd, model: "DeployModel" })).toBe(false);
    });

    it("slug começa com 'fake-' → false", () => {
      expect(keepRenderableRelated({ ...validAd, slug: "fake-ad-123" })).toBe(false);
    });
  });

  describe("aceita ad com slug vazio mas id positivo (href via id)", () => {
    it("slug='' + id=42 → true (href válido /veiculo/42)", () => {
      expect(keepRenderableRelated({ ...validAd, slug: "" })).toBe(true);
    });
  });
});
