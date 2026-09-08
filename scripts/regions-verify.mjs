#!/usr/bin/env node
/**
 * VERIFICAÇÃO SOMENTE LEITURA de `region_memberships` após o rebuild da F1.
 *
 * Não escreve nada: só `SELECT`. Abre a sessão com
 * `default_transaction_read_only = on`, de modo que qualquer escrita acidental
 * (agora ou numa edição futura) falha em vez de acontecer.
 *
 * Imprime UMA LINHA POR CHECAGEM, em formato fixo `CHAVE = valor` seguido de
 * `[OK]` ou `[FALHA: motivo]`, e termina com um veredito único:
 *
 *     PROSSIGA
 *     PARE: <motivo>
 *
 * O objetivo é que quem executa não precise interpretar contador nenhum.
 *
 * Uso:
 *   npm run regions:verify
 *   npm run regions:verify -- --backup-table=region_memberships_backup_prod_f1
 *
 * Exit code: 0 quando PROSSIGA, 1 quando PARE (permite encadear em script).
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";

const DEFAULT_BACKUP = "region_memberships_backup_prod_f1";
const TOLERANCE_KM = 0.5;

/** Sentinelas geográficas da §3.1 do prompt (esperado ±0,5 km). */
const SENTINELS = [
  ["braganca-paulista-sp", "extrema-mg", 25.4],
  ["atibaia-sp", "extrema-mg", 38.1],
  ["atibaia-sp", "braganca-paulista-sp", 18.3],
];

function arg(name, fallback) {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

function safeIdentifier(name) {
  if (!/^[a-z_][a-z0-9_]{0,62}$/.test(name)) throw new Error(`identificador inválido: ${name}`);
  return name;
}

const failures = [];
function line(key, value, ok, motivo) {
  const status = ok ? "[OK]" : `[FALHA: ${motivo}]`;
  if (!ok) failures.push(`${key} — ${motivo}`);
  console.log(`${key} = ${value} ${status}`);
}

async function main() {
  const backupTable = safeIdentifier(arg("backup-table", DEFAULT_BACKUP));

  const client = await pool.connect();
  try {
    // Trava a sessão. A partir daqui, qualquer INSERT/UPDATE/DELETE/DDL
    // devolve erro 25006 em vez de escrever.
    await client.query("SET default_transaction_read_only = on");
    await client.query("SET statement_timeout = 120000");

    const { rows: guard } = await client.query("SHOW default_transaction_read_only");
    console.log(`SESSAO_SOMENTE_LEITURA = ${guard[0].default_transaction_read_only} [OK]`);
    const { rows: db } = await client.query("SELECT current_database() AS db");
    console.log(`BANCO = ${db[0].db} [OK]`);
    console.log("");

    // ── 1. Sentinelas ────────────────────────────────────────────────────────
    for (const [a, b, esperado] of SENTINELS) {
      const { rows } = await client.query(
        `SELECT rm.distance_km::float AS km, rm.layer
           FROM region_memberships rm
           JOIN cities ca ON ca.id = rm.base_city_id
           JOIN cities cb ON cb.id = rm.member_city_id
          WHERE ca.slug = $1 AND cb.slug = $2`,
        [a, b]
      );
      const key = `SENTINELA ${a}|${b}`;
      if (!rows.length) {
        line(key, "AUSENTE", false, `par nao existe na tabela (esperado ${esperado} km)`);
        continue;
      }
      const km = rows[0].km;
      const ok = Math.abs(km - esperado) <= TOLERANCE_KM;
      line(
        key,
        `${km.toFixed(2)} km (layer ${rows[0].layer})`,
        ok,
        `esperado ${esperado} +-${TOLERANCE_KM} km`
      );
    }

    // ── 2. Contagens ─────────────────────────────────────────────────────────
    const { rows: cross } = await client.query(
      `SELECT COUNT(*)::int AS n
         FROM region_memberships rm
         JOIN cities b ON b.id = rm.base_city_id
         JOIN cities m ON m.id = rm.member_city_id
        WHERE b.state <> m.state`
    );
    line("CROSS_UF", cross[0].n, cross[0].n > 0, "esperado > 0 (fronteira de UF deve ter caido)");

    const { rows: totals } = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(*) FILTER (WHERE layer <= 3)::int AS legado,
              COUNT(*) FILTER (WHERE base_city_id = member_city_id)::int AS self
         FROM region_memberships`
    );
    line("TOTAL", totals[0].total, totals[0].total > 0, "tabela vazia");
    line("LAYER_LE_3", totals[0].legado, true, "");
    line("SELF_ROWS", totals[0].self, true, "");

    const { rows: cities } = await client.query(`SELECT COUNT(*)::int AS n FROM cities`);
    line(
      "SELF_ROWS_IGUAL_CIDADES",
      `${totals[0].self} de ${cities[0].n}`,
      totals[0].self === cities[0].n,
      "toda cidade precisa de self-row (layer 0)"
    );

    // ── 3. EXCEPT layer <= 3 contra o backup ────────────────────────────────
    const { rows: exists } = await client.query(`SELECT to_regclass($1) AS oid`, [backupTable]);
    if (exists[0].oid == null) {
      line(
        `BACKUP ${backupTable}`,
        "AUSENTE",
        false,
        "tabela de backup nao existe — o build real ainda nao rodou, ou rodou com outro --backup-table"
      );
    } else {
      const { rows: bk } = await client.query(`SELECT COUNT(*)::int AS n FROM ${backupTable}`);
      line(`BACKUP ${backupTable}`, `${bk[0].n} linhas`, bk[0].n > 0, "backup vazio");

      const { rows: d1 } = await client.query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT base_city_id, member_city_id, distance_km, layer
             FROM region_memberships WHERE layer <= 3
           EXCEPT
           SELECT base_city_id, member_city_id, distance_km, layer FROM ${backupTable}
         ) x`
      );
      line(
        "EXCEPT_NOVO_MENOS_BACKUP",
        d1[0].n,
        d1[0].n === 0,
        "ha linha visivel aos leitores legados que NAO existia antes"
      );

      const { rows: d2 } = await client.query(
        `SELECT COUNT(*)::int AS n FROM (
           SELECT base_city_id, member_city_id, distance_km, layer FROM ${backupTable}
           EXCEPT
           SELECT base_city_id, member_city_id, distance_km, layer
             FROM region_memberships WHERE layer <= 3
         ) x`
      );
      line(
        "EXCEPT_BACKUP_MENOS_NOVO",
        d2[0].n,
        d2[0].n === 0,
        "linha que existia antes sumiu da visao dos leitores legados"
      );
    }

    console.log("");
    if (failures.length === 0) {
      console.log("PROSSIGA");
      return 0;
    }
    console.log(`PARE: ${failures.join(" | ")}`);
    return 1;
  } finally {
    client.release();
  }
}

try {
  process.exitCode = await main();
} catch (err) {
  console.log("");
  console.log(`PARE: erro ao verificar — ${err?.message || err}`);
  process.exitCode = 1;
} finally {
  await closeDatabasePool().catch(() => {});
}
