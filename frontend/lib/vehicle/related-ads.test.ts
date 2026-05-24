import { describe, expect, it } from "vitest";

import { mapAdItemToBaseAdData } from "./related-ads";
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
