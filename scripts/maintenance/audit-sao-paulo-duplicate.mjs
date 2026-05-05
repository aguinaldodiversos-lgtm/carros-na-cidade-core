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

/**
 * Introspecta colunas de uma tabela via information_schema.
 * Retorna `Set<string>` com nomes das colunas (lowercase) ou `null`
 * se a tabela não existir. Usado pelas auditorias para montar SELECTs
 * apenas com colunas presentes no schema real (evita 42703 em ambientes
 * com schemas variantes — bug original do auditAds com `user_id`).
 */
async function listColumns(pg, tableName) {
  const result = await pg.query(
    `
    SELECT column_name
    FROM information_schema.columns
    WHERE table_name = $1
    `,
    [tableName]
  );
  if (result.rows.length === 0) return null;
  return new Set(result.rows.map((r) => String(r.column_name).toLowerCase()));
}

/**
 * Retorna o primeiro nome de coluna do array `candidates` que esteja
 * presente em `availableColumns`. `null` se nenhum bater.
 */
function pickFirstExisting(availableColumns, candidates) {
  if (!availableColumns) return null;
  for (const c of candidates) {
    if (availableColumns.has(String(c).toLowerCase())) return c;
  }
  return null;
}

/**
 * Parser numérico tolerante para colunas que podem voltar como `number`
 * (int) ou `string` (numeric/decimal — pg-driver mantém precisão).
 *   - `null` / `undefined` → 0 (tratado como zerado)
 *   - número finito → ele mesmo
 *   - string parseável (`"0"`, `"0.0000"`, `"12.34"`) → Number(parsed)
 *   - qualquer outro → NaN (caller decide)
 */
function parseNumeric(value) {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") return Number.isFinite(value) ? value : NaN;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed === "") return 0;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : NaN;
  }
  return NaN;
}

/**
 * Whitelist de métricas em `city_metrics` para a heurística `isZeroed`.
 *
 * **Por que whitelist?**  A heurística antiga iterava sobre TODAS as
 * colunas pulando só `id`, `city_id` e `*_at`. Em produção descobrimos
 * (2026-05-04) que isso falhava por dois motivos:
 *   1. Coluna `roi_score` é `numeric` no Postgres → driver devolve string
 *      `"0.0000"` que NÃO casava com `"0"`/`"0.00"`.
 *   2. Outras colunas auxiliares (status flags, slugs, etc) podiam ser
 *      adicionadas em migrations sem aparecer aqui — qualquer coluna
 *      não-numérica falhava silenciosamente como "não-zerado".
 *
 * Whitelist explícita é mais previsível: se a tabela ganhar uma nova
 * métrica zerável, atualiza-se este array intencionalmente.
 */
const ZEROED_METRIC_COLUMNS = Object.freeze([
  "visits",
  "leads",
  "ads_count",
  "advertisers_count",
  "conversion_rate",
  "total_leads",
  "roi_score",
  "demand_score",
  "dealer_pipeline_leads",
  "dealer_outreach_sent",
]);

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

/**
 * Lista candidatos de coluna "owner" em `ads`, na ordem de preferência
 * observada nos schemas reais do projeto.
 *
 * Schema atual de produção (2026-05-04) usa `advertiser_id`. Outros
 * schemas históricos podem ter `user_id`/`owner_id`/`account_id` — só
 * incluímos no SELECT a que existir, evitando 42703.
 */
const ADS_OWNER_COLUMN_CANDIDATES = Object.freeze([
  "advertiser_id",
  "user_id",
  "owner_id",
  "account_id",
]);

async function auditAds(pg, cityId) {
  // Introspecta colunas pra construir SELECT seguro.
  const adsColumns = await listColumns(pg, "ads");
  if (!adsColumns) {
    return { ok: false, missing: true, error: "tabela ads ausente" };
  }

  const ownerColumn = pickFirstExisting(adsColumns, ADS_OWNER_COLUMN_CANDIDATES);

  // Colunas opcionais — só incluem se existirem no schema.
  const optionalColumns = ["city", "state", "created_at", "updated_at"];
  const presentOptional = optionalColumns.filter((c) => adsColumns.has(c));

  // Sempre presentes (se ads existir, presume essas colunas centrais).
  const baseSelect = ["a.id", "a.title", "a.slug", "a.status", "a.city_id"];
  if (ownerColumn) baseSelect.push(`a.${ownerColumn} AS advertiser_id`);
  for (const c of presentOptional) baseSelect.push(`a.${c}`);

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

  const orderBy = adsColumns.has("created_at")
    ? "ORDER BY a.created_at DESC NULLS LAST, a.id DESC"
    : "ORDER BY a.id DESC";

  const result = await safeQuery(
    pg,
    `
    SELECT
      ${baseSelect.join(",\n      ")},
      (CASE WHEN ${parecePatterns} THEN true ELSE false END) AS parece_teste
    FROM ads a
    WHERE a.city_id = $1
    ${orderBy}
    `,
    params
  );
  if (!result.ok) return result;
  return { ...result, ownerColumn };
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

  // Heurística "zerada" via whitelist de métricas conhecidas (ZEROED_METRIC_COLUMNS).
  // Toda métrica é parseada com parseNumeric (tolerante a `numeric` vindo
  // como string do driver pg). Se uma métrica esperada nem existe no row,
  // tratamos como zero (ausência == sem valor não-zero).
  const isZeroed = result.rows.every((row) => {
    return ZEROED_METRIC_COLUMNS.every((col) => {
      if (!(col in row)) return true; // coluna ausente == sem dado positivo
      const n = parseNumeric(row[col]);
      if (Number.isNaN(n)) return false; // valor não-parseável → não-zerado
      return n === 0;
    });
  });

  return { ok: true, rows: result.rows, isZeroed };
}

/**
 * Auditoria de `city_status`. Tabela operacional com flags de estado
 * por cidade (descoberta no relatório de FKs como tendo refs leves).
 * Lista crua das linhas para id=1 e id=5278 — sem classificação
 * automática (operador decide caso a caso).
 */
async function auditCityStatus(pg, cityId) {
  const cols = await listColumns(pg, "city_status");
  if (!cols) {
    return { ok: false, missing: true, error: "tabela city_status ausente" };
  }
  const result = await safeQuery(
    pg,
    `SELECT * FROM city_status WHERE city_id = $1`,
    [cityId]
  );
  return result;
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
  const cols = await listColumns(pg, "region_memberships");
  if (!cols) {
    return { ok: false, missing: true, error: "tabela region_memberships ausente" };
  }

  // base_city_id e member_city_id são pré-condição: a tabela representa
  // pares (base, member); sem alguma das duas, não há o que auditar.
  if (!cols.has("base_city_id") || !cols.has("member_city_id")) {
    return {
      ok: false,
      missing: true,
      error: "region_memberships não tem base_city_id/member_city_id — schema incompatível",
    };
  }

  // Colunas opcionais — só incluem se existirem.
  const optional = ["radius_km", "distance_km", "created_at", "updated_at"];
  const presentOptional = optional.filter((c) => cols.has(c));

  // Identificador da linha: usa `id` se existir; senão ROW_NUMBER.
  const hasId = cols.has("id");
  const idExpr = hasId
    ? "rm.id AS id"
    : "ROW_NUMBER() OVER (ORDER BY rm.base_city_id, rm.member_city_id) AS row_no";

  const baseSelect = [
    idExpr,
    "rm.base_city_id",
    "rm.member_city_id",
    ...presentOptional.map((c) => `rm.${c}`),
    "cb.name  AS base_name",
    "cb.slug  AS base_slug",
    "cb.state AS base_state",
    "cm.name  AS member_name",
    "cm.slug  AS member_slug",
    "cm.state AS member_state",
  ];

  const orderBy = hasId
    ? "ORDER BY rm.id"
    : "ORDER BY rm.base_city_id, rm.member_city_id";

  const result = await safeQuery(
    pg,
    `
    SELECT
      ${baseSelect.join(",\n      ")}
    FROM region_memberships rm
    LEFT JOIN cities cb ON cb.id = rm.base_city_id
    LEFT JOIN cities cm ON cm.id = rm.member_city_id
    WHERE rm.base_city_id = $1 OR rm.member_city_id = $1
    ${orderBy}
    `,
    [cityId]
  );
  if (!result.ok) return result;
  return { ...result, hasId };
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
  const context = [];

  // Contexto auxiliar — incluído nos `reasons` mesmo quando o cenário D
  // vence, para o operador ver de uma vez TUDO o que precisa endereçar.
  const ads1 = findings.ads?.id1?.rows || [];
  const testAds = ads1.filter((a) => a.parece_teste);
  if (testAds.length > 0) {
    context.push(
      `ads de teste em city_id=1: ${testAds.length} (${testAds.map((a) => `id=${a.id}`).join(", ")})`
    );
  }
  const cm1 = findings.city_metrics?.id1;
  if (cm1?.ok && cm1.rows.length > 0) {
    context.push(`city_metrics city_id=1: ${cm1.rows.length} (zerada=${cm1.isZeroed})`);
  }
  const cs1 = findings.city_status?.id1;
  if (cs1?.ok && cs1.rows.length > 0) {
    context.push(`city_status city_id=1: ${cs1.rows.length} linha(s)`);
  }
  const rm1ctx = findings.region_memberships?.id1;
  if (rm1ctx?.ok && rm1ctx.rows.length > 0) {
    context.push(`region_memberships referenciando city_id=1: ${rm1ctx.rows.length}`);
  }

  // D — paid event ou price > 0
  const sensitiveEvents = (findings.events?.id1?.rows || []).filter((r) => r.sensivel);
  if (sensitiveEvents.length > 0) {
    reasons.push(`events sensíveis em city_id=1: ${sensitiveEvents.length}`);
    for (const c of context) reasons.push(c);
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

  // B — ads não-teste em city_id=1 (reusa `ads1` definido no início)
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
    log(
      "info",
      `ads city_id=${BROKEN_ID}: ${ads1.rows.length} (${testCount} parecem teste; owner_column=${ads1.ownerColumn ?? "<ausente>"})`
    );
    for (const a of ads1.rows) {
      log(
        "info",
        `  ad id=${a.id} title=${JSON.stringify(a.title)} status=${a.status} advertiser_id=${a.advertiser_id ?? "—"} parece_teste=${a.parece_teste}`
      );
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
    log(
      "info",
      `region_memberships city_id=${BROKEN_ID}: ${rm1.rows.length} (id_column=${rm1.hasId ? "id" : "row_no"})`
    );
    for (const r of rm1.rows) {
      const ident = r.id ?? r.row_no;
      const base = `${r.base_name ?? "?"}/${r.base_slug ?? "?"}/${r.base_state ?? "?"}`;
      const member = `${r.member_name ?? "?"}/${r.member_slug ?? "?"}/${r.member_state ?? "?"}`;
      log(
        "info",
        `  rm ${rm1.hasId ? "id" : "row_no"}=${ident} base=${r.base_city_id} (${base}) member=${r.member_city_id} (${member}) radius=${r.radius_km ?? "—"} dist=${r.distance_km ?? "—"}`
      );
    }
  } else if (rm1.missing) {
    log("info", `region_memberships ausente/incompatível (skip): ${rm1.error ?? ""}`);
  }

  // city_status — auditoria sem classificação automática.
  const cs1 = await auditCityStatus(pg, BROKEN_ID);
  const cs5278 = await auditCityStatus(pg, CANONICAL_ID);
  if (cs1.ok) {
    log("info", `city_status city_id=${BROKEN_ID}: ${cs1.rows.length}`);
    for (const r of cs1.rows) {
      log("info", `  city_status row=${JSON.stringify(r)}`);
    }
  } else if (cs1.missing) {
    log("info", `city_status ausente/skip: ${cs1.error ?? ""}`);
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
    city_status: { id1: cs1, id5278: cs5278 },
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
