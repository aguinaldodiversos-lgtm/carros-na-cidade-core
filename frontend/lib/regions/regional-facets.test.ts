import { describe, expect, it } from "vitest";
import type { AdItem } from "@/lib/search/ads-search";
import type { RegionBase, RegionMember } from "@/lib/regions/fetch-region";
import {
  aggregateBrandsFromAds,
  aggregateCityCountsFromAds,
  computeAdPriorityTier,
  pickDynamicOgImage,
  sortAdsByPriorityAndProximity,
} from "./regional-facets";

const BASE: RegionBase = { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" };
const MEMBERS: RegionMember[] = [
  {
    city_id: 2,
    slug: "braganca-paulista-sp",
    name: "Bragança Paulista",
    state: "SP",
    layer: 1,
    distance_km: 22,
  },
  {
    city_id: 3,
    slug: "jarinu-sp",
    name: "Jarinu",
    state: "SP",
    layer: 1,
    distance_km: 18,
  },
  {
    city_id: 4,
    slug: "campinas-sp",
    name: "Campinas",
    state: "SP",
    layer: 2,
    distance_km: 60,
  },
];

function makeAd(partial: Partial<AdItem>): AdItem {
  return {
    id: Math.random(),
    ...partial,
  } as AdItem;
}

describe("aggregateBrandsFromAds", () => {
  it("conta por marca e retorna top 5 ordenadas por count desc / nome asc", () => {
    const ads = [
      makeAd({ brand: "Honda" }),
      makeAd({ brand: "Honda" }),
      makeAd({ brand: "Toyota" }),
      makeAd({ brand: "Fiat" }),
      makeAd({ brand: "Fiat" }),
      makeAd({ brand: "Volkswagen" }),
      makeAd({ brand: "Chevrolet" }),
      makeAd({ brand: "Hyundai" }),
    ];
    const out = aggregateBrandsFromAds(ads);
    expect(out).toHaveLength(5);
    expect(out[0]).toEqual({ brand: "Fiat", count: 2 });
    expect(out[1]).toEqual({ brand: "Honda", count: 2 });
  });

  it("descarta marcas vazias e null", () => {
    const ads = [
      makeAd({ brand: "" }),
      makeAd({ brand: undefined }),
      makeAd({ brand: "  " }),
      makeAd({ brand: "Honda" }),
    ];
    expect(aggregateBrandsFromAds(ads)).toEqual([{ brand: "Honda", count: 1 }]);
  });

  it("retorna vazio para amostra vazia", () => {
    expect(aggregateBrandsFromAds([])).toEqual([]);
  });
});

describe("aggregateCityCountsFromAds", () => {
  it("conta cidade-base + membros com fallback 0 quando ausente da amostra", () => {
    const ads = [
      makeAd({ city: "Atibaia" }),
      makeAd({ city: "Atibaia" }),
      makeAd({ city: "Bragança Paulista" }),
    ];
    const out = aggregateCityCountsFromAds(ads, BASE, MEMBERS);
    expect(out).toHaveLength(4);
    expect(out[0]).toMatchObject({ slug: "atibaia-sp", count: 2, is_base: true });
    expect(out.find((c) => c.slug === "braganca-paulista-sp")?.count).toBe(1);
    expect(out.find((c) => c.slug === "jarinu-sp")?.count).toBe(0);
    expect(out.find((c) => c.slug === "campinas-sp")?.count).toBe(0);
  });

  it("é insensível a acento (Bragança vs Braganca)", () => {
    const ads = [makeAd({ city: "Braganca Paulista" })];
    const out = aggregateCityCountsFromAds(ads, BASE, MEMBERS);
    expect(out.find((c) => c.slug === "braganca-paulista-sp")?.count).toBe(1);
  });

  it("ignora cidade que não é base nem membro (defesa contra vazamento)", () => {
    const ads = [
      makeAd({ city: "Curitiba" }),
      makeAd({ city: "Atibaia" }),
    ];
    const out = aggregateCityCountsFromAds(ads, BASE, MEMBERS);
    expect(out.find((c) => c.slug === "atibaia-sp")?.count).toBe(1);
    expect(out.every((c) => c.slug !== "curitiba-pr")).toBe(true);
  });
});

describe("computeAdPriorityTier", () => {
  it("retorna 4 quando highlight_until é futuro", () => {
    const future = new Date(Date.now() + 86400_000).toISOString();
    expect(computeAdPriorityTier(makeAd({ highlight_until: future }))).toBe(4);
  });

  it("retorna 1 quando highlight_until é passado", () => {
    const past = new Date(Date.now() - 86400_000).toISOString();
    expect(computeAdPriorityTier(makeAd({ highlight_until: past }))).toBe(1);
  });

  it("retorna 3 para plan 'pro'", () => {
    expect(computeAdPriorityTier(makeAd({ plan: "pro" }))).toBe(3);
    expect(computeAdPriorityTier(makeAd({ plan: "Premium" }))).toBe(3);
  });

  it("retorna 2 para lojista sem plan pro", () => {
    expect(computeAdPriorityTier(makeAd({ dealership_id: 99 }))).toBe(2);
    expect(computeAdPriorityTier(makeAd({ seller_type: "dealer" }))).toBe(2);
  });

  it("retorna 1 para particular grátis", () => {
    expect(computeAdPriorityTier(makeAd({}))).toBe(1);
    expect(computeAdPriorityTier(makeAd({ seller_type: "person" }))).toBe(1);
  });
});

describe("sortAdsByPriorityAndProximity", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();

  it("ordena tier 4 (destaque) > 3 (pro) > 2 (start) > 1 (grátis)", () => {
    const ads = [
      makeAd({ id: 1, city: "Atibaia" }), // tier 1
      makeAd({ id: 2, city: "Atibaia", plan: "pro" }), // tier 3
      makeAd({ id: 3, city: "Atibaia", highlight_until: future }), // tier 4
      makeAd({ id: 4, city: "Atibaia", dealership_id: 99 }), // tier 2
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([3, 2, 4, 1]);
  });

  it("dentro do mesmo tier, prioriza menor distância (base < vizinha < longe)", () => {
    const ads = [
      makeAd({ id: 1, city: "Campinas" }), // 60 km
      makeAd({ id: 2, city: "Atibaia" }), // 0 km (base)
      makeAd({ id: 3, city: "Jarinu" }), // 18 km
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 3, 1]);
  });

  it("preserva ordem original como desempate final (sort estável)", () => {
    const ads = [
      makeAd({ id: 10, city: "Atibaia" }),
      makeAd({ id: 20, city: "Atibaia" }),
      makeAd({ id: 30, city: "Atibaia" }),
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([10, 20, 30]);
  });

  it("anúncios de cidade fora do mapa caem para o final do grupo", () => {
    const ads = [
      makeAd({ id: 1, city: "Curitiba" }),
      makeAd({ id: 2, city: "Atibaia" }),
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("aceita lista vazia", () => {
    expect(sortAdsByPriorityAndProximity([], BASE, MEMBERS)).toEqual([]);
  });
});

describe("pickDynamicOgImage", () => {
  it("retorna primeira URL https válida do primeiro anúncio", () => {
    const ads = [
      makeAd({ image_url: "https://cdn.example.com/foto1.jpg" }),
      makeAd({ image_url: "https://cdn.example.com/foto2.jpg" }),
    ];
    expect(pickDynamicOgImage(ads)).toBe("https://cdn.example.com/foto1.jpg");
  });

  it("descarta URL inválida (não-http) e tenta próximo candidato", () => {
    const ads = [
      makeAd({ image_url: "data:image/png;base64,abc", cover_image_url: "https://cdn.example.com/ok.jpg" }),
    ];
    expect(pickDynamicOgImage(ads)).toBe("https://cdn.example.com/ok.jpg");
  });

  it("retorna null quando nenhum anúncio tem URL válida", () => {
    const ads = [
      makeAd({ image_url: null }),
      makeAd({ image_url: "not-a-url" }),
      makeAd({ image_url: "" }),
    ];
    expect(pickDynamicOgImage(ads)).toBeNull();
  });

  it("retorna null para amostra vazia (caller usa OG default)", () => {
    expect(pickDynamicOgImage([])).toBeNull();
  });
});
