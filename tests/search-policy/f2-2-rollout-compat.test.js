// tests/search-policy/f2-2-rollout-compat.test.js
//
// F2.2-B1R-FIX — compatibilidade de rollout/rollback da configuração.
//
// A auditoria B1R mediu dois buracos que não apareciam em nenhum teste porque
// todos injetavam a política em memória, já no formato certo:
//
//   código novo × config antiga → política inteira descartada; TTL, facetas,
//     target de perfil e anéis persistidos voltavam ao default sem que o log
//     dissesse o quê se perdeu;
//   código antigo × config nova → o motor anterior lê `relaxations.steps`, não
//     encontrava a chave e devolvia ZERO concessões, sem uma linha de log.
//
// Estes testes travam a correção nas duas direções. O quadrante "código
// antigo" é representado pelo CONTRATO que aquele código lê (`steps` e
// `max_items` presentes com os valores históricos), porque o código antigo em
// si não existe mais nesta árvore — quem o executa de verdade é o harness de
// dois checkouts da auditoria.

import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RELAXATIONS_SHAPE,
  SEARCH_POLICY_DEFAULT,
  detectRelaxationsShape,
  resolveSearchPolicy,
} from "../../src/modules/ads/search-policy/policy-config.js";
import { buildRelaxationVariants } from "../../src/modules/ads/search-policy/relaxations.js";
import { GEO_MODE } from "../../src/modules/ads/search-policy/scope-resolver.js";

const here = path.dirname(fileURLToPath(import.meta.url));
const migration = (name) =>
  fs.readFileSync(path.resolve(here, `../../src/database/migrations/${name}`), "utf8");

/** O JSON que a 065 gravava — a configuração que o código anterior espera. */
const LEGACY_STEPS = Object.freeze({
  radius: "next_ring",
  year_from: -2,
  price_max: 0.15,
  mileage_max: 0.25,
  transmission: "remove",
  fuel: "remove",
  body_type: "remove",
  seller_kind: "remove",
});

/** Overrides sentinela da auditoria B1R, em chaves sem relação com relaxação. */
function withSentinels(policy) {
  const copy = JSON.parse(JSON.stringify(policy));
  copy.liquidity_cache_ttl_seconds = 1234;
  copy.facets.open_max = 5;
  copy.profiles.BROWSE_CITY.target = 25;
  copy.rings_manual = [0, 10, 25, 50, 75];
  return copy;
}

function configOld() {
  const policy = withSentinels(SEARCH_POLICY_DEFAULT);
  policy.relaxations = {
    show_when_total_below_target: true,
    max_items: 3,
    steps: { ...LEGACY_STEPS },
    priority_order: ["radius", "transmission", "price_max", "year_from", "mileage_max"],
  };
  return policy;
}

/** Estado pós-068/069: DEC-26 vigente + contrato legado ao lado. */
function configNewCompat() {
  const policy = withSentinels(SEARCH_POLICY_DEFAULT);
  policy.relaxations = {
    ...JSON.parse(JSON.stringify(SEARCH_POLICY_DEFAULT.relaxations)),
    max_items: 3,
    steps: { ...LEGACY_STEPS },
  };
  return policy;
}

const SENTINELS = (policy) => ({
  ttl: policy.liquidity_cache_ttl_seconds,
  open_max: policy.facets.open_max,
  browse_target: policy.profiles.BROWSE_CITY.target,
  rings_manual: policy.rings_manual,
});
const EXPECTED_SENTINELS = {
  ttl: 1234,
  open_max: 5,
  browse_target: 25,
  rings_manual: [0, 10, 25, 50, 75],
};

describe("B1R-FIX — matriz de rollout", () => {
  it("Q1 código antigo × CONFIG-OLD: o contrato legado está inteiro", () => {
    const policy = configOld();
    expect(policy.relaxations.steps).toEqual(LEGACY_STEPS);
    expect(policy.relaxations.max_items).toBe(3);
    expect(SENTINELS(policy)).toEqual(EXPECTED_SENTINELS);
  });

  it("Q2 código novo × CONFIG-OLD: normaliza só relaxations, preserva 4/4 sentinelas", () => {
    const persisted = configOld();
    const { policy, outcome } = resolveSearchPolicy(persisted);

    expect(outcome).toBe(RELAXATIONS_SHAPE.LEGACY_KNOWN);
    expect(policy).not.toBe(SEARCH_POLICY_DEFAULT); // nada de fallback total
    expect(SENTINELS(policy)).toEqual(EXPECTED_SENTINELS);
    expect(policy.relaxations).toEqual(SEARCH_POLICY_DEFAULT.relaxations);
    // os degraus revogados não voltam a ser política
    expect(policy.relaxations.steps).toBeUndefined();
    expect(policy.relaxations.price.quantum).toBe(1000);
  });

  it("Q3 código antigo × CONFIG-NEW-COMPAT: o contrato que o motor antigo lê existe", () => {
    const policy = configNewCompat();
    // é exatamente isto que `buildRelaxationVariants` do f0e7a999 consulta
    expect(policy.relaxations?.steps).toEqual(LEGACY_STEPS);
    expect(policy.relaxations.steps.price_max).toBe(0.15);
    expect(policy.relaxations.steps.year_from).toBe(-2);
    expect(policy.relaxations.steps.radius).toBe("next_ring");
    expect(Number(policy.relaxations.max_items) || 3).toBe(3);
    expect(policy.relaxations.show_when_total_below_target).toBe(true);
    expect(SENTINELS(policy)).toEqual(EXPECTED_SENTINELS);
  });

  it("Q4 código novo × CONFIG-NEW-COMPAT: usa o persistido, sem warning legacy", () => {
    const persisted = configNewCompat();
    const { policy, outcome } = resolveSearchPolicy(persisted);

    expect(outcome).toBe(RELAXATIONS_SHAPE.DEC26_VALID);
    expect(policy).toBe(persisted); // nada normalizado, nada descartado
    expect(SENTINELS(policy)).toEqual(EXPECTED_SENTINELS);
    // o motor novo ignora as chaves legadas: a política efetiva é DEC-26
    expect(policy.relaxations.priority_order).toEqual([
      "price",
      "year",
      "mileage",
      "radius",
      "transmission",
    ]);
    expect(policy.relaxations.max_options).toBe(3);
  });

  it("roll-forward: o mesmo objeto atravessa antigo → novo sem migrar nada de novo", () => {
    const persisted = configNewCompat();
    const snapshot = JSON.parse(JSON.stringify(persisted));

    // passagem do código antigo: só lê
    expect(persisted.relaxations.steps).toEqual(LEGACY_STEPS);
    // passagem do código novo: resolve sem tocar
    const { policy } = resolveSearchPolicy(persisted);
    expect(policy.relaxations.max_options).toBe(3);

    expect(persisted).toEqual(snapshot);
  });

  it("as migrations 068 e 069 gravam o contrato que o Q3 exige", () => {
    const sql068 = migration("068_search_policy_guided_relaxation_dec26.sql");
    const sql069 = migration("069_search_policy_relaxation_compat.sql");
    for (const sql of [sql068, sql069]) {
      expect(sql).toContain("legacy compatibility only — ignored by DEC-26 engine");
      expect(sql).toContain('"next_ring"');
    }
    // A 068 grava o bloco inteiro; a 069 acrescenta os dois caminhos que faltam.
    expect(sql068).toContain('"max_items": 3');
    expect(sql069).toContain("'{relaxations,max_items}'");
    expect(sql069).toContain("'{relaxations,steps}'");
    // e a 068 continua trazendo os campos DEC-26
    for (const key of ["max_options", "min_delta_to_offer", "small_max_pct", "priority_order"])
      expect(sql068).toContain(key);
  });

  // Sem este teste a compatibilidade seria só uma promessa de comentário: a
  // prova por mutação mostrou que trocar o boundary real pelo degrau de
  // `steps` não quebrava teste nenhum, porque nenhum deles jamais entregava ao
  // motor uma política que tivesse as duas coisas ao mesmo tempo.
  it("o motor DEC-26 IGNORA `steps` mesmo quando ele está na política", () => {
    const policy = configNewCompat();
    expect(policy.relaxations.steps.price_max).toBe(0.15);
    expect(policy.relaxations.steps.mileage_max).toBe(0.25);
    expect(policy.relaxations.steps.year_from).toBe(-2);

    const ctx = {
      filters: { price_max: 75000, mileage_max: 80000, year_from: 2018 },
      origin: { id: 1, slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      uf: "SP",
      intent: { profile: "SEARCH_MODEL", target: 12, max_auto_radius: 75 },
    };
    const scope = { geo_mode: GEO_MODE.AUTO_RADIUS, effective_radius_km: 25, liquidityRows: [] };
    const variants = buildRelaxationVariants(ctx, scope, policy, {
      price_boundary: 78900,
      mileage_boundary: 81000,
      year_boundary: 2017,
    });
    const by = Object.fromEntries(variants.map((v) => [v.dimension, v]));

    // Boundary real arredondado ao quantum — não o degrau legado.
    expect(by.price.applied_value).toBe(79000);
    expect(by.price.applied_value).not.toBe(Math.ceil((75000 * 1.15) / 1000) * 1000); // 87000
    expect(by.mileage.applied_value).toBe(85000);
    expect(by.mileage.applied_value).not.toBe(Math.ceil((80000 * 1.25) / 5000) * 5000); // 100000
    expect(by.year.applied_value).toBe(2017);
    expect(by.year.applied_value).not.toBe(2016); // o −2 fixo

    // E o mesmo vale se a política tiver SÓ os degraus legados: a normalização
    // do dual-read já trocou o bloco antes de o motor ver qualquer coisa.
    const { policy: normalized } = resolveSearchPolicy(configOld());
    const fromLegacy = buildRelaxationVariants(ctx, scope, normalized, {
      price_boundary: 78900,
    });
    expect(fromLegacy.find((v) => v.dimension === "price").applied_value).toBe(79000);
  });

  it("a detecção de shape não confunde compat com legado nem com corrupção", () => {
    expect(detectRelaxationsShape(configOld().relaxations)).toBe(RELAXATIONS_SHAPE.LEGACY_KNOWN);
    expect(detectRelaxationsShape(configNewCompat().relaxations)).toBe(
      RELAXATIONS_SHAPE.DEC26_VALID
    );
    expect(detectRelaxationsShape({ show_when_total_below_target: true })).toBe(
      RELAXATIONS_SHAPE.INVALID_UNKNOWN
    );
  });
});
