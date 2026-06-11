import { describe, it, expect } from "vitest";
import {
  calculateAdSeoAiScore,
  scoreBand,
  countAdImages,
  buildAdImageAlt,
} from "../../src/modules/admin/ads/ad-seo-ai-score.js";

/** Anúncio "perfeito" para SEO/IA. */
function completeAd(overrides = {}) {
  return {
    id: 1,
    title: "Chevrolet Onix Hatch 1.0 Flex 2024",
    brand: "Chevrolet",
    model: "Onix Hatch",
    version: "1.0 Flex",
    year: 2024,
    price: 88900,
    city: "Atibaia",
    city_name: "Atibaia",
    state: "SP",
    mileage: 25000,
    fuel_type: "Flex",
    transmission: "Manual",
    color: "Prata",
    images: ["a.webp", "b.webp", "c.webp", "d.webp"],
    description: "x".repeat(180),
    fipe_price: 92000,
    advertiser_name: "Loja Exemplo",
    whatsapp: "11999999999",
    status: "active",
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe("ad-seo-ai-score · scoreBand", () => {
  it("classifica faixas", () => {
    expect(scoreBand(95)).toBe("pronto");
    expect(scoreBand(80)).toBe("pronto");
    expect(scoreBand(79)).toBe("aceitavel");
    expect(scoreBand(50)).toBe("aceitavel");
    expect(scoreBand(49)).toBe("fraco");
    expect(scoreBand(0)).toBe("fraco");
  });
});

describe("ad-seo-ai-score · countAdImages", () => {
  it("conta array", () => {
    expect(countAdImages({ images: ["a", "b"] })).toBe(2);
  });
  it("conta JSON string", () => {
    expect(countAdImages({ images: '["a","b","c"]' })).toBe(3);
  });
  it("image_url único", () => {
    expect(countAdImages({ image_url: "x.webp" })).toBe(1);
  });
  it("sem imagem → 0", () => {
    expect(countAdImages({})).toBe(0);
    expect(countAdImages(null)).toBe(0);
  });
});

describe("ad-seo-ai-score · buildAdImageAlt", () => {
  it('gera "[Marca] [Modelo] [Ano] usado em [Cidade] - [UF]"', () => {
    expect(
      buildAdImageAlt({
        brand: "Chevrolet",
        model: "Onix",
        year: 2024,
        city: "Atibaia",
        state: "SP",
      })
    ).toBe("Chevrolet Onix 2024 usado em Atibaia - SP");
  });
  it("sem UF não quebra", () => {
    expect(
      buildAdImageAlt({ brand: "Fiat", model: "Argo", year: "2022/2023", city: "Bragança" })
    ).toBe("Fiat Argo 2022 usado em Bragança");
  });
  it("sem cidade omite o sufixo de local", () => {
    expect(buildAdImageAlt({ brand: "VW", model: "Gol", year: 2019 })).toBe("VW Gol 2019 usado");
  });
});

describe("ad-seo-ai-score · calculateAdSeoAiScore", () => {
  it("anúncio completo → score alto (pronto) e sem pendências", () => {
    const r = calculateAdSeoAiScore(completeAd());
    expect(r.score).toBeGreaterThanOrEqual(80);
    expect(r.band).toBe("pronto");
    expect(r.missing).toEqual([]);
    expect(r.recommendations).toEqual([]);
    expect(r.suggested_image_alt).toContain("Onix");
  });

  it("sem preço e sem fotos → score cai e recomenda preço/fotos", () => {
    const r = calculateAdSeoAiScore(completeAd({ price: null, images: [] }));
    expect(r.score).toBeLessThan(80);
    expect(r.missing).toContain("Preço");
    expect(r.recommendations.join(" ")).toMatch(/preço/i);
    expect(r.missing).toContain("Fotos suficientes (3+)");
  });

  it("checklist soma de pesos = 100", () => {
    const r = calculateAdSeoAiScore(completeAd());
    const total = r.checklist.reduce((acc, c) => acc + c.weight, 0);
    expect(total).toBe(100);
  });

  it("anúncio mínimo (só título) → fraco", () => {
    const r = calculateAdSeoAiScore({ title: "Carro usado bom", status: "paused" });
    expect(r.band).toBe("fraco");
    expect(r.score).toBeLessThan(50);
  });

  it("entrada inválida não quebra", () => {
    const r = calculateAdSeoAiScore(null);
    expect(r.score).toBe(0);
    expect(r.band).toBe("fraco");
  });

  it("updated_at antigo derruba o critério de frescor", () => {
    const old = new Date(Date.now() - 200 * 24 * 60 * 60 * 1000).toISOString();
    const r = calculateAdSeoAiScore(completeAd({ updated_at: old }));
    const fresh = r.checklist.find((c) => c.key === "fresh");
    expect(fresh.ok).toBe(false);
  });
});
