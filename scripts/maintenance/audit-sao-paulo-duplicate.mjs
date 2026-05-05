#!/usr/bin/env node
/**
 * Auditoria automática da duplicidade de São Paulo em `cities`.
 *
 * Read-only por construção. Executa apenas SELECTs, gera relatório no
 * console e (opcionalmente) salva JSON em `reports/sao-paulo-duplicate-audit.json`
 * se a pasta `reports/` existir. Substitui o checklist manual de
 * `docs/runbooks/cities-sao-paulo-duplicate-cleanup.md §2` para reduzir
 * erro de cópia/colar no Render Shell.
 *
 * Uso:
 *
 *   node scripts/maintenance/audit-sao-paulo-duplicate.mjs
 *   node scripts/maintenance/audit-sao-paulo-duplicate.mjs --json   # força salvar JSON mesmo sem reports/
 *
 * Saída (resumida):
 *
 *   [audit-sao-paulo] cidades: id=1 broken, id=5278 canonical
 *   [audit-sao-paulo] ads city_id=1 → 2 (todos parecem teste)
 *   [audit-sao-paulo] events city_id=1 → 1 (status=paid → SENSÍVEL)
 *   [audit-sao-paulo] region_memberships city_id=1 → N (CONFLITO)
 *   [audit-sao-paulo] CENÁRIO RECOMENDADO: D (decisão manual obrigatória)
 *
 * Trava: NÃO executa INSERT/UPDATE/DELETE. Não chama o bootstrap. Só
 * lê do banco e imprime/grava o resultado.
 */

import fs from "node:fs";
import path from "node:path";

import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const BROKEN_ID = 1;
const CANONICAL_ID = 5278;
const REPORT_DIR = "reports";
const REPORT_FILE = "sao-paulo-duplicate-audit.json";

const TEST_TITLE_PATTERNS = [
  "%test%",
  "%teste%",
  "%seed%",
  "%deploymodel%",
];
const TEST_SLUG_PATTERNS = ["%test%", "%teste%", "%seed%"];

export function parseArgs(argv) {
  const args = { json: false };
  for (const raw of argv.slice(2)) {
    if (raw === "--json") args.json = true;
  }
  return args;
}

function defaultLog(level, message, meta) {
  const prefix = "[audit-sao-paulo]";
  const line = meta !== undefined ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

/**
 * Tenta executar uma query; se a tabela/coluna não existe, retorna
 * `{ ok: false, missing: true, error }` em vez de throw. Outros erros
 * propagam. Mantém a auditoria robusta a schemas variáveis sem mascarar
 * bugs reais.
 */
async function safeQuery(pg, sql, params = []) {
  try {
    const result = await pg.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (error) {
    const code = error?.code;
    // 42P01 = undefined_table; 42703 = undefined_column
    if (code === "42P01" || code === "42703") {
      return { ok: false, missing: true, error: error.message };
    }
    throw error;
  }
}

async function auditCities(pg) {
  const result = await pg.query(
    `
    SELECT id, name, state, slug, normalized_name, ibge_code, is_active
    FROM cities
    WHERE id IN ($1, $2)
       OR slug = 'sao-paulo-sp'
       OR normalized_name ILIKE 'sao paulo'
       OR normalized_name ILIKE 'sæo paulo'
    ORDER BY id
    `,
    [BROKEN_ID, CANONICAL_ID]
  );
  return result.rows;
}

async function auditAds(pg, cityId) {
  // Ads com classificação de "parece teste" via OR de patterns.
  const titleClauses = TEST_TITLE_PATTERNS.map(
    (_, i) => `LOWER(COALESCE(a.title, '')) ILIKE $${i + 2}`
  );
  const slugStart = TEST_TITLE_PATTERNS.length + 2;
  const slugClauses = TEST_SLUG_PATTERNS.map(
    (_, i) => `LOWER(COALESCE(a.slug, '')) ILIKE $${slugStart + i}`
  );
  const parecePatterns = [...titleClauses, ...slugClauses].join(" OR ");

  const params = [cityId, ...TEST_TITLE_PATTERNS, ...TEST_SLUG_PATTERNS];

  const result = await safeQuery(
    pg,
    `
    SELECT
      a.id,
      a.title,
      a.slug,
      a.status,
      a.city_id,
      a.user_id,
      a.created_at,
      (CASE WHEN ${parecePatterns} THEN true ELSE false END) AS parece_teste
    FROM ads a
    WHERE a.city_id = $1
    ORDER BY a.created_at DESC NULLS LAST, a.id DESC
    `,
    params
  );
  return result;
}

async function auditCityMetrics(pg, cityId) {
  const result = await safeQuery(
    pg,
    `
    SELECT *
    FROM city_metrics
    WHERE city_id = $1
    `,
    [cityId]
  );
  if (!result.ok) return result;

  // Heurística de "zerado": todas as métricas numéricas são 0/null.
  const isZeroed = result.rows.every((row) => {
    return Object.entries(row).every(([key, value]) => {
      if (key === "id" || key === "city_id" || key.endsWith("_at")) return true;
      if (value === null || value === 0) return true;
      if (typeof value === "string" && (value === "0" || value === "0.00")) return true;
      return false;
    });
  });

  return { ok: true, rows: result.rows, isZeroed };
}

async function auditEvents(pg, cityId) {
  // events pode ter colunas variáveis; safeQuery lida com ausência.
  const result = await safeQuery(
    pg,
    `
    SELECT
      id,
      city_id,
      title,
      status,
      payment_status,
      price,
      created_at
    FROM events
    WHERE city_id = $1
    ORDER BY created_at DESC NULLS LAST, id DESC
    `,
    [cityId]
  );
  if (!result.ok) return result;

  const annotated = result.rows.map((row) => ({
    ...row,
    sensivel:
      String(row.status || "").toLowerCase() === "paid" ||
      String(row.payment_status || "").toLowerCase() === "paid" ||
      Number(row.price) > 0,
  }));
  return { ok: true, rows: annotated };
}

async function auditRegionMemberships(pg, cityId) {
  // region_memberships tem nomes de coluna específicos do projeto;
  // tentar shape canônico. Se não existir, safeQuery devolve missing=true.
  const result = await safeQuery(
    pg,
    `
    SELECT
      id,
      base_city_id,
      member_city_id,
      radius_km,
      distance_km,
      created_at,
      updated_at
    FROM region_memberships
    WHERE base_city_id = $1 OR member_city_id = $1
    ORDER BY id
    `,
    [cityId]
  );
  return result;
}

async function listForeignKeysReferencingCities(pg) {
  // Mapeia dinamicamente todas as FKs apontando pra cities(id).
  // Mais robusto que lista hardcoded — pega tabelas que ninguém lembrou.
  const result = await pg.query(
    `
    SELECT
      conrelid::regclass::text AS table_name,
      a.attname AS column_name
    FROM pg_constraint c
    JOIN pg_attribute a
      ON a.attrelid = c.conrelid
     AND a.attnum = ANY(c.conkey)
    WHERE c.contype = 'f'
      AND c.confrelid = 'cities'::regclass
    ORDER BY table_name, column_name
    `
  );
  return result.rows;
}

async function countRefsByFk(pg, tableName, columnName) {
  // Identificadores não podem ser parametrizados — quote manualmente
  // após validação de formato.
  if (!/^[\w."]+$/.test(tableName) || !/^\w+$/.test(columnName)) {
    return { ok: false, missing: false, error: "invalid_identifier" };
  }
  const result = await safeQuery(
    pg,
    `
    SELECT
      SUM(CASE WHEN ${columnName} = $1 THEN 1 ELSE 0 END)::int AS count_id_1,
      SUM(CASE WHEN ${columnName} = $2 THEN 1 ELSE 0 END)::int AS count_id_5278
    FROM ${tableName}
    `,
    [BROKEN_ID, CANONICAL_ID]
  );
  if (!result.ok) return result;
  const row = result.rows[0] || { count_id_1: 0, count_id_5278: 0 };
  return {
    ok: true,
    table_name: tableName,
    column_name: columnName,
    count_id_1: row.count_id_1 || 0,
    count_id_5278: row.count_id_5278 || 0,
  };
}

/**
 * Classifica o cenário de cleanup com base nos achados.
 *
 *   D = SENSÍVEL: tem evento paid OU referência sensível → decisão manual
 *   C = REFS FORTES: region_memberships com city_id=1 OU outras FKs significativas
 *   B = ADS REAIS: city_id=1 tem ad NÃO marcado como teste
 *   A = SÓ TESTES: ads são todos teste E city_metrics zerada/ausente E sem refs fortes
 *
 * Ordem de prioridade: D > C > B > A. D é absorvente.
 */
export function classifyScenario(findings) {
  const reasons = [];

  // D — paid event ou price > 0
  const sensitiveEvents = (findings.events?.id1?.rows || []).filter((r) => r.sensivel);
  if (sensitiveEvents.length > 0) {
    reasons.push(`events sensíveis em city_id=1: ${sensitiveEvents.length}`);
    return { scenario: "D", reasons };
  }

  // C — region_memberships com id=1
  const rm = findings.region_memberships?.id1;
  if (rm?.ok && rm.rows.length > 0) {
    reasons.push(`region_memberships referenciando city_id=1: ${rm.rows.length}`);
    return { scenario: "C", reasons };
  }

  // C — outras FKs (além de ads, city_metrics, events) com count_id_1 > 0
  const ignoredTables = new Set(["ads", "city_metrics", "events"]);
  const otherRefs = (findings.fkRefs || []).filter(
    (r) => r.ok && r.count_id_1 > 0 && !ignoredTables.has(r.table_name)
  );
  if (otherRefs.length > 0) {
    reasons.push(
      `refs adicionais em FKs: ${otherRefs.map((r) => `${r.table_name}.${r.column_name}=${r.count_id_1}`).join(", ")}`
    );
    return { scenario: "C", reasons };
  }

  // B — ads não-teste em city_id=1
  const ads1 = findings.ads?.id1?.rows || [];
  const realAds = ads1.filter((a) => !a.parece_teste);
  if (realAds.length > 0) {
    reasons.push(`ads reais (não-teste) em city_id=1: ${realAds.length}`);
    return { scenario: "B", reasons };
  }

  // A — só testes + metrics zerada/ausente
  const metricsOk =
    !findings.city_metrics?.id1?.ok ||
    findings.city_metrics.id1.rows.length === 0 ||
    findings.city_metrics.id1.isZeroed;
  if (ads1.length > 0 && ads1.every((a) => a.parece_teste) && metricsOk) {
    reasons.push("todos os ads de city_id=1 parecem teste; metrics zerada/ausente");
    return { scenario: "A", reasons };
  }

  reasons.push("nenhum critério positivo casou — manter scenario indefinido");
  return { scenario: "indefinido", reasons };
}

/**
 * Lógica core — recebe deps via injeção pra ser testável sem banco real.
 */
export async function runAudit({ pg = pool, log = defaultLog } = {}) {
  log("info", "iniciando auditoria read-only", { broken_id: BROKEN_ID, canonical_id: CANONICAL_ID });

  const cities = await auditCities(pg);
  log("info", `cidades encontradas: ${cities.length}`, { ids: cities.map((c) => c.id) });

  const ads1 = await auditAds(pg, BROKEN_ID);
  const ads5278 = await auditAds(pg, CANONICAL_ID);

  if (ads1.ok) {
    const testCount = ads1.rows.filter((a) => a.parece_teste).length;
    log("info", `ads city_id=${BROKEN_ID}: ${ads1.rows.length} (${testCount} parecem teste)`);
    for (const a of ads1.rows) {
      log("info", `  ad id=${a.id} title=${JSON.stringify(a.title)} status=${a.status} parece_teste=${a.parece_teste}`);
    }
  } else {
    log("error", `ads não auditável: ${ads1.error}`);
  }
  if (ads5278.ok) {
    log("info", `ads city_id=${CANONICAL_ID}: ${ads5278.rows.length}`);
  }

  const cm1 = await auditCityMetrics(pg, BROKEN_ID);
  const cm5278 = await auditCityMetrics(pg, CANONICAL_ID);
  if (cm1.ok) {
    log("info", `city_metrics city_id=${BROKEN_ID}: ${cm1.rows.length} (zerada=${cm1.isZeroed})`);
  } else if (cm1.missing) {
    log("info", `city_metrics ausente do schema (skip)`);
  }

  const ev1 = await auditEvents(pg, BROKEN_ID);
  const ev5278 = await auditEvents(pg, CANONICAL_ID);
  if (ev1.ok) {
    const sensiveis = ev1.rows.filter((e) => e.sensivel).length;
    log("info", `events city_id=${BROKEN_ID}: ${ev1.rows.length} (${sensiveis} SENSÍVEIS)`);
    for (const e of ev1.rows) {
      log(
        e.sensivel ? "error" : "info",
        `  event id=${e.id} title=${JSON.stringify(e.title)} status=${e.status} payment_status=${e.payment_status} price=${e.price}${e.sensivel ? " ← SENSÍVEL" : ""}`
      );
    }
  } else if (ev1.missing) {
    log("info", `events ausente do schema (skip)`);
  }

  const rm1 = await auditRegionMemberships(pg, BROKEN_ID);
  const rm5278 = await auditRegionMemberships(pg, CANONICAL_ID);
  if (rm1.ok) {
    log("info", `region_memberships city_id=${BROKEN_ID}: ${rm1.rows.length}`);
    for (const r of rm1.rows) {
      log("info", `  rm id=${r.id} base=${r.base_city_id} member=${r.member_city_id} radius=${r.radius_km} dist=${r.distance_km}`);
    }
  } else if (rm1.missing) {
    log("info", `region_memberships ausente do schema (skip)`);
  }

  // Mapeamento dinâmico de FKs e contagens
  const fks = await listForeignKeysReferencingCities(pg);
  log("info", `FKs apontando para cities: ${fks.length}`);
  const fkRefs = [];
  for (const fk of fks) {
    const counts = await countRefsByFk(pg, fk.table_name, fk.column_name);
    if (counts.ok) {
      fkRefs.push(counts);
      log(
        "info",
        `  ${counts.table_name}.${counts.column_name} → id=1: ${counts.count_id_1} | id=5278: ${counts.count_id_5278}`
      );
    } else if (counts.missing) {
      log("info", `  ${fk.table_name}.${fk.column_name} → tabela/coluna ausente (skip)`);
    } else {
      log("error", `  ${fk.table_name}.${fk.column_name} → erro: ${counts.error}`);
    }
  }

  const findings = {
    cities,
    ads: { id1: ads1, id5278: ads5278 },
    city_metrics: { id1: cm1, id5278: cm5278 },
    events: { id1: ev1, id5278: ev5278 },
    region_memberships: { id1: rm1, id5278: rm5278 },
    fkRefs,
  };

  const classification = classifyScenario(findings);
  log("info", `─────────────────────────────────────────────`);
  log("info", `CENÁRIO RECOMENDADO: ${classification.scenario}`);
  for (const r of classification.reasons) {
    log("info", `  motivo: ${r}`);
  }

  return { findings, classification };
}

function maybeWriteReport({ findings, classification, force = false }) {
  const dir = path.resolve(process.cwd(), REPORT_DIR);
  if (!force && !fs.existsSync(dir)) return null;
  if (force) fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, REPORT_FILE);
  const payload = {
    generated_at: new Date().toISOString(),
    classification,
    findings,
  };
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
  return file;
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  const args = parseArgs(process.argv);
  try {
    const result = await runAudit();
    const reportFile = maybeWriteReport({
      findings: result.findings,
      classification: result.classification,
      force: args.json,
    });
    if (reportFile) {
      defaultLog("info", `relatório salvo em ${reportFile}`);
    }
    process.exitCode = 0;
  } catch (err) {
    defaultLog("error", `FATAL: ${err?.message || err}`);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
