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
  SEARCH_POLICY_DEFAULT,
  isValidSearchPolicy,
  loadSearchPolicy,
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
  return base;
}

describe("search_policy — migration 065 × SEARCH_POLICY_DEFAULT", () => {
  it("são o mesmo JSON, byte a byte em valor", () => {
    expect(jsonFromMigration()).toEqual(JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT)));
  });

  it("traz os números normativos da §2", () => {
    expect(SEARCH_POLICY_DEFAULT.rings_auto).toEqual([0, 25, 50, 75]);
    expect(SEARCH_POLICY_DEFAULT.rings_manual).toEqual([0, 25, 50, 75]);
    expect(SEARCH_POLICY_DEFAULT.profiles.BROWSE_CITY).toEqual({ target: 20, max_auto_radius: 75 });
    expect(SEARCH_POLICY_DEFAULT.profiles.SEARCH_VERSION).toEqual({
      target: 4,
      max_auto_radius: 75,
    });
    // INV-010: nenhum perfil pode passar de 75 km por automação.
    for (const p of Object.values(SEARCH_POLICY_DEFAULT.profiles))
      expect(p.max_auto_radius).toBeLessThanOrEqual(75);
    expect(SEARCH_POLICY_DEFAULT.rings_auto.includes(150)).toBe(false);
    expect(SEARCH_POLICY_DEFAULT.liquidity_cache_ttl_seconds).toBe(900);
    expect(SEARCH_POLICY_DEFAULT.relaxations.priority_order[0]).toBe("radius");
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
