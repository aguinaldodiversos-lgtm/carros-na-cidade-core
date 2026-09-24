// tests/search-policy/policy-config.test.js
//
// §2: platform_settings.search_policy (migration 065) e SEARCH_POLICY_DEFAULT
// (código) DEVEM ser o mesmo JSON. O teste lê a migration e compara.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/modules/platform/settings.service.js", () => ({
  getSetting: vi.fn(),
}));
// O logger real (pino + transporte pino-pretty em worker thread) faz o vitest
// atribuir ao teste um erro assíncrono quando `warn` recebe `{ err }` — o
// caminho de falha devolvia o DEFAULT corretamente e o teste falhava depois.
// Mockado para provar o contrato (warn chamado) sem o transporte.
vi.mock("../../src/shared/logger.js", () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { getSetting } from "../../src/modules/platform/settings.service.js";
import { logger } from "../../src/shared/logger.js";
import {
  RELAXATIONS_SHAPE,
  SEARCH_POLICY_DEFAULT,
  detectRelaxationsShape,
  isValidRelaxationsPolicy,
  isValidSearchPolicy,
  loadSearchPolicy,
  resolveSearchPolicy,
  validateBaseSearchPolicy,
} from "../../src/modules/ads/search-policy/policy-config.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATION = path.resolve(
  here,
  "../../src/database/migrations/065_search_policy_settings.sql"
);
const MIGRATION_066 = path.resolve(here, "../../src/database/migrations/066_search_policy_f2.sql");
const MIGRATION_067 = path.resolve(
  here,
  "../../src/database/migrations/067_search_policy_auto_cap_75.sql"
);
const MIGRATION_068 = path.resolve(
  here,
  "../../src/database/migrations/068_search_policy_guided_relaxation_dec26.sql"
);
const MIGRATION_069 = path.resolve(
  here,
  "../../src/database/migrations/069_search_policy_relaxation_compat.sql"
);
const MIGRATION_071 = path.resolve(
  here,
  "../../src/database/migrations/071_search_policy_regional_floor_dec28_dec29.sql"
);

function jsonFromMigration() {
  const sql = fs.readFileSync(MIGRATION, "utf8");
  const start = sql.indexOf("'{");
  const end = sql.indexOf("}'::jsonb", start);
  expect(start).toBeGreaterThan(-1);
  expect(end).toBeGreaterThan(start);
  const base = JSON.parse(sql.slice(start + 1, end + 1));
  // Migration 066 (F2, D6): jsonb_set(value, {facets,always_open}, ["price"]).
  // O que o banco tem depois de 065 + 066 é o que a constante precisa espelhar.
  const patched = fs.readFileSync(MIGRATION_066, "utf8");
  expect(patched).toContain("'{facets,always_open}'");
  expect(patched).toContain("'[\"price\"]'::jsonb");
  base.facets.always_open = ["price"];
  // Migration 067 (F2.2-A1, DEC-11/18/23): teto automático de 75 km em todo
  // perfil e 150 fora de rings_auto. 150 continua em rings_manual e na
  // configuração de relaxação — o que sai é só a expansão automática.
  const capped = fs.readFileSync(MIGRATION_067, "utf8");
  expect(capped).toContain("'{rings_auto}'");
  expect(capped).toContain("'[0, 25, 50, 75]'::jsonb");
  base.rings_auto = [0, 25, 50, 75];
  for (const key of ["SEARCH_BRAND", "SEARCH_MODEL", "SEARCH_MODEL_YEAR", "SEARCH_VERSION"]) {
    expect(capped).toContain(`'{profiles,${key},max_auto_radius}'`);
    base.profiles[key].max_auto_radius = 75;
  }
  // Migration 068 (F2.2-B1, DEC-26): o bloco `relaxations` inteiro é
  // substituído — o `steps` da 065 descrevia a política que a DEC-26 revogou.
  // O JSON é lido do PRÓPRIO arquivo, não reescrito aqui: se a migration e a
  // constante divergirem, é a comparação final que acusa.
  const relaxed = fs.readFileSync(MIGRATION_068, "utf8");
  expect(relaxed).toContain("'{relaxations}'");
  expect(relaxed).toContain("IS DISTINCT FROM");
  const relaxStart = relaxed.indexOf("'{\n");
  const relaxEnd = relaxed.indexOf("}'::jsonb", relaxStart);
  expect(relaxStart).toBeGreaterThan(-1);
  expect(relaxEnd).toBeGreaterThan(relaxStart);
  base.relaxations = JSON.parse(relaxed.slice(relaxStart + 1, relaxEnd + 1));
  // Migration 071 (DEC-28/DEC-29): alvos dos perfis de produto específico,
  // piso regional, teto por cidade e versão v2. Os valores são lidos do PRÓPRIO
  // arquivo — se a migration e a constante divergirem, a comparação final
  // acusa, que é o ponto deste teste.
  const floored = fs.readFileSync(MIGRATION_071, "utf8");
  const setValue = (jsonPath) => {
    const marker = `'{${jsonPath}}'`;
    const at = floored.indexOf(marker);
    expect(at, `071 não grava ${marker}`).toBeGreaterThan(-1);
    const raw = floored.slice(at + marker.length).match(/,\s*'([^']+)'::jsonb/);
    expect(raw, `071 sem valor para ${marker}`).not.toBeNull();
    return JSON.parse(raw[1]);
  };
  base.profiles.SEARCH_MODEL.target = setValue("profiles,SEARCH_MODEL,target");
  base.profiles.SEARCH_MODEL_YEAR.target = setValue("profiles,SEARCH_MODEL_YEAR,target");
  base.profiles.SEARCH_VERSION.target = setValue("profiles,SEARCH_VERSION,target");
  base.regional_floor_km = setValue("regional_floor_km");
  base.city_share_cap = setValue("city_share_cap");
  base.version = setValue("version");
  return base;
}

/**
 * F2.2-B1R-FIX: o banco carrega DOIS contratos ao mesmo tempo — os campos
 * DEC-26, que são a política vigente, e `steps`/`max_items`, que existem só
 * para o código anterior continuar funcional em rollback. A constante do
 * código espelha apenas o primeiro; a comparação separa os dois.
 */
const LEGACY_COMPAT_KEYS = ["steps", "max_items"];

function withoutLegacyCompat(policy) {
  const relaxations = { ...policy.relaxations };
  for (const key of LEGACY_COMPAT_KEYS) delete relaxations[key];
  return { ...policy, relaxations };
}

describe("search_policy — migration 065 × SEARCH_POLICY_DEFAULT", () => {
  it("são o mesmo JSON em valor, descontada a compatibilidade legada do banco", () => {
    expect(withoutLegacyCompat(jsonFromMigration())).toEqual(
      JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT))
    );
  });

  it("a 068 grava as chaves legadas de compatibilidade com os valores históricos", () => {
    const relaxations = jsonFromMigration().relaxations;
    expect(relaxations.max_items).toBe(3);
    expect(relaxations.steps).toEqual({
      radius: "next_ring",
      year_from: -2,
      price_max: 0.15,
      mileage_max: 0.25,
      transmission: "remove",
      fuel: "remove",
      body_type: "remove",
      seller_kind: "remove",
    });
    // …e o bloco continua sendo DEC-26 válido para o código novo, que as ignora.
    expect(isValidRelaxationsPolicy(relaxations)).toBe(true);
    expect(detectRelaxationsShape(relaxations)).toBe(RELAXATIONS_SHAPE.DEC26_VALID);
  });

  it("a 069 repara bancos que rodaram a 068 original, de forma idempotente e aditiva", () => {
    const sql = fs.readFileSync(MIGRATION_069, "utf8");
    expect(sql).toContain("'{relaxations,steps}'");
    expect(sql).toContain("'{relaxations,max_items}'");
    expect(sql).toContain("legacy compatibility only — ignored by DEC-26 engine");
    // Só age enquanto faltar alguma das duas chaves: reaplicação é no-op.
    expect(sql).toMatch(/value->'relaxations'->'steps' IS NULL/);
    expect(sql).toMatch(/value->'relaxations'->'max_items' IS NULL/);
    // E não toca em nenhum campo DEC-26.
    for (const key of ["price", "year", "mileage", "radius", "transmission", "priority_order"])
      expect(sql).not.toContain(`'{relaxations,${key}}'`);
  });

  it("traz os números normativos da §2", () => {
    expect(SEARCH_POLICY_DEFAULT.rings_auto).toEqual([0, 25, 50, 75]);
    expect(SEARCH_POLICY_DEFAULT.rings_manual).toEqual([0, 25, 50, 75]);
    expect(SEARCH_POLICY_DEFAULT.profiles.BROWSE_CITY).toEqual({ target: 20, max_auto_radius: 75 });
    // DEC-28: alvos dos perfis de produto específico, com a gradação por
    // especificidade preservada (modelo > modelo+ano > versão).
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_MODEL).toEqual({
      target: 24,
      max_auto_radius: 75,
    });
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_MODEL_YEAR).toEqual({
      target: 16,
      max_auto_radius: 75,
    });
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_VERSION).toEqual({
      target: 12,
      max_auto_radius: 75,
    });
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_MODEL.target).toBeGreaterThan(
      SEARCH_POLICY_DEFAULT.profiles.SEARCH_MODEL_YEAR.target
    );
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_MODEL_YEAR.target).toBeGreaterThan(
      SEARCH_POLICY_DEFAULT.profiles.SEARCH_VERSION.target
    );
    // DEC-29: piso regional recíproco e teto por cidade externa.
    expect(SEARCH_POLICY_DEFAULT.regional_floor_km).toBe(25);
    expect(SEARCH_POLICY_DEFAULT.city_share_cap).toBe(0.4);
    expect(SEARCH_POLICY_DEFAULT.version).toBe("v2");
    // INV-010: nenhum perfil pode passar de 75 km por automação.
    for (const p of Object.values(SEARCH_POLICY_DEFAULT.profiles))
      expect(p.max_auto_radius).toBeLessThanOrEqual(75);
    expect(SEARCH_POLICY_DEFAULT.rings_auto.includes(150)).toBe(false);
    expect(SEARCH_POLICY_DEFAULT.liquidity_cache_ttl_seconds).toBe(900);
    expect(
      new RegExp(SEARCH_POLICY_DEFAULT.explicit_query_patterns[0]).test("onix em atibaia")
    ).toBe(true);
  });

  it("a migration é idempotente (ON CONFLICT DO NOTHING) e o UPDATE de planos tem predicado", () => {
    const sql = fs.readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(/ON CONFLICT \(key\) DO NOTHING/);
    expect(sql).toMatch(
      /UPDATE subscription_plans[\s\S]*WHERE id IN \('cpf-premium-highlight', 'cnpj-evento-premium'\)/
    );
    expect(sql).toMatch(/IS DISTINCT FROM 1\.00/);
  });
});

// F2.2-B1 — a configuração é a ÚNICA fonte dos valores da DEC-26. Os números
// não podem reaparecer espalhados pelo código (DEC-26, "Natureza dos valores").
describe("relaxations — política DEC-26 na configuração", () => {
  const r = SEARCH_POLICY_DEFAULT.relaxations;

  it("traz fronteiras e quantums certificados, e nenhum degrau fixo", () => {
    expect(r.price).toEqual({ quantum: 1000, small_max_pct: 0.05, medium_max_pct: 0.1 });
    expect(r.year).toEqual({ small_max_delta: 1, medium_max_delta: 2 });
    expect(r.year.quantum).toBeUndefined(); // ano não tem quantum (DEC-26)
    expect(r.mileage).toEqual({ quantum: 5000, small_max_delta: 10000, medium_max_delta: 25000 });
    expect(r.radius).toEqual({
      quantum: 5,
      small_max_delta: 25,
      medium_max_delta: 50,
      max_km: 150,
    });
    expect(r.transmission).toEqual({ band: "GRANDE" });
    expect(r.max_options).toBe(3);
    expect(r.min_delta_to_offer).toBe(1);
    expect(r.priority_order).toEqual(["price", "year", "mileage", "radius", "transmission"]);
  });

  it("a política superada não sobrevive como chave viva", () => {
    expect(r.steps).toBeUndefined();
    expect(r.max_items).toBeUndefined();
    const json = JSON.stringify(SEARCH_POLICY_DEFAULT);
    expect(json).not.toContain("next_ring");
    expect(json).not.toContain('"price_max":0.15');
    expect(json).not.toContain('"mileage_max":0.25');
  });

  it("um search_policy com o shape ANTIGO não é utilizável como está", () => {
    const legacy = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    legacy.relaxations = {
      show_when_total_below_target: true,
      max_items: 3,
      steps: { radius: "next_ring", price_max: 0.15 },
      priority_order: ["radius", "price_max"],
    };
    expect(isValidSearchPolicy(legacy)).toBe(false);
    // …mas a BASE dele é perfeitamente válida, e é isso que o dual-read explora.
    expect(validateBaseSearchPolicy(legacy)).toBe(true);
  });
});

// ── F2.2-B1R-FIX — dual-read de configuração ────────────────────────────────
//
// A auditoria B1R mediu o custo de tratar "versão anterior conhecida" como
// "JSON corrompido": o código novo descartava a política inteira e levava
// junto TTL, facetas, target de perfil e anéis persistidos — quatro overrides
// sem relação nenhuma com a Guided Relaxation. Estes testes travam a correção
// nos dois sentidos: a base persistida sobrevive, e a política DEC-26 do
// código é a que vale.

/** Política legada realista: a que a migration 065 gravava. */
function legacyPolicy(overrides = {}) {
  const policy = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
  policy.relaxations = {
    show_when_total_below_target: true,
    max_items: 3,
    steps: {
      radius: "next_ring",
      year_from: -2,
      price_max: 0.15,
      mileage_max: 0.25,
      transmission: "remove",
      fuel: "remove",
      body_type: "remove",
      seller_kind: "remove",
    },
    priority_order: ["radius", "transmission", "price_max", "year_from", "mileage_max"],
  };
  return Object.assign(policy, overrides);
}

describe("resolveSearchPolicy — dual-read (B1R-FIX)", () => {
  it("classifica os três estados possíveis do bloco de relaxação", () => {
    expect(detectRelaxationsShape(SEARCH_POLICY_DEFAULT.relaxations)).toBe(
      RELAXATIONS_SHAPE.DEC26_VALID
    );
    expect(detectRelaxationsShape(legacyPolicy().relaxations)).toBe(RELAXATIONS_SHAPE.LEGACY_KNOWN);
    expect(detectRelaxationsShape({ isso: "não é política nenhuma" })).toBe(
      RELAXATIONS_SHAPE.INVALID_UNKNOWN
    );
    expect(detectRelaxationsShape(null)).toBe(RELAXATIONS_SHAPE.INVALID_UNKNOWN);
  });

  it("DEC-26 válido → usa o persistido como está", () => {
    const persisted = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    persisted.liquidity_cache_ttl_seconds = 1234;
    const { policy, outcome } = resolveSearchPolicy(persisted);
    expect(outcome).toBe(RELAXATIONS_SHAPE.DEC26_VALID);
    expect(policy).toBe(persisted);
  });

  it("legacy conhecido → normaliza SÓ relaxations e preserva todo o resto", () => {
    const persisted = legacyPolicy({
      liquidity_cache_ttl_seconds: 1234,
      rings_manual: [0, 10, 25, 50, 75],
    });
    persisted.facets.open_max = 5;
    persisted.profiles.BROWSE_CITY.target = 25;
    persisted.explicit_query_patterns = ["\\bteste\\s+"];

    const { policy, outcome } = resolveSearchPolicy(persisted);
    expect(outcome).toBe(RELAXATIONS_SHAPE.LEGACY_KNOWN);

    // as quatro sentinelas da auditoria B1R, mais os padrões de consulta
    expect(policy.liquidity_cache_ttl_seconds).toBe(1234);
    expect(policy.facets.open_max).toBe(5);
    expect(policy.profiles.BROWSE_CITY.target).toBe(25);
    expect(policy.rings_manual).toEqual([0, 10, 25, 50, 75]);
    expect(policy.explicit_query_patterns).toEqual(["\\bteste\\s+"]);

    // e a relaxação efetiva é a DEC-26 do código, não os degraus revogados
    expect(policy.relaxations).toEqual(SEARCH_POLICY_DEFAULT.relaxations);
    expect(policy.relaxations.steps).toBeUndefined();
    expect(policy.relaxations.price.quantum).toBe(1000);
    expect(policy.relaxations.priority_order).toEqual([
      "price",
      "year",
      "mileage",
      "radius",
      "transmission",
    ]);
  });

  it("a normalização NÃO muta o objeto persistido", () => {
    const persisted = legacyPolicy({ liquidity_cache_ttl_seconds: 1234 });
    const snapshot = JSON.parse(JSON.stringify(persisted));
    const { policy } = resolveSearchPolicy(persisted);

    expect(persisted).toEqual(snapshot); // nada mudou no original
    expect(persisted.relaxations.steps.price_max).toBe(0.15); // inclusive o legado
    expect(policy).not.toBe(persisted); // e o efetivo é outro objeto
    expect(policy.relaxations).not.toBe(persisted.relaxations);
  });

  it("base inválida ou relaxação irreconhecível → fail-safe integral", () => {
    const corrupt = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    corrupt.relaxations = { alguma_coisa: true };
    expect(resolveSearchPolicy(corrupt).policy).toBe(SEARCH_POLICY_DEFAULT);
    expect(resolveSearchPolicy(corrupt).outcome).toBe(RELAXATIONS_SHAPE.INVALID_UNKNOWN);

    const brokenBase = legacyPolicy();
    brokenBase.rings_auto = "não é array";
    expect(resolveSearchPolicy(brokenBase).policy).toBe(SEARCH_POLICY_DEFAULT);
  });

  it("a compatibilidade legada do banco NÃO dispara normalização", () => {
    // Estado pós-068/069: campos DEC-26 + steps/max_items legados juntos.
    const compat = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    compat.relaxations.max_items = 3;
    compat.relaxations.steps = { radius: "next_ring", price_max: 0.15 };
    expect(detectRelaxationsShape(compat.relaxations)).toBe(RELAXATIONS_SHAPE.DEC26_VALID);
    expect(resolveSearchPolicy(compat).policy).toBe(compat);
  });
});

describe("loadSearchPolicy — mensagens distintas por causa (B1R-FIX)", () => {
  it("legacy conhecido: warn de NORMALIZAÇÃO, política preservada", async () => {
    vi.mocked(logger.warn).mockClear();
    const persisted = legacyPolicy({ liquidity_cache_ttl_seconds: 1234 });
    vi.mocked(getSetting).mockResolvedValue(persisted);

    const policy = await loadSearchPolicy();
    expect(policy).not.toBe(SEARCH_POLICY_DEFAULT);
    expect(policy.liquidity_cache_ttl_seconds).toBe(1234);
    expect(policy.relaxations).toEqual(SEARCH_POLICY_DEFAULT.relaxations);
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("relaxations legacy"));
    expect(logger.warn).not.toHaveBeenCalledWith(
      expect.stringContaining("shape inválido — usando SEARCH_POLICY_DEFAULT")
    );
  });

  it("corrompido: warn de SHAPE INVÁLIDO, fail-safe", async () => {
    vi.mocked(logger.warn).mockClear();
    const corrupt = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    corrupt.relaxations = { lixo: 1 };
    vi.mocked(getSetting).mockResolvedValue(corrupt);

    expect(await loadSearchPolicy()).toBe(SEARCH_POLICY_DEFAULT);
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("shape inválido — usando SEARCH_POLICY_DEFAULT")
    );
    expect(logger.warn).not.toHaveBeenCalledWith(expect.stringContaining("relaxations legacy"));
  });
});

describe("loadSearchPolicy — fallback (DEFAULT §12)", () => {
  // Sem beforeEach(mockReset): com QUALQUER hook beforeEach neste arquivo o
  // vitest 2.1 passa a atribuir ao teste o throw síncrono do mock de
  // getSetting, mesmo capturado pelo try/catch de loadSearchPolicy (reproduzido
  // em 3 variantes; sem o hook, os 7 casos passam). Cada teste define a própria
  // implementação do mock, então não há vazamento entre casos.

  it("devolve o valor do banco quando o shape é válido", async () => {
    const custom = JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT));
    custom.profiles.BROWSE_CITY.target = 99;
    vi.mocked(getSetting).mockResolvedValue(custom);
    const policy = await loadSearchPolicy();
    expect(policy.profiles.BROWSE_CITY.target).toBe(99);
  });

  it("ausente → SEARCH_POLICY_DEFAULT", async () => {
    vi.mocked(getSetting).mockResolvedValue(null);
    expect(await loadSearchPolicy()).toBe(SEARCH_POLICY_DEFAULT);
  });

  it("shape inválido → SEARCH_POLICY_DEFAULT", async () => {
    vi.mocked(getSetting).mockResolvedValue({ version: "v1", profiles: {} });
    expect(await loadSearchPolicy()).toBe(SEARCH_POLICY_DEFAULT);
    expect(isValidSearchPolicy({})).toBe(false);
    expect(isValidSearchPolicy(SEARCH_POLICY_DEFAULT)).toBe(true);
  });

  it("erro de leitura → SEARCH_POLICY_DEFAULT", async () => {
    // Throw síncrono: um mock que REJEITA faz o vitest atribuir a rejeição ao
    // teste mesmo com o await dentro de try/catch. O contrato é o mesmo —
    // qualquer falha em getSetting cai no DEFAULT com warn.
    vi.mocked(getSetting).mockImplementation(() => {
      throw new Error("db offline");
    });
    expect(await loadSearchPolicy()).toBe(SEARCH_POLICY_DEFAULT);
    expect(logger.warn).toHaveBeenCalledWith(
      { err: "db offline" },
      expect.stringContaining("SEARCH_POLICY_DEFAULT")
    );
  });
});
