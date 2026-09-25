// tests/search-policy/f2-2-dec28-dec29-territory.integration.test.js
//
// DEC-28 (baseline é piso) e DEC-29 (piso regional recíproco + teto por cidade)
// contra Postgres real, pelo motor inteiro — não só pelo resolvedor.
//
// O caso que originou as duas decisões, medido em produção: a origem com 33
// anúncios próprios ficava em 0 km e NÃO via o 4º carro do modelo procurado a
// 18,34 km, enquanto a vizinha com 1 anúncio via os 4. Aqui isso é fixture.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { withF2Fixture } from "./helpers/f2-fixture.js";
import { runSearchPolicyEngine } from "../../src/modules/ads/search-policy/engine.js";
import { resetDictionariesForTests } from "../../src/modules/ads/search-policy/dictionaries.js";
import { __policyCacheTesting } from "../../src/modules/ads/search-policy/policy-cache.js";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import { REASON } from "../../src/modules/ads/search-policy/scope-resolver.js";

describe.sequential("F2.2 — DEC-28/DEC-29: território (Postgres real)", () => {
  let db;
  let ids;
  let done;
  let atibaiaBragancaKm;
  const policy = SEARCH_POLICY_DEFAULT;

  const run = (query) =>
    runSearchPolicyEngine(query, { db, policy, cache: false, telemetry: false });
  const cityOf = (item) => item.city_name || item.city || null;

  beforeAll(async () => {
    const fixture = new Promise((resolve, reject) => {
      withF2Fixture("dec28", async (f) => {
        resolve(f);
        await new Promise((r) => (done = r));
      }).catch(reject);
    });
    const f = await fixture;
    db = f.db;
    ids = f.ids;
    resetDictionariesForTests();
    __policyCacheTesting.reset();

    const { rows } = await db.query(
      `SELECT rm.distance_km::float AS km
         FROM region_memberships rm
         JOIN cities a ON a.id = rm.base_city_id
         JOIN cities b ON b.id = rm.member_city_id
        WHERE a.slug = 'atibaia-sp' AND b.slug = 'braganca-paulista-sp'`
    );
    atibaiaBragancaKm = rows[0].km;
    // A fixture precisa ter as duas cidades dentro do piso de 25 km para este
    // arquivo medir o que se propõe a medir.
    expect(atibaiaBragancaKm).toBeGreaterThan(0);
    expect(atibaiaBragancaKm).toBeLessThan(25);

    let n = 0;
    const ad = async (model, advertiserId, citySlug, cityName, price = 60000) => {
      n += 1;
      const { rows: r } = await db.query(
        `INSERT INTO ads (advertiser_id, city_id, city, state, title, brand, model, commercial_model,
                          price, year, mileage, transmission, fuel_type, body_type,
                          plan, priority, status, slug, created_at, updated_at, images)
         VALUES ($1,$2,$3,'SP',$4,'Hyundai',$5,$6,$7,2022,40000,'manual','flex','hatch',
                 'free',1,'active',$8,$9,$9,'[]'::jsonb) RETURNING id`,
        [
          advertiserId,
          ids.cities[citySlug],
          cityName,
          `${model} ${n}`,
          `${model.toUpperCase()} 1.0 FIPE ${n}`,
          model,
          price,
          `dec28-${model.toLowerCase()}-${n}`,
          new Date(Date.UTC(2026, 8, 1, 12) + n * 3600_000).toISOString(),
        ]
      );
      return Number(r.rows?.[0]?.id ?? r[0]?.id ?? 0);
    };
    // 3 do modelo na origem (loja Pró) + 1 na vizinha (particular, grátis).
    for (let i = 0; i < 3; i++)
      await ad("Hb20t", ids.advertisers.ittmotors, "atibaia-sp", "Atibaia");
    await ad("Hb20t", ids.advertisers.pfBraganca, "braganca-paulista-sp", "Bragança Paulista");
    // Terceira cidade com anúncios de MESMO peso (Pró), mais perto de Bragança
    // que Atibaia: é ela que torna o teto observável. Sem uma alternativa na
    // mesma faixa de peso, o teto não teria o que redistribuir.
    for (let i = 0; i < 3; i++)
      await ad("Vgm", ids.advertisers.proBraganca, "vargem-sp", "Vargem", 55000);
    // Faixa MENOR que a página, para separar os dois denominadores possíveis do
    // teto (DEC-29). Modelo só desta faixa: 5 de Vargem (~15 km de Bragança) e
    // 1 de Atibaia (~18 km), todos do mesmo peso. Vargem é a mais PERTO, então
    // sem teto ela vem inteira antes — é o que torna o caso observável.
    for (let i = 0; i < 5; i++)
      await ad("Capz", ids.advertisers.proBraganca, "vargem-sp", "Vargem", 51000);
    await ad("Capz", ids.advertisers.ittmotors, "atibaia-sp", "Atibaia", 52000);
  }, 300000);

  afterAll(async () => {
    if (done) done();
    await new Promise((r) => setTimeout(r, 100));
  });

  // ── DEC-28 ────────────────────────────────────────────────────────────────
  it("origem líquida encontra o 4º carro do modelo na cidade vizinha", async () => {
    const r = await run({ city_slug: "atibaia-sp", commercial_model: "Hb20t", limit: 12 });
    expect(r.pagination.total).toBe(4);
    expect(r.search_policy.effective_radius_km).toBe(25);
    expect(r.data.map(cityOf)).toContain("Bragança Paulista");
    // A liquidez da CIDADE (35 ativos) não é a liquidez da BUSCA (3 locais).
    expect(r.search_policy.local_result_count).toBe(3);
  });

  it("a vizinha pequena continua vendo os 4 — a correção não inverteu o lado", async () => {
    const r = await run({
      city_slug: "braganca-paulista-sp",
      commercial_model: "Hb20t",
      limit: 12,
    });
    expect(r.pagination.total).toBe(4);
    expect(r.data.map(cityOf)).toContain("Atibaia");
  });

  it("conjunto todo na origem declara 0 km, mesmo com o piso consultando 25", async () => {
    // Onix só existe em Atibaia na fixture.
    const r = await run({ city_slug: "atibaia-sp", commercial_model: "Onix", limit: 12 });
    expect(r.pagination.total).toBeGreaterThan(0);
    expect(r.data.every((item) => cityOf(item) === "Atibaia")).toBe(true);
    expect(r.search_policy.effective_radius_km).toBe(0);
    expect(r.search_policy.required_distance_km).toBeNull();
  });

  // ── DEC-29 ────────────────────────────────────────────────────────────────
  it("piso recíproco: a página da cidade grande passa a incluir a vizinha", async () => {
    const r = await run({ city_slug: "atibaia-sp", limit: 50 });
    expect(r.search_policy.effective_radius_km).toBe(25);
    expect(r.search_policy.reason).toBe(REASON.REGIONAL_FLOOR);
    expect(r.data.map(cityOf)).toContain("Bragança Paulista");
    expect(r.search_policy.cities.map((c) => c.slug)).toContain("braganca-paulista-sp");
  });

  it("raio=0 explícito vence o piso e isola a cidade", async () => {
    const r = await run({ city_slug: "atibaia-sp", raio: "0", limit: 50 });
    expect(r.search_policy.geo_mode).toBe("EXACT_CITY");
    expect(r.search_policy.effective_radius_km).toBe(0);
    expect(r.data.every((item) => cityOf(item) === "Atibaia")).toBe(true);
  });

  it("teto de 40%: dentro da faixa de peso, uma cidade externa não toma o turno inteiro", async () => {
    // Origem Bragança. Na faixa Pró concorrem Vargem (~15 km, 3 anúncios) e
    // Atibaia (~18 km, dezenas). Com limit 5 o teto é 2 por turno: Vargem
    // entrega 2 no primeiro turno e o 3º vai para o turno seguinte, abrindo
    // vaga para Atibaia. Sem o teto, os três Vargem viriam juntos, por serem
    // mais perto.
    const r = await run({ city_slug: "braganca-paulista-sp", limit: 5 });
    expect(r.data.length).toBe(5);
    const cidades = r.data.map(cityOf);
    expect(cidades.filter((c) => c === "Vargem").length).toBe(2);
    expect(cidades.filter((c) => c === "Atibaia").length).toBeGreaterThanOrEqual(1);
  });

  it("o teto mede pela CAPACIDADE da faixa, não pelo tamanho da página", async () => {
    // 6 candidatos na faixa (5 Vargem + 1 Atibaia) e página de 24 vagas.
    //   • por capacidade da faixa: teto = floor(0.4 × LEAST(24, 6)) = 2, então
    //     Vargem entrega 2 e o Atibaia sobe para a 3ª posição;
    //   • pelo tamanho da página: teto = floor(0.4 × 24) = 9, maior que a faixa
    //     inteira, e os 5 Vargem viriam juntos por estarem mais perto.
    // A posição do anúncio de Atibaia é, portanto, o que separa as duas leituras.
    const r = await run({ city_slug: "braganca-paulista-sp", commercial_model: "Capz", limit: 24 });
    expect(r.pagination.total).toBe(6);
    const tiers = new Set(r.data.map((item) => Number(item.priority_tier)));
    expect(tiers.size).toBe(1); // o caso só mede o teto se a faixa for uma só
    const cidades = r.data.map(cityOf);
    expect(cidades).toEqual(["Vargem", "Vargem", "Atibaia", "Vargem", "Vargem", "Vargem"]);
    expect(cidades.indexOf("Atibaia")).toBe(2);
  });

  it("teto não trunca: sem alternativa, a página continua cheia", async () => {
    const r = await run({ city_slug: "braganca-paulista-sp", limit: 50 });
    const total = r.pagination.total;
    expect(total).toBeGreaterThan(30);
    expect(r.data.length).toBe(Math.min(50, total));
  });

  it("a origem nunca é rebaixada pelo teto", async () => {
    // Origem Atibaia: 35 próprios. Mesmo com o vizinho no território, as
    // primeiras vagas continuam sendo da própria cidade.
    const r = await run({ city_slug: "atibaia-sp", limit: 5 });
    expect(r.data.every((item) => cityOf(item) === "Atibaia")).toBe(true);
  });

  it("DEC-07 preservada: peso vence distância dentro do turno", async () => {
    const r = await run({
      city_slug: "braganca-paulista-sp",
      commercial_model: "Hb20t",
      limit: 12,
    });
    const tiers = r.data.map((item) => Number(item.priority_tier));
    expect(tiers).toEqual([...tiers].sort((a, b) => b - a));
    // O Hb20t local é grátis (peso 1) e fica atrás dos Pró de Atibaia.
    expect(cityOf(r.data[r.data.length - 1])).toBe("Bragança Paulista");
  });
});
