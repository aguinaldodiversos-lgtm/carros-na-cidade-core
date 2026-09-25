// tests/search-policy/f3b-offer-counts.integration.test.js
//
// F3-B — chips de OFERTAS (Destaques, Oportunidades, Abaixo da FIPE) contados
// pelo motor, contra Postgres real.
//
// O defeito que originou isto: com o território regional da DEC-28/DEC-29, a
// sidebar continuava mostrando a contagem do BFF, que tem escopo da CIDADE. O
// grid dizia 4 resultados e o chip ao lado dizia "Abaixo da FIPE (9)". Aqui a
// pergunta é a inversa: o número do chip cobre o MESMO território do grid?
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import {
  activeOfferKeys,
  buildOfferCountQuery,
  OFFER_COUNT_KEYS,
  runSearchPolicyEngine,
} from "../../src/modules/ads/search-policy/engine.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";

describe.sequential("F3-B — offer_counts (Postgres real)", () => {
  let db;
  let ids;
  let done;
  const policy = SEARCH_POLICY_DEFAULT;

  const run = (query) =>
    runSearchPolicyEngine(query, { db, policy, cache: false, telemetry: false });

  beforeAll(async () => {
    const fixture = new Promise((resolve, reject) => {
      withF2Fixture("f3b", async (f) => {
        resolve(f);
        await new Promise((r) => (done = r));
      }).catch(reject);
    });
    const f = await fixture;
    db = f.db;
    ids = f.ids;
    resetDictionariesForTests();
    __policyCacheTesting.reset();

    // Anúncios de controle, com o valor FIPE explícito para separar as duas
    // coisas que a sidebar mostra como chips diferentes:
    //   below_fipe  → a flag
    //   opportunity → a flag E preço <= 90% da FIPE (OPPORTUNITY_DISCOUNT_RATIO)
    // A fixture padrão usa ref = preço * 1,07, que é abaixo da FIPE mas NÃO é
    // oportunidade — se os dois números saíssem iguais, o teste não veria a
    // diferença entre as duas expressões.
    let n = 0;
    const ad = async ({ citySlug, advertiserId, price, fipeRef, highlight = false }) => {
      n += 1;
      const { rows } = await db.query(
        `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                          price, year, mileage, transmission, fuel_type, body_type,
                          below_fipe, fipe_reference_value, fipe_diff_percent,
                          plan, priority, status, slug, highlight_until, created_at, updated_at, images)
         VALUES ($1,$2,$3,'SP',$4,'Hyundai','HB20 1.0 Flex 12V','HB20',
                 $5,2018,50000,'manual','flex','hatch',
                 $6,$7,$8,'free',1,'active',$9,$10,NOW(),NOW(),'[]'::jsonb)
         RETURNING id`,
        [
          advertiserId,
          ids.cities[citySlug],
          citySlug === "atibaia-sp" ? "Atibaia" : "Bragança Paulista",
          `HYUNDAI HB20 f3b ${n}`,
          price,
          fipeRef !== null,
          fipeRef,
          fipeRef !== null ? Math.round(((price - fipeRef) / fipeRef) * 100) : null,
          `f3b-hb20-${n}`,
          highlight ? new Date(Date.now() + 86400000) : null,
        ]
      );
      return Number(rows[0].id);
    };

    // Atibaia (origem): 1 oportunidade real, 1 só-abaixo-da-FIPE, 1 destaque.
    await ad({
      citySlug: "atibaia-sp",
      advertiserId: ids.advertisers.ittmotors,
      price: 50000,
      fipeRef: 70000,
    }); // 50000 <= 63000 → oportunidade
    await ad({
      citySlug: "atibaia-sp",
      advertiserId: ids.advertisers.ittmotors,
      price: 68000,
      fipeRef: 70000,
    }); // 68000 > 63000 → só abaixo da FIPE
    await ad({
      citySlug: "atibaia-sp",
      advertiserId: ids.advertisers.ittmotors,
      price: 72000,
      fipeRef: null,
      highlight: true,
    });

    // Bragança (vizinha, ~18 km): 1 oportunidade. É ESTE o anúncio que separa
    // "contagem do território" de "contagem da cidade" — ele tem de entrar no
    // número que a página de Atibaia mostra.
    await ad({
      citySlug: "braganca-paulista-sp",
      advertiserId: ids.advertisers.pfBraganca,
      price: 40000,
      fipeRef: 60000,
    });
  }, 180000);

  afterAll(async () => {
    if (done) done();
  });

  /** Contagem de controle sobre o MESMO conjunto que o grid devolveu. */
  const countIn = (items, pred) => items.filter(pred).length;

  it("1. o bloco existe, com as três chaves, e nenhuma é negativa", async () => {
    const r = await run({ city_slug: "atibaia-sp", q: "hb20", limit: "50" });
    expect(Object.keys(r.offer_counts).sort()).toEqual([...OFFER_COUNT_KEYS].sort());
    for (const k of OFFER_COUNT_KEYS) expect(r.offer_counts[k]).toBeGreaterThanOrEqual(0);
  });

  it("2. conta o TERRITÓRIO, não a cidade — a oportunidade de Bragança entra", async () => {
    const r = await run({ city_slug: "atibaia-sp", q: "hb20", limit: "50" });
    expect(r.search_policy.effective_radius_km).toBeGreaterThan(0);

    // Verdade independente: o próprio grid, que já é territorial.
    const gridOpportunity = countIn(r.data, (a) => a.opportunity === true);
    const gridBelow = countIn(r.data, (a) => a.below_fipe === true);
    expect(r.offer_counts.opportunity).toBe(gridOpportunity);
    expect(r.offer_counts.below_fipe).toBe(gridBelow);

    // E o grid de fato atravessou a fronteira da cidade.
    const cities = new Set(r.data.map((a) => a.city_name || a.city));
    expect(cities.size).toBeGreaterThan(1);
    expect(r.offer_counts.opportunity).toBeGreaterThanOrEqual(2);
  });

  it("3. oportunidade ⊂ abaixo da FIPE — as duas expressões não são a mesma", async () => {
    const r = await run({ city_slug: "atibaia-sp", q: "hb20", limit: "50" });
    expect(r.offer_counts.below_fipe).toBeGreaterThan(r.offer_counts.opportunity);
  });

  it("4. destaque é a camada comercial 4, e o filtro concorda com a contagem", async () => {
    const r = await run({ city_slug: "atibaia-sp", q: "hb20", limit: "50" });
    expect(r.offer_counts.highlight).toBe(countIn(r.data, (a) => Number(a.priority_tier) === 4));

    const filtered = await run({
      city_slug: "atibaia-sp",
      q: "hb20",
      priority_tier: "4",
      limit: "50",
    });
    expect(filtered.pagination.total).toBe(r.offer_counts.highlight);
  });

  /**
   * Oráculo independente: a contagem SEMPRE self-excluding, feita à mão. Serve
   * para conferir a resposta do motor sem depender do caminho que ele escolheu
   * (embutido na countQuery ou query própria).
   */
  const selfExcluded = async (key, filters) => {
    const { sql, params } = buildOfferCountQuery(
      {
        filters: { q: "hb20", ...filters },
        territory: { mode: "AUTO_RADIUS", originId: ids.cities["atibaia-sp"], radiusKm: 25 },
      },
      key
    );
    const { rows } = await db.query(sql, params);
    return Number(rows[0].count);
  };

  it("5. chip do sidebar ligado: a contagem bate com a self-excluding de verdade", async () => {
    // Os três estados que a sidebar realmente produz. Aqui a self-exclusion é
    // um no-op aritmético (contar X dentro de X), e o teste prova isso em vez
    // de supor: o número embutido na countQuery tem de bater com o oráculo.
    for (const [query, internal, key] of [
      [{ below_fipe: "true" }, { below_fipe: true }, "below_fipe"],
      [{ opportunity: "true" }, { opportunity: true }, "opportunity"],
      [{ priority_tier: "4" }, { priority_tier: 4 }, "highlight"],
    ]) {
      const r = await run({ city_slug: "atibaia-sp", q: "hb20", limit: "50", ...query });
      const oracle = await selfExcluded(key, internal);
      expect(r.offer_counts[key], `${key} com ${JSON.stringify(query)}`).toBe(oracle);
      expect(oracle, `${key}: o oráculo precisa ser >0 para o teste valer`).toBeGreaterThan(0);
    }
  });

  it("6. camada comercial != 4 ativa: sem self-exclusion 'Destaques' zeraria", async () => {
    // É ESTE o caso em que a DEC-13 muda a resposta. Com priority_tier=2 no
    // escopo, `commercial_layer = 4` dentro dele é 0 por construção; o chip só
    // diz a verdade se contar sem a própria restrição.
    const r = await run({ city_slug: "atibaia-sp", q: "hb20", priority_tier: "2", limit: "50" });
    const dentroDoEscopo = r.data.filter((a) => Number(a.priority_tier) === 4).length;

    expect(activeOfferKeys({ priority_tier: 2 })).toContain("highlight");
    expect(dentroDoEscopo).toBe(0);
    expect(r.offer_counts.highlight).toBe(await selfExcluded("highlight", { priority_tier: 2 }));
    expect(r.offer_counts.highlight).toBeGreaterThan(0);
  });

  it("7. o chip NÃO ativo continua no escopo filtrado", async () => {
    // Com below_fipe ativo, "Destaques" responde "quantos destaques há DENTRO
    // do que estou vendo" — a self-exclusion vale só para o próprio filtro.
    const filtered = await run({
      city_slug: "atibaia-sp",
      q: "hb20",
      below_fipe: "true",
      limit: "50",
    });
    expect(filtered.offer_counts.highlight).toBe(
      filtered.data.filter((a) => Number(a.priority_tier) === 4).length
    );
  });

  it("8. a interação normal da sidebar não gasta query extra", async () => {
    expect(activeOfferKeys({})).toEqual([]);
    expect(activeOfferKeys({ below_fipe: true })).toEqual([]);
    expect(activeOfferKeys({ opportunity: true })).toEqual([]);
    expect(activeOfferKeys({ priority_tier: 4 })).toEqual([]);
    // Só o que NEGA a condição contada precisa de query própria.
    expect(activeOfferKeys({ below_fipe: false })).toEqual(["below_fipe"]);
    expect(activeOfferKeys({ priority_tier: 2 })).toEqual(["highlight"]);
    expect(activeOfferKeys({ below_fipe: false, priority_tier: 1 })).toEqual([
      "below_fipe",
      "highlight",
    ]);
  });

  it("9. a query self-excluding leva os JOINs que suas expressões citam", async () => {
    // Mesmo guard que quebrou o countQuery em produção duas vezes: sp e u são
    // citados por commercialLayerExpr/sellerKindExpr e precisam do JOIN.
    for (const key of OFFER_COUNT_KEYS) {
      const { sql, params } = buildOfferCountQuery(
        {
          filters: { q: "hb20" },
          territory: { mode: "EXACT_CITY", originId: ids.cities["atibaia-sp"], radiusKm: 0 },
        },
        key
      );
      expect(sql, `${key}: JOIN de subscription_plans`).toContain("subscription_plans sp");
      expect(sql, `${key}: JOIN de users`).toContain("users u");
      await expect(db.query(sql, params), `${key}: SQL válido`).resolves.toBeDefined();
    }
  });
});
