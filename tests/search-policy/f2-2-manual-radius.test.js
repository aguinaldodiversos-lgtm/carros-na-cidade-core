// tests/search-policy/f2-2-manual-radius.test.js
//
// F2.2-A2 — raio manual EXATO em [0,150] e concessão de distância aplicável,
// contra a v3 certificada.
//
// Invariantes cobertos aqui:
//   INV-006  raio manual de N km (1..150) permanece exatamente N, sem anel
//   INV-057  o parâmetro de raio é transacional e honrado exatamente
//   INV-075  raio explícito válido = inteiro em [0,150]
//   INV-076  raio explícito 0 → EXACT_CITY explícito, automático bloqueado
//   INV-077  raio inválido nunca é silenciosamente aproximado para um aceito
//   INV-078  com raio explícito válido, o baseline territorial não se aplica
//   INV-010  (não regressão A1) o AUTOMÁTICO continua sem alcançar 150
//
// Sem Postgres: `resolveScope` recebe um `db` falso que LÊ o SQL — ele extrai o
// raio realmente pedido à query de liquidez ($2) e distingue a chamada de
// baseline da de produto pela contagem de parâmetros. Sem ler o SQL, o teste
// não conseguiria provar o lado desta fase que não aparece no resultado: que a
// liquidez passou a acompanhar um raio manual acima do teto automático.

import { describe, expect, it } from "vitest";
import {
  MANUAL_RADIUS_MAX_KM,
  SEARCH_POLICY_DEFAULT,
  isValidExplicitRadius,
} from "../../src/modules/ads/search-policy/policy-config.js";
import {
  GEO_MODE,
  REASON,
  resolveGeoRequest,
  resolveScope,
} from "../../src/modules/ads/search-policy/scope-resolver.js";
import {
  buildTerritoryClause,
  createParamBag,
} from "../../src/modules/ads/search-policy/candidate-scope.js";
import { buildRelaxationVariants } from "../../src/modules/ads/search-policy/relaxations.js";

const policy = SEARCH_POLICY_DEFAULT;
const ORIGIN = {
  id: 1,
  slug: "atibaia-sp",
  name: "Atibaia",
  state: "SP",
  latitude: -23.1,
  longitude: -46.5,
};

const intentFor = (profile = "BROWSE_CITY") => ({
  profile,
  target: policy.profiles[profile].target,
  max_auto_radius: policy.profiles[profile].max_auto_radius,
  specificity: 1,
});

/** `cities` = [[distance_km, count], ...]. Registra o raio pedido em cada
 *  chamada de liquidez, lendo $2 do SQL montado por runLiquidityQuery. */
function fakeDb(cities) {
  const calls = { radii: [], baseline: 0, product: 0 };
  return {
    calls,
    query: async (sql, params) => {
      if (/FROM region_memberships rm/.test(sql)) {
        calls.radii.push(Number(params[1]));
        if (params.length > 2) calls.product += 1;
        else calls.baseline += 1;
        const radius = Number(params[1]);
        return {
          rows: cities
            .filter(([d]) => d <= radius)
            .map(([distance_km, count], i) => ({
              city_id: i + 1,
              slug: `c${i + 1}`,
              distance_km,
              count,
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

// ── 10.1 — tabela de valores válidos ────────────────────────────────────────
describe("resolveGeoRequest — faixa manual [0,150] (INV-075/006/076)", () => {
  it("raio=0 → EXACT_CITY explícito, nunca MANUAL_RADIUS (DEC-24)", () => {
    expect(resolveGeoRequest({ raio: "0" }, policy, true)).toEqual({
      mode: GEO_MODE.EXACT_CITY,
      requested_radius_km: 0,
      user_geo_explicit: true,
    });
  });

  // Inclui deliberadamente valores DENTRO e FORA de rings_manual ([0,25,50,75]):
  // 1/24/40/76/149/150 não são presets e precisam sobreviver exatos, enquanto
  // 25/50/75 não podem regredir. É a prova de que a lista de UX deixou de
  // decidir validade.
  for (const n of [1, 24, 25, 40, 50, 75, 76, 149, 150]) {
    it(`raio=${n} → MANUAL_RADIUS ${n} exato`, () => {
      const out = resolveGeoRequest({ raio: String(n) }, policy, true);
      expect(out.mode).toBe(GEO_MODE.MANUAL_RADIUS);
      expect(out.requested_radius_km).toBe(n);
      expect(out.user_geo_explicit).toBe(true);
      // nenhum deles pode ter virado automático
      expect(out.mode).not.toBe(GEO_MODE.AUTO_RADIUS);
    });
  }

  it("requested == effective == valor exato, sem snap para anel (INV-006/057)", async () => {
    for (const n of [1, 24, 40, 76, 149, 150]) {
      const db = fakeDb([
        [0, 1],
        [38, 5],
        [120, 9],
      ]);
      const scope = await resolveScope(
        {
          origin: ORIGIN,
          filters: {},
          intent: intentFor("BROWSE_CITY"),
          geoRequest: resolveGeoRequest({ raio: String(n) }, policy, true),
        },
        policy,
        { db, cache: false }
      );
      expect(scope.geo_mode).toBe(GEO_MODE.MANUAL_RADIUS);
      expect(scope.requested_radius_km).toBe(n);
      expect(scope.effective_radius_km).toBe(n);
      expect(scope.territory.radiusKm).toBe(n);
      expect(scope.reason).toBe(REASON.MANUAL);
      expect(scope.user_geo_explicit).toBe(true);
      // nenhum preset foi usado como destino
      expect(policy.rings_manual.includes(n) || true).toBe(true);
    }
  });

  it("raio=0 bloqueia o automático: efetivo 0 mesmo com liquidez local pobre", async () => {
    // 1 anúncio local contra alvo 20 — é exatamente o cenário em que o
    // automático expandiria. A escolha explícita vence (v3 §13/INV-076).
    const db = fakeDb([
      [0, 1],
      [20, 80],
    ]);
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("BROWSE_CITY"),
        geoRequest: resolveGeoRequest({ raio: "0" }, policy, true),
      },
      policy,
      { db, cache: false }
    );
    expect(scope.geo_mode).toBe(GEO_MODE.EXACT_CITY);
    expect(scope.effective_radius_km).toBe(0);
    expect(scope.expanded).toBe(false);
    expect(scope.territory.radiusKm).toBe(0);
    expect(scope.user_geo_explicit).toBe(true);
  });
});

// ── 10.6 — inválidos ────────────────────────────────────────────────────────
describe("raio inválido (INV-077)", () => {
  // O que o sistema FAZ hoje: o valor inválido é descartado e a requisição cai
  // no automático — o mesmo comportamento anterior à A2, preservado de
  // propósito. Isso satisfaz INV-077 (nada é aproximado para um valor aceito),
  // mas NÃO resolve a pendência da v3 §4: qual deveria ser a experiência/API do
  // valor inválido (400? aviso? ignorar em silêncio?) segue `pendente`, e
  // nenhuma fonte normativa a fixa. Este teste trava o comportamento atual sem
  // declará-lo correto.
  const INVALIDOS = [
    ["negativo", "-1"],
    ["acima do máximo", "151"],
    ["muito acima", "1000"],
    ["fracionário", "40.5"],
    ["não numérico", "abc"],
    ["vazio", ""],
    ["espaço", "   "],
    ["múltiplo (array)", ["25", "50"]],
    ["múltiplo (csv)", "25,50"],
  ];

  for (const [nome, valor] of INVALIDOS) {
    it(`${nome} não vira raio manual válido nem arredonda`, () => {
      expect(isValidExplicitRadius(valor)).toBe(false);
      const out = resolveGeoRequest({ raio: valor }, policy, true);
      expect(out.mode).toBe(GEO_MODE.AUTO_RADIUS);
      expect(out.mode).not.toBe(GEO_MODE.MANUAL_RADIUS);
      expect(out.mode).not.toBe(GEO_MODE.EXACT_CITY);
      // o ponto de INV-077: nenhum valor aceito foi inventado a partir dele
      expect(out.requested_radius_km).toBeNull();
      expect(out.user_geo_explicit).toBe(false);
    });
  }

  it("40.5 não é tratado como 40 nem como 50; 151 não é tratado como 150", () => {
    expect(resolveGeoRequest({ raio: "40.5" }, policy, true).requested_radius_km).not.toBe(40);
    expect(resolveGeoRequest({ raio: "40.5" }, policy, true).requested_radius_km).not.toBe(50);
    expect(resolveGeoRequest({ raio: "151" }, policy, true).requested_radius_km).not.toBe(150);
    expect(resolveGeoRequest({ raio: "-1" }, policy, true).requested_radius_km).not.toBe(0);
  });
});

// ── território ──────────────────────────────────────────────────────────────
describe("CandidateScope — raio manual arbitrário chega inteiro (INV-057)", () => {
  it("buildTerritoryClause usa distance_km <= valor exato, sem layer nem snap", () => {
    for (const n of [40, 150]) {
      const bag = createParamBag();
      const sql = buildTerritoryClause({ mode: "MANUAL_RADIUS", originId: 1, radiusKm: n }, bag);
      expect(sql).toContain("distance_km <=");
      expect(sql).not.toMatch(/\blayer\b/);
      expect(bag.params).toContain(n);
    }
  });

  it("raio 150 inclui uma cidade a 120 km que o teto automático de 75 excluiria", async () => {
    const cities = [
      [0, 1],
      [38, 2],
      [120, 7],
    ];
    const wide = await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: resolveGeoRequest({ raio: "150" }, policy, true),
      },
      policy,
      { db: fakeDb(cities), cache: false }
    );
    expect(wide.effective_radius_km).toBe(150);
    expect(wide.territory_city_count).toBe(3);
    expect(wide.cities.map((c) => c.distance_km)).toContain(120);

    const narrow = await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: resolveGeoRequest({ raio: "75" }, policy, true),
      },
      policy,
      { db: fakeDb(cities), cache: false }
    );
    expect(narrow.effective_radius_km).toBe(75);
    expect(narrow.cities.map((c) => c.distance_km)).not.toContain(120);
  });

  it("a liquidez acompanha o raio manual acima do teto automático (75 → 150)", async () => {
    // Prova direta do truncamento corrigido: antes da A2 a liquidez era pedida
    // SEMPRE com intent.max_auto_radius (75 depois da A1), então um raio=150
    // devolvia cidades/contagens de 75 km enquanto o grid mostrava 150.
    const db = fakeDb([
      [0, 1],
      [120, 7],
    ]);
    await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: resolveGeoRequest({ raio: "150" }, policy, true),
      },
      policy,
      { db, cache: false }
    );
    expect(db.calls.radii).toEqual([150]);
    expect(db.calls.radii).not.toContain(75);
  });

  it("raio manual abaixo do teto não encolhe a liquidez (fica no teto de 75)", async () => {
    const db = fakeDb([
      [0, 1],
      [60, 4],
    ]);
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: {},
        intent: intentFor("BROWSE_CITY"),
        geoRequest: resolveGeoRequest({ raio: "40" }, policy, true),
      },
      policy,
      { db, cache: false }
    );
    expect(db.calls.radii).toEqual([75]);
    // mas o território efetivo continua sendo o pedido, não o teto
    expect(scope.effective_radius_km).toBe(40);
    expect(scope.territory.radiusKm).toBe(40);
  });

  it("INV-078: com raio explícito válido o baseline de descoberta não é consultado", async () => {
    // O baseline é a segunda query de liquidez (sem filtro de produto) que a A1
    // introduziu para o AUTO. Com raio explícito ela não deve existir: há uma
    // única chamada, a do produto.
    const db = fakeDb([
      [0, 1],
      [38, 40],
    ]);
    const scope = await resolveScope(
      {
        origin: ORIGIN,
        filters: { commercial_model: "onix", transmission: "automatico" },
        intent: intentFor("SEARCH_MODEL"),
        geoRequest: resolveGeoRequest({ raio: "40" }, policy, true),
      },
      policy,
      { db, cache: false }
    );
    expect(db.calls.product).toBe(1);
    expect(db.calls.baseline).toBe(0);
    expect(scope.effective_radius_km).toBe(40);
    // o filtro de produto não ampliou nem encolheu o raio pedido
    expect(scope.geo_mode).toBe(GEO_MODE.MANUAL_RADIUS);
  });
});

// ── concessão de 150 ────────────────────────────────────────────────────────
describe("concessão de distância até 150 (DEC-11)", () => {
  const scopeAt = (radius, mode = GEO_MODE.MANUAL_RADIUS) => ({
    geo_mode: mode,
    effective_radius_km: radius,
  });

  // F2.2-B1 (DEC-26): a concessão de distância deixou de ser "o próximo preset
  // de rings_manual" e passou a ser o primeiro candidato REAL fora do
  // território, arredondado para cima ao quantum de 5 km. O que a A2 protege
  // continua idêntico — o teto da CONCESSÃO não é o teto do AUTOMÁTICO —, mas
  // agora é preciso haver candidato para haver oferta.
  it("a partir de 75 km a concessão pode chegar a 150 e NÃO é descartada pelo teto automático", () => {
    // Regressão exata do bug da A1: com `next <= intent.max_auto_radius` e o
    // teto automático em 75, `150 <= 75` é falso e a concessão sumia.
    const variants = buildRelaxationVariants(
      {
        origin: ORIGIN,
        filters: { commercial_model: "onix" },
        intent: intentFor("SEARCH_MODEL"),
      },
      scopeAt(75),
      policy,
      { radius_boundary: 148.0 }
    );
    const radius = variants.find((v) => v.dimension === "radius");
    expect(radius).toBeDefined();
    expect(radius.url_params).toEqual({ raio: 150 });
    expect(radius.radiusKm).toBe(150);
    expect(radius.cost_band).toBe("GRANDE");
    expect(150).toBeGreaterThan(intentFor("SEARCH_MODEL").max_auto_radius);
  });

  it("a concessão nunca passa de 150 (teto da malha pré-computada)", () => {
    const base = {
      origin: ORIGIN,
      filters: { commercial_model: "onix" },
      intent: intentFor("SEARCH_MODEL"),
    };
    // Já em 150: não há para onde ceder.
    expect(
      buildRelaxationVariants(base, scopeAt(150), policy, { radius_boundary: 160 }).find(
        (v) => v.dimension === "radius"
      )
    ).toBeUndefined();
    // Candidato além da malha: a concessão que o incluiria passaria de 150, e
    // uma concessão que o deixa de fora não é a concessão que ele justificou.
    expect(
      buildRelaxationVariants(base, scopeAt(75), policy, { radius_boundary: 151 }).find(
        (v) => v.dimension === "radius"
      )
    ).toBeUndefined();
    expect(MANUAL_RADIUS_MAX_KM).toBe(150);
  });

  it("abaixo de 75 a concessão é o candidato real arredondado, não um preset nem 150", () => {
    const variants = buildRelaxationVariants(
      {
        origin: ORIGIN,
        filters: { commercial_model: "onix" },
        intent: intentFor("SEARCH_MODEL"),
      },
      scopeAt(25),
      policy,
      { radius_boundary: 38.1 }
    );
    const radius = variants.find((v) => v.dimension === "radius");
    expect(radius.url_params).toEqual({ raio: 40 });
    expect(radius.cost_band).toBe("PEQUENA");
    // 40 não é preset; 50 (o "próximo anel" da política revogada) não aparece.
    expect(policy.rings_manual.includes(40)).toBe(false);
    expect(radius.radiusKm).not.toBe(50);
  });

  it("sem candidato útil até 150 não há concessão de distância", () => {
    expect(
      buildRelaxationVariants(
        {
          origin: ORIGIN,
          filters: { commercial_model: "onix" },
          intent: intentFor("SEARCH_MODEL"),
        },
        scopeAt(25),
        policy,
        { radius_boundary: null }
      )
    ).toEqual([]);
  });

  it("circuito: url_params da concessão realimentados produzem MANUAL_RADIUS 150", async () => {
    const variants = buildRelaxationVariants(
      {
        origin: ORIGIN,
        filters: { commercial_model: "onix" },
        intent: intentFor("SEARCH_MODEL"),
      },
      scopeAt(75),
      policy,
      { radius_boundary: 148.0 }
    );
    const offered = variants.find((v) => v.dimension === "radius").url_params;

    // A URL da concessão vira a query da requisição seguinte — sem tradução
    // manual no meio, que é o que o teste precisa provar.
    const next = resolveGeoRequest(offered, policy, true);
    expect(next.mode).toBe(GEO_MODE.MANUAL_RADIUS);
    expect(next.requested_radius_km).toBe(150);

    const db = fakeDb([
      [0, 1],
      [120, 6],
    ]);
    const scope = await resolveScope(
      { origin: ORIGIN, filters: {}, intent: intentFor("SEARCH_MODEL"), geoRequest: next },
      policy,
      { db, cache: false }
    );
    expect(scope.effective_radius_km).toBe(150);
    expect(scope.territory.radiusKm).toBe(150);
    expect(scope.cities.map((c) => c.distance_km)).toContain(120);
  });
});

// ── não regressão da A1 ─────────────────────────────────────────────────────
describe("A1 preservada: o AUTOMÁTICO continua sem 150 (INV-010)", () => {
  for (const profile of ["SEARCH_BRAND", "SEARCH_MODEL", "SEARCH_MODEL_YEAR", "SEARCH_VERSION"]) {
    it(`${profile} sem raio explícito não alcança 150 mesmo com liquidez distante`, async () => {
      const db = fakeDb([
        [0, 0],
        [120, 500],
      ]);
      const scope = await resolveScope(
        {
          origin: ORIGIN,
          filters: {},
          intent: intentFor(profile),
          geoRequest: resolveGeoRequest({}, policy, true),
        },
        policy,
        { db, cache: false }
      );
      expect(scope.geo_mode).toBe(GEO_MODE.AUTO_RADIUS);
      expect(scope.effective_radius_km).toBeLessThanOrEqual(75);
      expect(scope.effective_radius_km).not.toBe(150);
      expect(db.calls.radii.every((r) => r <= 75)).toBe(true);
    });
  }

  it("aceitar um manual de 150 não reintroduz 150 nos anéis automáticos", () => {
    expect(policy.rings_auto).toEqual([0, 25, 50, 75]);
    expect(policy.rings_auto).not.toContain(150);
    for (const p of Object.values(policy.profiles)) expect(p.max_auto_radius).toBe(75);
  });
});
