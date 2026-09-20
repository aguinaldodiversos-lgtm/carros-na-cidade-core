// tests/search-policy/f2-2-auto-baseline.test.js
//
// F2.2-A1 — AUTO_RADIUS e território-base de `/comprar` contra a v3 certificada.
//
// Cobre os invariantes que esta subfase corrige:
//   INV-010  AUTO nunca alcança 150 km (teto automático 75 em todo perfil)
//   INV-072  o teto avaliado não vira raio efetivo
//   INV-073  anel com delta zero não amplia o território
//   INV-074  nenhum anel externo contributivo → efetivo 0
//   INV-009  filtro explícito de produto não expande o território
//   INV-016  `/comprar` com origem constrói o território-base antes do produto
//   INV-068  esse território-base fica nos anéis 0/25/50/75
//
// Sem Postgres: `resolveScope` recebe um `db` falso que responde à query de
// liquidez (com e sem filtro de produto) e ao SELECT de nomes de cidade.

import { describe, expect, it } from "vitest";
import { SEARCH_POLICY_DEFAULT } from "../../src/modules/ads/search-policy/policy-config.js";
import {
  GEO_MODE,
  REASON,
  hasProductFilters,
  resolveAutoRadius,
  resolveScope,
} from "../../src/modules/ads/search-policy/scope-resolver.js";

const policy = SEARCH_POLICY_DEFAULT;
const rows = (pairs) => pairs.map(([distance_km, count]) => ({ distance_km, count }));
const BROWSE = {
  target: policy.profiles.BROWSE_CITY.target,
  max_auto_radius: policy.profiles.BROWSE_CITY.max_auto_radius,
  rings_auto: policy.rings_auto,
};

// ── 8.3 — último anel contributivo ──────────────────────────────────────────
describe("resolveAutoRadius — último anel contributivo (DEC-23)", () => {
  it("caso A: acumulado 2/5/5/5 com alvo 20 → required null, effective 25", () => {
    expect(
      resolveAutoRadius(
        rows([
          [0, 2],
          [20, 3],
        ]),
        BROWSE
      )
    ).toEqual({
      required_distance_km: null,
      effective_radius_km: 25,
      expanded: true,
      reason: REASON.AUTO_RADIUS_CAP_REACHED,
    });
  });

  it("caso B: nenhum anel externo acrescenta → required null, effective 0", () => {
    expect(resolveAutoRadius(rows([[0, 3]]), BROWSE)).toEqual({
      required_distance_km: null,
      effective_radius_km: 0,
      expanded: false,
      reason: REASON.AUTO_RADIUS_CAP_REACHED,
    });
  });

  it("caso C: alvo atingido em 75 → required é a distância real, effective 75", () => {
    const r = resolveAutoRadius(
      rows([
        [0, 2],
        [20, 3],
        [45, 3],
        [70, 12],
      ]),
      BROWSE
    );
    expect(r.required_distance_km).toBe(70);
    expect(r.effective_radius_km).toBe(75);
    expect(r.reason).toBe(REASON.LOW_LOCAL_LIQUIDITY);
  });

  it("caso D: alvo atingido em 34 km → required 34, effective 50", () => {
    const r = resolveAutoRadius(
      rows([
        [0, 5],
        [34, 15],
      ]),
      BROWSE
    );
    expect(r.required_distance_km).toBe(34);
    expect(r.effective_radius_km).toBe(50);
  });

  it("anel intermediário vazio não impede que um anel posterior contribua", () => {
    // 0:1 · 25:1 (delta 0) · 50:4 (delta +3) · 75:4 (delta 0) → último útil = 50
    const r = resolveAutoRadius(
      rows([
        [0, 1],
        [40, 3],
      ]),
      BROWSE
    );
    expect(r).toMatchObject({ required_distance_km: null, effective_radius_km: 50 });
  });
});

// ── 8.2 / 8.4 — território-base antes do produto ────────────────────────────
const ORIGIN = {
  id: 7,
  slug: "origem-sp",
  name: "Origem",
  state: "SP",
  latitude: -23,
  longitude: -46,
};

/** `db` falso: liquidez sem filtro (baseline) × com filtro (produto). */
function fakeDb({ baseline, product }) {
  const calls = { liquidity: 0, baseline: 0, product: 0 };
  return {
    calls,
    query: async (sql, params) => {
      if (/FROM region_memberships rm/.test(sql)) {
        calls.liquidity += 1;
        // Toda cláusula de produto acrescenta um parâmetro além de origem+raio.
        const filtered = params.length > 2;
        if (filtered) calls.product += 1;
        else calls.baseline += 1;
        const src = filtered ? product : baseline;
        return {
          rows: src.map((r, i) => ({
            city_id: i + 1,
            slug: `c${i + 1}`,
            distance_km: r.distance_km,
            count: r.count,
          })),
        };
      }
      if (/FROM cities WHERE id = ANY/.test(sql)) {
        return {
          rows: (params[0] || []).map((id) => ({
            id,
            slug: `c${id}`,
            name: `Cidade ${id}`,
            state: "SP",
          })),
        };
      }
      return { rows: [] };
    },
  };
}

const intentFor = (profile) => ({
  profile,
  target: policy.profiles[profile].target,
  max_auto_radius: policy.profiles[profile].max_auto_radius,
});

const PRODUCT_PROFILES = [
  ["SEARCH_BRAND", { brand: "Chevrolet" }],
  ["SEARCH_MODEL", { commercial_model: "Onix" }],
  ["SEARCH_MODEL_YEAR", { commercial_model: "Onix", year_from: 2020 }],
  ["SEARCH_VERSION", { commercial_model: "Onix", q: "ltz" }],
];

describe("resolveScope — território-base de /comprar (DEC-18)", () => {
  it("hasProductFilters reconhece produto e ignora contexto vazio", () => {
    expect(hasProductFilters({})).toBe(false);
    expect(hasProductFilters({ commercial_model: "Onix" })).toBe(true);
    expect(hasProductFilters({ price_max: 50000 })).toBe(true);
  });

  for (const [profile, filters] of PRODUCT_PROFILES) {
    it(`${profile}: cidade com estoque próprio suficiente → território fica em 0 km`, async () => {
      // Baseline: 25 ativos na própria cidade (≥ 20 do BROWSE_CITY) → 0 km.
      // Produto: quase nada perto, muito a 60 km — antes isso puxava o
      // território para 75 (ou 150); agora não pode puxar nada.
      const db = fakeDb({
        baseline: rows([
          [0, 25],
          [60, 40],
        ]),
        product: rows([
          [0, 1],
          [60, 40],
        ]),
      });
      const scope = await resolveScope(
        {
          origin: ORIGIN,
          filters,
          intent: intentFor(profile),
          geoRequest: { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null },
        },
        policy,
        { db, cache: false }
      );
      expect(scope.geo_mode).toBe(GEO_MODE.AUTO_RADIUS);
      expect(scope.effective_radius_km).toBe(0);
      expect(scope.territory.radiusKm).toBe(0);
      expect(db.calls.baseline).toBe(1);
      expect(db.calls.product).toBe(1);
    });
  }

  it("baseline que precisa expandir: produto herda o mesmo território, sem ampliar", async () => {
    // Baseline: 5 na própria + 20 a 34 km → BROWSE_CITY exige 20 → efetivo 50.
    // Produto (modelo raro): só 1 perto e 30 a 70 km. Território continua 50.
    const db = fakeDb({
      baseline: rows([
        [0, 5],
        [34, 20],
      ]),
      product: rows([
        [0, 1],
        [34, 1],
        [70, 30],
      ]),
    });
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: { commercial_model: "Onix" },
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null },
      },
      policy,
      { db, cache: false }
    );
    expect(scope.required_distance_km).toBe(34);
    expect(scope.effective_radius_km).toBe(50);
    expect(scope.territory.radiusKm).toBe(50);
    // As contagens expostas continuam sendo as do produto, no território-base.
    expect(scope.local_result_count).toBe(1);
    expect(scope.cities.every((c) => c.distance_km <= 50)).toBe(true);
  });

  it("produto abaixo do alvo não move o território (fica para a Guided Relaxation)", async () => {
    const db = fakeDb({
      baseline: rows([
        [0, 30],
        [40, 50],
      ]),
      product: rows([
        [0, 2],
        [40, 50],
      ]),
    });
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: { commercial_model: "Onix" },
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null },
      },
      policy,
      { db, cache: false }
    );
    expect(scope.effective_radius_km).toBe(0);
    expect(scope.local_result_count).toBe(2); // 2 < target 12: relaxação depois
  });

  it("sem filtro de produto o baseline é a própria liquidez — nenhuma query extra", async () => {
    const db = fakeDb({
      baseline: rows([
        [0, 25],
        [60, 40],
      ]),
      product: rows([]),
    });
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("BROWSE_CITY"),
        geoRequest: { mode: GEO_MODE.AUTO_RADIUS, requested_radius_km: null },
      },
      policy,
      { db, cache: false }
    );
    expect(scope.effective_radius_km).toBe(0);
    expect(db.calls.liquidity).toBe(1);
  });

  it("raio explícito preserva a precedência manual: baseline não se aplica", async () => {
    const db = fakeDb({
      baseline: rows([
        [0, 25],
        [60, 40],
      ]),
      product: rows([
        [0, 1],
        [60, 40],
      ]),
    });
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: { commercial_model: "Onix" },
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: { mode: GEO_MODE.MANUAL_RADIUS, requested_radius_km: 75 },
      },
      policy,
      { db, cache: false }
    );
    expect(scope.geo_mode).toBe(GEO_MODE.MANUAL_RADIUS);
    expect(scope.effective_radius_km).toBe(75);
    expect(scope.reason).toBe(REASON.MANUAL);
    expect(db.calls.baseline).toBe(0); // manual não consulta baseline
  });
});
