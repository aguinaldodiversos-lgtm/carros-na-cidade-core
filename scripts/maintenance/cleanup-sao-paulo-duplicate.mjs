#!/usr/bin/env node
/**
 * Cleanup controlado da duplicidade de São Paulo (cities.id=1 quebrado
 * vs cities.id=5278 canônico).
 *
 * **PADRÃO É DRY-RUN.** Persistência exige `--scenario=<X>` E `--yes`
 * EXPLICITAMENTE. Sem `--scenario`, aborta com usage. Sem `--yes`,
 * imprime os SQLs que SERIAM executados + plano de rollback +
 * snapshot do estado atual (read-only).
 *
 * Cenários suportados:
 *
 *   --scenario=archive-test-data
 *     Arquiva ads de teste (id IN (9, 80)) que ainda estão `active` e
 *     com `city_id=1` e batem com classificação `parece_teste`. NÃO mexe
 *     em cities, NÃO mexe em events paid, NÃO mexe em region_memberships.
 *     Aborta com `--yes` se houver evento paid ou region_memberships
 *     referenciando city_id=1 — refs fortes exigem cenário próprio.
 *
 *   --scenario=confirmed-test-data-cleanup
 *     Cleanup completo de TODOS os vestígios do registro quebrado de
 *     São Paulo, dado que o operador confirmou via flags explícitas
 *     (--confirm-event-id, --confirm-broken-city-id,
 *     --confirm-canonical-city-id) que o evento paid é teste
 *     operacional e os ads/metrics/status/region_memberships são seed
 *     de desenvolvimento. Inativa cities.id=1 (NÃO deleta), neutraliza
 *     evento de teste, arquiva ads, remove métricas/status zerados e
 *     a linha autorreferente em region_memberships. Pré-condições
 *     rigorosas + snapshot JSON antes de qualquer escrita.
 *
 * Uso:
 *
 *   # Dry-run obrigatório (default):
 *   node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=archive-test-data
 *
 *   # Cleanup confirmado em dry-run:
 *   node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs \
 *     --scenario=confirmed-test-data-cleanup \
 *     --confirm-event-id=4 \
 *     --confirm-broken-city-id=1 \
 *     --confirm-canonical-city-id=5278
 *
 *   # Execução real (após auditoria + revisão):
 *   node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs \
 *     --scenario=confirmed-test-data-cleanup \
 *     --confirm-event-id=4 \
 *     --confirm-broken-city-id=1 \
 *     --confirm-canonical-city-id=5278 \
 *     --yes
 *
 * Travas:
 *   - Não DELETE físico em `cities` (apenas is_active=false em id=1).
 *   - Não altera cities.id=5278.
 *   - Não tenta UPDATE slug='sao-paulo-sp' WHERE id=1 (quebra UNIQUE).
 *   - Re-valida invariantes ANTES de qualquer escrita.
 *   - Captura snapshot JSON em reports/ pré-tx para rollback manual.
 *   - Em erro dentro da transação, ROLLBACK automático.
 */

import fs from "node:fs";
import path from "node:path";

import { pool, closeDatabasePool } from "../../src/infrastructure/database/db.js";

const BROKEN_ID = 1;
const CANONICAL_ID = 5278;
const EXPECTED_TEST_AD_IDS = [9, 80];
const EXPECTED_EVENT_ID = 4;
const EXPECTED_EVENT_TITLE = "FeirÆo de Seminovos";
const EXPECTED_EVENT_PRICE = 499;
const REPORT_DIR = "reports";
const SUPPORTED_SCENARIOS = new Set([
  "archive-test-data",
  "confirmed-test-data-cleanup",
]);

// Tabelas que NÃO devem ter referências para BROKEN_ID — se aparecer,
// abortar (sinal de produto novo apontando pra cidade quebrada).
const FORBIDDEN_REF_TABLES = Object.freeze([
  "seo_cluster_plans",
  "seo_publications",
  "leads",
  "dealer_leads",
  "event_queue",
  "city_scores",
]);

export function parseArgs(argv) {
  const args = {
    scenario: null,
    yes: false,
    confirmEventId: null,
    confirmBrokenCityId: null,
    confirmCanonicalCityId: null,
  };
  for (const raw of argv.slice(2)) {
    if (raw === "--yes") args.yes = true;
    else if (raw === "--dry-run") {
      // explicit dry-run flag is just informational; default já é dry-run
    } else if (raw.startsWith("--scenario=")) {
      args.scenario = raw.slice("--scenario=".length).trim();
    } else if (raw.startsWith("--confirm-event-id=")) {
      const n = Number(raw.slice("--confirm-event-id=".length));
      if (Number.isFinite(n)) args.confirmEventId = n;
    } else if (raw.startsWith("--confirm-broken-city-id=")) {
      const n = Number(raw.slice("--confirm-broken-city-id=".length));
      if (Number.isFinite(n)) args.confirmBrokenCityId = n;
    } else if (raw.startsWith("--confirm-canonical-city-id=")) {
      const n = Number(raw.slice("--confirm-canonical-city-id=".length));
      if (Number.isFinite(n)) args.confirmCanonicalCityId = n;
    }
  }
  args.dryRun = !args.yes;
  return args;
}

function defaultLog(level, message, meta) {
  const prefix = "[cleanup-sao-paulo]";
  const line = meta !== undefined ? `${prefix} ${message} ${JSON.stringify(meta)}` : `${prefix} ${message}`;
  if (level === "error") {
    // eslint-disable-next-line no-console
    console.error(line);
  } else {
    // eslint-disable-next-line no-console
    console.log(line);
  }
}

function usage() {
  return [
    "Uso:",
    "  node scripts/maintenance/cleanup-sao-paulo-duplicate.mjs --scenario=<X> [--yes]",
    "",
    "Cenários suportados:",
    `  ${[...SUPPORTED_SCENARIOS].join(", ")}`,
    "",
    "Para confirmed-test-data-cleanup, exige TAMBÉM:",
    "  --confirm-event-id=<N> --confirm-broken-city-id=<N> --confirm-canonical-city-id=<N>",
    "",
    "Sem --yes, executa em dry-run (padrão seguro).",
  ].join("\n");
}

async function safeSelect(pg, sql, params) {
  try {
    const result = await pg.query(sql, params);
    return { ok: true, rows: result.rows };
  } catch (error) {
    if (error?.code === "42P01" || error?.code === "42703") {
      return { ok: false, missing: true };
    }
    throw error;
  }
}

async function tableHasColumn(pg, tableName, columnName) {
  const result = await pg.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = $1 AND column_name = $2
    LIMIT 1
    `,
    [tableName, columnName]
  );
  return result.rows.length > 0;
}

/**
 * Re-valida invariantes ANTES de tocar no banco. Retorna
 * `{ ok, reasons }`. Mesmo em --yes, se uma invariante falhar,
 * abortamos antes do BEGIN.
 *
 * @param {object} opts
 * @param {object} opts.pg
 * @param {string} opts.scenario
 * @param {object} [opts.args] — flags já parseadas (usadas pelo
 *   confirmed-test-data-cleanup para validar `--confirm-*`).
 */
export async function validatePreconditions({
  pg,
  scenario,
  args = {},
  log = defaultLog,
}) {
  const reasons = [];

  // 1. id=1 ainda tem slug='sæo-paulo'
  const broken = await pg.query(
    `SELECT id, name, slug, state, is_active, ibge_code FROM cities WHERE id = $1`,
    [BROKEN_ID]
  );
  if (broken.rows.length === 0) {
    reasons.push(`cities.id=${BROKEN_ID} não existe — nada a fazer`);
  } else if (broken.rows[0].slug !== "sæo-paulo") {
    reasons.push(
      `cities.id=${BROKEN_ID} já não tem slug='sæo-paulo' (atual=${JSON.stringify(broken.rows[0].slug)})`
    );
  }

  // 2. id=5278 ainda tem slug='sao-paulo-sp'
  const canonical = await pg.query(
    `SELECT id, name, slug, state, is_active, ibge_code FROM cities WHERE id = $1`,
    [CANONICAL_ID]
  );
  if (canonical.rows.length === 0) {
    reasons.push(`cities.id=${CANONICAL_ID} (canônico) não existe`);
  } else if (canonical.rows[0].slug !== "sao-paulo-sp") {
    reasons.push(
      `cities.id=${CANONICAL_ID} não tem slug='sao-paulo-sp' (atual=${JSON.stringify(canonical.rows[0].slug)})`
    );
  }

  if (scenario === "archive-test-data") {
    await validateArchiveTestData({ pg, reasons });
  } else if (scenario === "confirmed-test-data-cleanup") {
    await validateConfirmedCleanup({ pg, args, reasons, broken, canonical });
  }

  return { ok: reasons.length === 0, reasons };
}

async function validateArchiveTestData({ pg, reasons }) {
  const ads = await pg.query(
    `
    SELECT id, title, status, city_id
    FROM ads
    WHERE id = ANY($1::int[])
    ORDER BY id
    `,
    [EXPECTED_TEST_AD_IDS]
  );
  const found = new Set(ads.rows.map((r) => r.id));
  for (const expected of EXPECTED_TEST_AD_IDS) {
    if (!found.has(expected)) {
      reasons.push(`ad esperado id=${expected} não encontrado`);
      continue;
    }
    const row = ads.rows.find((r) => r.id === expected);
    if (row.status !== "active") {
      reasons.push(
        `ad id=${expected} não está active (status=${row.status}) — pode já ter sido arquivado`
      );
    }
    if (row.city_id !== BROKEN_ID) {
      reasons.push(
        `ad id=${expected} não está em city_id=${BROKEN_ID} (atual=${row.city_id})`
      );
    }
  }

  // Bloqueio de segurança: archive-test-data NÃO toca refs fortes.
  const events = await safeSelect(
    pg,
    `
    SELECT COUNT(*)::int AS n
    FROM events
    WHERE city_id = $1
      AND (
        LOWER(COALESCE(status, '')) = 'paid'
        OR LOWER(COALESCE(payment_status, '')) = 'paid'
        OR COALESCE(price, 0) > 0
      )
    `,
    [BROKEN_ID]
  );
  if (events.ok && events.rows[0]?.n > 0) {
    reasons.push(
      `events sensíveis em city_id=${BROKEN_ID}: ${events.rows[0].n} — exige decisão manual (cenário D)`
    );
  }

  const rms = await safeSelect(
    pg,
    `SELECT COUNT(*)::int AS n FROM region_memberships WHERE base_city_id = $1 OR member_city_id = $1`,
    [BROKEN_ID]
  );
  if (rms.ok && rms.rows[0]?.n > 0) {
    reasons.push(
      `region_memberships referenciando city_id=${BROKEN_ID}: ${rms.rows[0].n} — exige cenário próprio`
    );
  }
}

/**
 * Pré-condições do cenário `confirmed-test-data-cleanup`. 8 categorias
 * de invariante; qualquer falha aborta antes do BEGIN.
 */
async function validateConfirmedCleanup({
  pg,
  args,
  reasons,
  broken,
  canonical,
}) {
  // 0. flags --confirm-* presentes E batendo nos IDs esperados
  if (args.confirmEventId !== EXPECTED_EVENT_ID) {
    reasons.push(
      `--confirm-event-id é obrigatório e deve ser ${EXPECTED_EVENT_ID} (recebido: ${args.confirmEventId})`
    );
  }
  if (args.confirmBrokenCityId !== BROKEN_ID) {
    reasons.push(
      `--confirm-broken-city-id é obrigatório e deve ser ${BROKEN_ID} (recebido: ${args.confirmBrokenCityId})`
    );
  }
  if (args.confirmCanonicalCityId !== CANONICAL_ID) {
    reasons.push(
      `--confirm-canonical-city-id é obrigatório e deve ser ${CANONICAL_ID} (recebido: ${args.confirmCanonicalCityId})`
    );
  }

  // 1+2 já cobertos acima (slug); reforço de state/is_active/ibge_code
  if (broken.rows.length === 1) {
    const b = broken.rows[0];
    if (b.state !== "SP") reasons.push(`cities.id=${BROKEN_ID} state≠'SP' (${b.state})`);
    if (b.is_active !== true) {
      reasons.push(`cities.id=${BROKEN_ID} já is_active=false — possível cleanup parcial anterior`);
    }
  }
  if (canonical.rows.length === 1) {
    const c = canonical.rows[0];
    if (c.state !== "SP") reasons.push(`cities.id=${CANONICAL_ID} state≠'SP' (${c.state})`);
    if (c.is_active !== true) {
      reasons.push(`cities.id=${CANONICAL_ID} is_active=false — abortar (canônica deve estar ativa)`);
    }
    if (Number(c.ibge_code) !== 3550308) {
      reasons.push(
        `cities.id=${CANONICAL_ID} ibge_code≠3550308 (atual=${c.ibge_code}) — não é a São Paulo canônica esperada`
      );
    }
  }

  // 3. Ads esperados: somente IDs 9 e 80 active em city_id=1, ambos
  //    classificados como teste por title/slug.
  const ads = await pg.query(
    `
    SELECT id, title, slug, status, city_id
    FROM ads
    WHERE city_id = $1 AND status = 'active'
    ORDER BY id
    `,
    [BROKEN_ID]
  );
  const activeAdIds = ads.rows.map((r) => r.id).sort((a, b) => a - b);
  const expectedActiveSorted = [...EXPECTED_TEST_AD_IDS].sort((a, b) => a - b);
  if (
    activeAdIds.length !== expectedActiveSorted.length ||
    activeAdIds.some((id, i) => id !== expectedActiveSorted[i])
  ) {
    reasons.push(
      `ads ativos em city_id=${BROKEN_ID} não batem com [${expectedActiveSorted.join(", ")}] (atual: [${activeAdIds.join(", ")}]) — abortar pra não tocar ad real`
    );
  }
  for (const ad of ads.rows) {
    const titleLooksTest = /(test|teste|seed|deploymodel)/i.test(ad.title || "");
    const slugLooksTest = /(test|teste|seed|deploymodel)/i.test(ad.slug || "");
    if (!titleLooksTest && !slugLooksTest) {
      reasons.push(
        `ad id=${ad.id} (title=${JSON.stringify(ad.title)}, slug=${JSON.stringify(ad.slug)}) não bate padrão de teste — abortar`
      );
    }
  }

  // 4. Evento esperado
  const eventCols = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name = 'events'`
  );
  const eventColSet = new Set(eventCols.rows.map((r) => String(r.column_name).toLowerCase()));
  const hasPaymentId = eventColSet.has("payment_id");

  const events = await pg.query(
    `
    SELECT id, city_id, title, status, payment_status, price${hasPaymentId ? ", payment_id" : ""}
    FROM events
    WHERE city_id = $1
    ORDER BY id
    `,
    [BROKEN_ID]
  );
  if (events.rows.length !== 1) {
    reasons.push(
      `events em city_id=${BROKEN_ID}: esperado 1, encontrado ${events.rows.length} — abortar`
    );
  } else {
    const e = events.rows[0];
    if (e.id !== EXPECTED_EVENT_ID) reasons.push(`events.id=${e.id} ≠ esperado ${EXPECTED_EVENT_ID}`);
    if (e.title !== EXPECTED_EVENT_TITLE) reasons.push(`events.title≠${JSON.stringify(EXPECTED_EVENT_TITLE)} (${JSON.stringify(e.title)})`);
    if (String(e.status).toLowerCase() !== "paid") reasons.push(`events.status≠'paid' (${e.status})`);
    if (String(e.payment_status).toLowerCase() !== "paid") reasons.push(`events.payment_status≠'paid' (${e.payment_status})`);
    if (Number(e.price) !== EXPECTED_EVENT_PRICE) reasons.push(`events.price≠${EXPECTED_EVENT_PRICE} (${e.price})`);
    if (hasPaymentId && e.payment_id !== null && String(e.payment_id).trim() !== "") {
      reasons.push(
        `events.payment_id=${JSON.stringify(e.payment_id)} — não é vazio. Pagamento real, abortar.`
      );
    }
  }

  // 4.b. CHECK constraint em events.status / payment_status?
  // Se houver constraint que restrinja status a valores que NÃO incluem
  // 'cancelled' (ou payment_status sem 'test_cancelled'), abortar com
  // instrução manual. Detecção textual via pg_get_constraintdef.
  const checks = await safeSelect(
    pg,
    `
    SELECT conname, pg_get_constraintdef(oid) AS def
    FROM pg_constraint
    WHERE contype = 'c' AND conrelid = 'events'::regclass
    `
  );
  if (checks.ok) {
    for (const c of checks.rows) {
      const def = String(c.def || "");
      // status check
      if (/\bstatus\b/i.test(def) && /\bIN\s*\(/i.test(def)) {
        if (!/\bcancelled\b/i.test(def)) {
          reasons.push(
            `events tem CHECK constraint '${c.conname}' em status que NÃO inclui 'cancelled': ${def}. Resolver manualmente antes.`
          );
        }
      }
      if (/\bpayment_status\b/i.test(def) && /\bIN\s*\(/i.test(def)) {
        if (!/\btest_cancelled\b/i.test(def)) {
          reasons.push(
            `events tem CHECK constraint '${c.conname}' em payment_status que NÃO inclui 'test_cancelled': ${def}. Resolver manualmente antes.`
          );
        }
      }
    }
  }

  // 5. city_metrics: ≤1 linha; zerada
  const cmCols = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='city_metrics'`
  );
  if (cmCols.rows.length > 0) {
    const cm = await pg.query(`SELECT * FROM city_metrics WHERE city_id = $1`, [BROKEN_ID]);
    if (cm.rows.length > 1) {
      reasons.push(`city_metrics city_id=${BROKEN_ID}: ${cm.rows.length} linhas (esperado ≤1)`);
    } else if (cm.rows.length === 1) {
      const m = cm.rows[0];
      const numeric = (v) => (v == null ? 0 : Number(typeof v === "string" ? v.trim() : v));
      const allowed = ["visits", "leads", "ads_count", "advertisers_count", "total_leads", "demand_score", "dealer_pipeline_leads", "dealer_outreach_sent"];
      for (const col of allowed) {
        if (col in m && numeric(m[col]) !== 0) {
          reasons.push(`city_metrics.${col}=${m[col]} ≠ 0 — não é zerada`);
        }
      }
    }
  }

  // 6. city_status: ≤1 linha; status='exploring' AND score=0
  const csCols = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='city_status'`
  );
  if (csCols.rows.length > 0) {
    const cs = await pg.query(`SELECT * FROM city_status WHERE city_id = $1`, [BROKEN_ID]);
    if (cs.rows.length > 1) {
      reasons.push(`city_status city_id=${BROKEN_ID}: ${cs.rows.length} linhas (esperado ≤1)`);
    } else if (cs.rows.length === 1) {
      const s = cs.rows[0];
      if ("status" in s && s.status !== "exploring") {
        reasons.push(`city_status.status=${JSON.stringify(s.status)} ≠ 'exploring'`);
      }
      if ("score" in s && Number(s.score) !== 0) {
        reasons.push(`city_status.score=${s.score} ≠ 0`);
      }
    }
  }

  // 7. region_memberships
  const rmCols = await pg.query(
    `SELECT column_name FROM information_schema.columns WHERE table_name='region_memberships'`
  );
  if (rmCols.rows.length > 0) {
    const rm1 = await pg.query(
      `SELECT base_city_id, member_city_id, distance_km FROM region_memberships WHERE base_city_id = $1 OR member_city_id = $1`,
      [BROKEN_ID]
    );
    const selfRefs = rm1.rows.filter(
      (r) => r.base_city_id === BROKEN_ID && r.member_city_id === BROKEN_ID
    );
    const otherRefs = rm1.rows.filter(
      (r) => !(r.base_city_id === BROKEN_ID && r.member_city_id === BROKEN_ID)
    );
    if (selfRefs.length !== 1) {
      reasons.push(
        `region_memberships base=${BROKEN_ID} member=${BROKEN_ID}: esperado exatamente 1 linha, encontrado ${selfRefs.length}`
      );
    } else if (Number(selfRefs[0].distance_km) !== 0) {
      reasons.push(
        `region_memberships autorreferente tem distance_km=${selfRefs[0].distance_km} ≠ 0`
      );
    }
    if (otherRefs.length > 0) {
      reasons.push(
        `region_memberships tem ${otherRefs.length} linha(s) extras referenciando city_id=${BROKEN_ID} além da autorreferência — abortar (poderia órfãos quebrar FKs)`
      );
    }

    // canônico precisa ter linha equivalente
    const rmCanon = await pg.query(
      `SELECT 1 FROM region_memberships WHERE base_city_id = $1 AND member_city_id = $1 LIMIT 1`,
      [CANONICAL_ID]
    );
    if (rmCanon.rows.length !== 1) {
      reasons.push(
        `region_memberships não tem linha base=${CANONICAL_ID} member=${CANONICAL_ID} — canônico precisa estar saudável antes do cleanup`
      );
    }
  }

  // 8. Tabelas proibidas: nenhuma referência para BROKEN_ID
  for (const tbl of FORBIDDEN_REF_TABLES) {
    const exists = await tableHasColumn(pg, tbl, "city_id");
    if (!exists) continue;
    const r = await safeSelect(
      pg,
      `SELECT COUNT(*)::int AS n FROM ${tbl} WHERE city_id = $1`,
      [BROKEN_ID]
    );
    if (r.ok && r.rows[0]?.n > 0) {
      reasons.push(
        `${tbl} tem ${r.rows[0].n} linha(s) com city_id=${BROKEN_ID} — abortar (referência inesperada)`
      );
    }
  }
}

/**
 * Captura snapshot completo das linhas que SERIAM alteradas/removidas
 * pelo cenário escolhido. Read-only. Sempre executado, mesmo em
 * dry-run, para o operador revisar o estado antes de qualquer escrita.
 */
export async function captureSnapshot({ pg, scenario }) {
  if (scenario !== "confirmed-test-data-cleanup") return null;

  const snapshot = { generated_at: new Date().toISOString(), scenario };

  const cities = await pg.query(`SELECT * FROM cities WHERE id = $1`, [BROKEN_ID]);
  snapshot.cities_id_1 = cities.rows;

  const ads = await pg.query(
    `SELECT * FROM ads WHERE id = ANY($1::int[])`,
    [EXPECTED_TEST_AD_IDS]
  );
  snapshot.ads = ads.rows;

  const ev = await pg.query(`SELECT * FROM events WHERE id = $1`, [EXPECTED_EVENT_ID]);
  snapshot.events_id_4 = ev.rows;

  const cm = await safeSelect(pg, `SELECT * FROM city_metrics WHERE city_id = $1`, [BROKEN_ID]);
  snapshot.city_metrics = cm.ok ? cm.rows : [];

  const cs = await safeSelect(pg, `SELECT * FROM city_status WHERE city_id = $1`, [BROKEN_ID]);
  snapshot.city_status = cs.ok ? cs.rows : [];

  const rm = await safeSelect(
    pg,
    `SELECT * FROM region_memberships WHERE base_city_id = $1 AND member_city_id = $1`,
    [BROKEN_ID]
  );
  snapshot.region_memberships_self = rm.ok ? rm.rows : [];

  return snapshot;
}

function writeSnapshotFile(snapshot, log = defaultLog) {
  if (!snapshot) return null;
  try {
    const dir = path.resolve(process.cwd(), REPORT_DIR);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const ts = snapshot.generated_at.replace(/[:.]/g, "-");
    const file = path.join(dir, `sao-paulo-cleanup-snapshot-${ts}.json`);
    fs.writeFileSync(file, JSON.stringify(snapshot, null, 2), "utf-8");
    log("info", `snapshot salvo em ${file}`);
    return file;
  } catch (err) {
    log("error", `falha ao salvar snapshot: ${err?.message || err}`);
    return null;
  }
}

/**
 * Gera SQL de rollback a partir do snapshot. NÃO executa nada — só
 * imprime para o operador copiar/colar manualmente em emergência.
 *
 * Para UPDATE: gera UPDATE com valores antigos (status, payment_status,
 * price, is_active, updated_at).
 * Para DELETE: gera INSERT com colunas capturadas.
 */
function buildRollbackSql(snapshot) {
  if (!snapshot) return [];
  const lines = [];

  // events: cancelled → paid
  for (const e of snapshot.events_id_4 || []) {
    lines.push(
      `UPDATE events SET status = ${escSql(e.status)}, payment_status = ${escSql(e.payment_status)}, price = ${escSql(e.price)} WHERE id = ${e.id};`
    );
  }

  // ads: archived → active
  for (const a of snapshot.ads || []) {
    lines.push(
      `UPDATE ads SET status = ${escSql(a.status)} WHERE id = ${a.id};`
    );
  }

  // region_memberships: re-INSERT
  for (const r of snapshot.region_memberships_self || []) {
    const cols = Object.keys(r);
    lines.push(
      `INSERT INTO region_memberships (${cols.join(", ")}) VALUES (${cols.map((c) => escSql(r[c])).join(", ")});`
    );
  }

  // city_metrics: re-INSERT
  for (const m of snapshot.city_metrics || []) {
    const cols = Object.keys(m);
    lines.push(
      `INSERT INTO city_metrics (${cols.join(", ")}) VALUES (${cols.map((c) => escSql(m[c])).join(", ")});`
    );
  }

  // city_status: re-INSERT
  for (const s of snapshot.city_status || []) {
    const cols = Object.keys(s);
    lines.push(
      `INSERT INTO city_status (${cols.join(", ")}) VALUES (${cols.map((c) => escSql(s[c])).join(", ")});`
    );
  }

  // cities: is_active=true (se foi false antes do cleanup, snapshot
  // mantinha true; rollback restaura true)
  for (const c of snapshot.cities_id_1 || []) {
    if (c.is_active === true) {
      lines.push(`UPDATE cities SET is_active = true WHERE id = ${c.id};`);
    }
  }

  return lines;
}

function escSql(v) {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (v instanceof Date) return `'${v.toISOString()}'`;
  // string / object / etc
  return `'${String(v).replace(/'/g, "''")}'`;
}

/**
 * Constrói os SQLs do cenário escolhido.
 */
export function planScenario(scenario) {
  if (scenario === "archive-test-data") {
    return [
      {
        description: `arquivar ads de teste id IN (${EXPECTED_TEST_AD_IDS.join(", ")}) (atualmente active, city_id=${BROKEN_ID})`,
        sql: `
          UPDATE ads
          SET status = 'archived',
              updated_at = NOW()
          WHERE id = ANY($1::int[])
            AND city_id = $2
            AND status = 'active'
        `,
        params: [EXPECTED_TEST_AD_IDS, BROKEN_ID],
      },
    ];
  }

  if (scenario === "confirmed-test-data-cleanup") {
    return [
      {
        description: `neutralizar evento de teste id=${EXPECTED_EVENT_ID} (paid → cancelled)`,
        sql: `
          UPDATE events
          SET status = 'cancelled',
              payment_status = 'test_cancelled',
              price = 0,
              updated_at = NOW()
          WHERE id = $1
            AND city_id = $2
            AND title = $3
            AND status = 'paid'
            AND payment_status = 'paid'
            AND price = $4
        `,
        params: [EXPECTED_EVENT_ID, BROKEN_ID, EXPECTED_EVENT_TITLE, EXPECTED_EVENT_PRICE],
      },
      {
        description: `arquivar ads de teste id IN (${EXPECTED_TEST_AD_IDS.join(", ")})`,
        sql: `
          UPDATE ads
          SET status = 'archived',
              updated_at = NOW()
          WHERE id = ANY($1::int[])
            AND city_id = $2
            AND status = 'active'
            AND (
              title ~* '(test|teste|seed|deploymodel)'
              OR slug ~* '(test|teste|seed|deploymodel)'
            )
        `,
        params: [EXPECTED_TEST_AD_IDS, BROKEN_ID],
      },
      {
        description: `remover linha autorreferente quebrada em region_memberships (base=${BROKEN_ID} AND member=${BROKEN_ID})`,
        sql: `
          DELETE FROM region_memberships
          WHERE base_city_id = $1
            AND member_city_id = $1
            AND distance_km = 0
        `,
        params: [BROKEN_ID],
      },
      {
        description: `remover métricas zeradas de city_metrics city_id=${BROKEN_ID}`,
        sql: `
          DELETE FROM city_metrics
          WHERE city_id = $1
            AND COALESCE(visits, 0) = 0
            AND COALESCE(leads, 0) = 0
            AND COALESCE(ads_count, 0) = 0
            AND COALESCE(advertisers_count, 0) = 0
            AND COALESCE(total_leads, 0) = 0
            AND COALESCE(demand_score, 0) = 0
            AND COALESCE(dealer_pipeline_leads, 0) = 0
            AND COALESCE(dealer_outreach_sent, 0) = 0
        `,
        params: [BROKEN_ID],
      },
      {
        description: `remover city_status exploratório zerado de city_id=${BROKEN_ID}`,
        sql: `
          DELETE FROM city_status
          WHERE city_id = $1
            AND status = 'exploring'
            AND COALESCE(score, 0) = 0
        `,
        params: [BROKEN_ID],
      },
      {
        description: `inativar cidade quebrada cities.id=${BROKEN_ID} (is_active=false; NÃO deleta)`,
        sql: `
          UPDATE cities
          SET is_active = false,
              updated_at = NOW()
          WHERE id = $1
            AND slug = 'sæo-paulo'
            AND state = 'SP'
            AND is_active = true
        `,
        params: [BROKEN_ID],
      },
    ];
  }

  throw new Error(`cenário não suportado: ${JSON.stringify(scenario)}`);
}

/**
 * Lógica core — recebe deps via injeção pra ser testável sem banco real.
 *
 * @param {object} opts
 * @param {string} opts.scenario
 * @param {boolean} opts.dryRun
 * @param {object} [opts.args] — flags parseadas
 * @param {object} [opts.pg] — pool ou client; default usa o pool do db.js
 * @param {(level: string, message: string, meta?: unknown) => void} [opts.log]
 * @param {(snapshot: object) => string|null} [opts.writeSnapshot]
 *   — injetável pra teste (default: writeSnapshotFile)
 */
export async function runCleanup({
  scenario,
  dryRun,
  args = {},
  pg = pool,
  log = defaultLog,
  writeSnapshot = writeSnapshotFile,
}) {
  log("info", "iniciando cleanup", { scenario, dryRun });

  if (!scenario) {
    log("error", "--scenario é obrigatório. Abortando.");
    log("error", usage());
    return { ok: false, reason: "missing_scenario" };
  }

  if (!SUPPORTED_SCENARIOS.has(scenario)) {
    log("error", `cenário desconhecido: ${JSON.stringify(scenario)}`);
    log("error", usage());
    return { ok: false, reason: "unknown_scenario", scenario };
  }

  if (dryRun) {
    log("info", "DRY-RUN: nenhuma escrita ao banco. Use --yes para executar.");
  } else {
    log("info", "MODO PERSISTÊNCIA: --yes presente. Vai aplicar mudanças.");
  }

  const pre = await validatePreconditions({ pg, scenario, args, log });
  if (!pre.ok) {
    log("error", "pré-condições FALHARAM — ABORTANDO. Motivos:");
    for (const r of pre.reasons) log("error", `  - ${r}`);
    return { ok: false, reason: "preconditions_failed", reasons: pre.reasons, dryRun };
  }
  log("info", "pré-condições OK");

  // Snapshot — sempre, dry-run ou real. Read-only.
  const snapshot = await captureSnapshot({ pg, scenario });
  if (snapshot) {
    log("info", "snapshot do estado atual:", {
      cities: snapshot.cities_id_1.length,
      ads: snapshot.ads.length,
      events: snapshot.events_id_4.length,
      city_metrics: snapshot.city_metrics.length,
      city_status: snapshot.city_status.length,
      region_memberships_self: snapshot.region_memberships_self.length,
    });
  }
  const snapshotFile = snapshot ? writeSnapshot(snapshot, log) : null;

  const steps = planScenario(scenario);
  for (const step of steps) {
    log("info", `step: ${step.description}`);
    log("info", `  SQL:\n    ${step.sql.trim().replace(/\n\s*/g, "\n    ")}`);
    log("info", `  params: ${JSON.stringify(step.params)}`);
  }

  // Plano de rollback — sempre impresso (operator copy-paste).
  const rollbackSql = buildRollbackSql(snapshot);
  if (rollbackSql.length > 0) {
    log("info", "ROLLBACK manual (caso necessário, copy-paste no psql):");
    for (const line of rollbackSql) log("info", `  ${line}`);
  }

  if (dryRun) {
    log("info", "DRY-RUN concluído. Nenhuma alteração aplicada.");
    return {
      ok: true,
      dryRun: true,
      scenario,
      steps: steps.length,
      snapshot,
      snapshotFile,
      rollbackSql,
    };
  }

  // Persistência: BEGIN, executar todos os steps, COMMIT.
  const client = await pg.connect();
  try {
    await client.query("BEGIN");
    log("info", "BEGIN");

    let totalAffected = 0;
    for (const step of steps) {
      const result = await client.query(step.sql, step.params);
      log("info", `  affected rows: ${result.rowCount}`, { description: step.description });
      totalAffected += result.rowCount || 0;
    }

    await client.query("COMMIT");
    log("info", `COMMIT — total de linhas afetadas: ${totalAffected}`);

    return {
      ok: true,
      dryRun: false,
      scenario,
      totalAffected,
      snapshot,
      snapshotFile,
      rollbackSql,
    };
  } catch (err) {
    log("error", `erro durante a transação: ${err?.message || err}`);
    try {
      await client.query("ROLLBACK");
      log("info", "ROLLBACK aplicado");
    } catch (rbErr) {
      log("error", `ROLLBACK também falhou: ${rbErr?.message || rbErr}`);
    }
    return {
      ok: false,
      reason: "transaction_error",
      error: err?.message || String(err),
      snapshot,
      snapshotFile,
      rollbackSql,
    };
  } finally {
    client.release();
  }
}

const isMainModule =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/\\/g, "/") || "__nope__");

if (isMainModule) {
  const args = parseArgs(process.argv);
  try {
    const result = await runCleanup({ scenario: args.scenario, dryRun: args.dryRun, args });
    process.exitCode = result.ok ? 0 : 1;
  } catch (err) {
    defaultLog("error", `FATAL: ${err?.message || err}`);
    process.exitCode = 1;
  } finally {
    await closeDatabasePool().catch(() => {});
  }
}
