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
    const ads = [makeAd({ city: "Curitiba" }), makeAd({ city: "Atibaia" })];
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
    const ads = [makeAd({ id: 1, city: "Curitiba" }), makeAd({ id: 2, city: "Atibaia" })];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("aceita lista vazia", () => {
    expect(sortAdsByPriorityAndProximity([], BASE, MEMBERS)).toEqual([]);
  });
});

/**
 * Blinda o invariante comercial absoluto do Carros na Cidade no sorter
 * client-side da Página Regional:
 *
 *   1. commercial tier (4>3>2>1) é a chave PRIMÁRIA — nada pode flipar.
 *   2. cidade-base só pode desempatar DENTRO do mesmo tier.
 *   3. Destaque/Pro/Start de cidade vizinha SEMPRE vence cidade-base de
 *      tier inferior — não permitir que cidade-base ultrapasse tier.
 *
 * O backend SQL já cobre estes casos em
 * `tests/integration/ads-ranking-base-city-boost.integration.test.js`.
 * Estes testes blindam o sorter de defesa que reordena após o fetch,
 * usando os nomes reais de cidades dos exemplos da especificação.
 */
describe("sortAdsByPriorityAndProximity — invariante comercial absoluto (regra do produto)", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();
  const MEMBERS_WITH_JUNDIAI: RegionMember[] = [
    ...MEMBERS,
    { city_id: 5, slug: "jundiai-sp", name: "Jundiaí", state: "SP", layer: 2, distance_km: 40 },
  ];

  it("Destaque de Bragança > Pro de Atibaia (tier 4 vence cidade-base no tier 3)", () => {
    const ads = [
      makeAd({ id: 1, city: "Atibaia", plan: "pro" }), // tier 3 base
      makeAd({ id: 2, city: "Bragança Paulista", highlight_until: future }), // tier 4 vizinha
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("Pro de Campinas > Start de Atibaia (tier 3 vence cidade-base no tier 2)", () => {
    const ads = [
      makeAd({ id: 1, city: "Atibaia", dealership_id: 99 }), // tier 2 base
      makeAd({ id: 2, city: "Campinas", plan: "pro" }), // tier 3 vizinha
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("Start de Jundiaí > Grátis de Atibaia (tier 2 vence cidade-base no tier 1)", () => {
    const ads = [
      makeAd({ id: 1, city: "Atibaia" }), // tier 1 base
      makeAd({ id: 2, city: "Jundiaí", dealership_id: 77 }), // tier 2 vizinha
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS_WITH_JUNDIAI);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("Destaque de Atibaia > Destaque de Bragança (mesma tier 4: cidade-base desempata)", () => {
    const ads = [
      makeAd({ id: 1, city: "Bragança Paulista", highlight_until: future }), // tier 4 vizinha
      makeAd({ id: 2, city: "Atibaia", highlight_until: future }), // tier 4 base
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("Pro de Atibaia > Pro de Campinas (mesma tier 3: cidade-base desempata)", () => {
    const ads = [
      makeAd({ id: 1, city: "Campinas", plan: "pro" }), // tier 3 vizinha 60km
      makeAd({ id: 2, city: "Atibaia", plan: "pro" }), // tier 3 base 0km
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("ordem completa: tier domina, cidade-base só atua dentro do tier", () => {
    // Cenário: 6 anúncios misturando tiers e cidades. Ordem esperada:
    //   1. Destaque vizinha (tier 4) — vence Pro/Start/Grátis de base.
    //   2. Pro base       (tier 3) — base desempata vs Pro vizinha do mesmo tier.
    //   3. Pro vizinha    (tier 3)
    //   4. Start base     (tier 2) — base desempata vs Start vizinha.
    //   5. Start vizinha  (tier 2)
    //   6. Grátis base    (tier 1) — base desempata vs Grátis vizinha.
    const ads = [
      makeAd({ id: 6, city: "Atibaia" }), // tier 1 base
      makeAd({ id: 1, city: "Bragança Paulista", highlight_until: future }), // tier 4 vizinha
      makeAd({ id: 5, city: "Jarinu", dealership_id: 50 }), // tier 2 vizinha
      makeAd({ id: 3, city: "Campinas", plan: "pro" }), // tier 3 vizinha
      makeAd({ id: 4, city: "Atibaia", dealership_id: 99 }), // tier 2 base
      makeAd({ id: 2, city: "Atibaia", plan: "pro" }), // tier 3 base
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

/**
 * Garante alinhamento frontend↔backend: o sorter prefere o tier canônico
 * calculado pelo backend (priority_tier via commercialLayerExpr) sobre a
 * heurística defensiva baseada em ads.plan/dealership_id/seller_type.
 *
 * Sem este invariante, anúncios cujo ads.plan é snapshot legado
 * (ex.: Loja Pro publicou quando era Free → ads.plan='free') seriam
 * classificados errado pelo sorter, gerando UI inconsistente com o
 * ranking real do banco.
 */
describe("computeAdPriorityTier — fonte canônica vs fallback heurístico", () => {
  it("usa priority_tier=3 do backend mesmo com ads.plan='free' (Loja Pro com snapshot legado)", () => {
    const ad = makeAd({ priority_tier: 3, plan: "free", dealership_id: 99 });
    expect(computeAdPriorityTier(ad)).toBe(3);
  });

  it("usa priority_tier=4 (Destaque) mesmo sem highlight_until ou plan na heurística", () => {
    const ad = makeAd({ priority_tier: 4, plan: null, highlight_until: null });
    expect(computeAdPriorityTier(ad)).toBe(4);
  });

  it("priority_tier=1 (Grátis) NÃO é promovido a 2 por ter dealership_id (cnpj-free-store)", () => {
    const ad = makeAd({
      priority_tier: 1,
      dealership_id: 99,
      dealership_name: "Loja Free",
      seller_type: "dealer",
    });
    expect(computeAdPriorityTier(ad)).toBe(1);
  });

  it("priority_tier=2 (Start) NÃO é promovido a 3 por ads.plan conter 'premium' (cpf-premium-highlight)", () => {
    const ad = makeAd({ priority_tier: 2, plan: "cpf-premium-highlight" });
    expect(computeAdPriorityTier(ad)).toBe(2);
  });

  it("priority_tier ausente/nulo cai para heurística (fallback defensivo)", () => {
    // Sem priority_tier, heurística atua: dealership_id detecta lojista (tier 2).
    expect(computeAdPriorityTier(makeAd({ dealership_id: 99 }))).toBe(2);
    // Sem priority_tier, plan="pro" detecta Pro (tier 3).
    expect(computeAdPriorityTier(makeAd({ plan: "pro" }))).toBe(3);
    // priority_tier=null explícito (BFF normalizou) também cai para heurística.
    expect(computeAdPriorityTier(makeAd({ priority_tier: null }))).toBe(1);
  });

  it("priority_tier inválido (0, 5, string) é ignorado — cai para heurística", () => {
    // Backend pode evoluir tier; valores fora de 1..4 são ignorados defensivamente.
    expect(computeAdPriorityTier(makeAd({ priority_tier: 0 as 1 }))).toBe(1);
    expect(computeAdPriorityTier(makeAd({ priority_tier: 5 as 4 }))).toBe(1);
    expect(computeAdPriorityTier(makeAd({ priority_tier: "3" as unknown as 3 }))).toBe(1);
  });
});

describe("sortAdsByPriorityAndProximity — prefere priority_tier canônico do backend", () => {
  const future = new Date(Date.now() + 86400_000).toISOString();

  it("Loja Pro com ads.plan='free' (snapshot legado) ranqueia como Pro via priority_tier", () => {
    // Sem priority_tier, este anúncio seria tier 2 pela heurística (tem
    // dealership_id) — abaixo de um anúncio com plan="pro". Com canônico,
    // sobe corretamente para tier 3.
    const ads = [
      makeAd({ id: 1, city: "Atibaia", plan: "pro" }), // heurística: tier 3
      makeAd({
        id: 2,
        city: "Atibaia",
        priority_tier: 3,
        plan: "free",
        dealership_id: 99,
      }),
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    // Mesmo tier 3 → cidade-base (mesma) → ordem de input preservada.
    expect(out.map((a) => a.id).sort()).toEqual([1, 2]);
    // Mais crítico: anúncio 2 NÃO cai para tier 2.
    expect(out.every((a) => computeAdPriorityTier(a) === 3)).toBe(true);
  });

  it("invariante cross-tier mantém-se com priority_tier canônico (Destaque-Bragança > Pro-Atibaia)", () => {
    const ads = [
      makeAd({ id: 1, city: "Atibaia", priority_tier: 3 }),
      makeAd({ id: 2, city: "Bragança Paulista", priority_tier: 4 }),
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
  });

  it("cidade-base só desempata DENTRO do tier canônico (priority_tier vence distância)", () => {
    // Mesmo um cnpj-free-store (priority_tier=1) na cidade-base NÃO sobe acima
    // de um anúncio Start (priority_tier=2) numa vizinha.
    const ads = [
      makeAd({ id: 1, city: "Atibaia", priority_tier: 1, dealership_id: 50 }), // base mas tier 1
      makeAd({ id: 2, city: "Campinas", priority_tier: 2 }), // vizinha 60km, tier 2
    ];
    const out = sortAdsByPriorityAndProximity(ads, BASE, MEMBERS);
    expect(out.map((a) => a.id)).toEqual([2, 1]);
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
      makeAd({
        image_url: "data:image/png;base64,abc",
        cover_image_url: "https://cdn.example.com/ok.jpg",
      }),
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
