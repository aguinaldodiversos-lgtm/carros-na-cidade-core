#!/usr/bin/env node
/**
 * VERIFICAÇÃO SOMENTE LEITURA de `ads.commercial_model` após o backfill da F1.
 *
 * Não escreve nada: só `SELECT`. Sessão com `default_transaction_read_only = on`.
 * Uma linha fixa por checagem (`CHAVE = valor [OK|FALHA: motivo]`) e um
 * veredito único ao final: `PROSSIGA` ou `PARE: <motivo>`.
 *
 * O que prova:
 *   - coluna e índice existem (migration 064);
 *   - as DUAS funções de search_vector contêm o termo commercial_model e os
 *     três triggers continuam apontando para elas;
 *   - todo anúncio com commercial_model preenchido casa
 *     `search_vector @@ plainto_tsquery(commercial_model)` (0 divergências);
 *   - nenhum anúncio ficou com search_vector NULL;
 *   - taxa de NULL entre anúncios NÃO deletados ≤ 20 % (lista os NULL);
 *   - prova concreta: um anúncio com commercial_model casa o próprio modelo
 *     em peso A.
 *
 * Uso:
 *   npm run ads:verify-commercial-model
 *
 * Exit code: 0 quando PROSSIGA, 1 quando PARE.
 */
import "dotenv/config";
import { pool, closeDatabasePool } from "../src/infrastructure/database/db.js";

const NULL_RATE_LIMIT = 0.2;

const failures = [];
function line(key, value, ok, motivo) {
  const status = ok ? "[OK]" : `[FALHA: ${motivo}]`;
  if (!ok) failures.push(`${key} — ${motivo}`);
  console.log(`${key} = ${value} ${status}`);
}

async function main() {
  const client = await pool.connect();
  try {
    await client.query("SET default_transaction_read_only = on");
    await client.query("SET statement_timeout = 120000");

    const { rows: guard } = await client.query("SHOW default_transaction_read_only");
    console.log(`SESSAO_SOMENTE_LEITURA = ${guard[0].default_transaction_read_only} [OK]`);
    const { rows: db } = await client.query("SELECT current_database() AS db");
    console.log(`BANCO = ${db[0].db} [OK]`);
    console.log("");

    // ── 1. Schema ───────────────────────────────────────────────────────────
    const { rows: col } = await client.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = current_schema() AND table_name = 'ads' AND column_name = 'commercial_model'`
    );
    line(
      "COLUNA ads.commercial_model",
      col.length ? "existe" : "AUSENTE",
      col.length > 0,
      "migration 064 nao aplicada"
    );
    if (!col.length) {
      console.log("");
      console.log("PARE: coluna ads.commercial_model nao existe — aplique as migrations antes.");
      return 1;
    }

    const { rows: idx } = await client.query(
      `SELECT 1 FROM pg_indexes WHERE tablename = 'ads' AND indexname = 'idx_ads_commercial_model_status'`
    );
    line(
      "INDICE idx_ads_commercial_model_status",
      idx.length ? "existe" : "AUSENTE",
      idx.length > 0,
      "indice da migration 064 ausente"
    );

    const { rows: fns } = await client.query(
      `SELECT proname, (pg_get_functiondef(oid) LIKE '%commercial_model%') AS ok
         FROM pg_proc
        WHERE proname IN ('ads_search_vector_update', 'ads_search_vector_refresh')
        ORDER BY proname`
    );
    for (const f of fns) {
      line(
        `FUNCAO ${f.proname} contem commercial_model`,
        f.ok ? "sim" : "nao",
        f.ok,
        "funcao de trigger sem o termo novo"
      );
    }
    if (fns.length === 0)
      line("FUNCOES search_vector", "NENHUMA", false, "nenhuma funcao de search_vector encontrada");

    const { rows: trg } = await client.query(
      `SELECT tgname, substring(pg_get_triggerdef(oid) from 'EXECUTE FUNCTION ([a-z_]+)') AS fn
         FROM pg_trigger WHERE tgrelid = 'ads'::regclass AND NOT tgisinternal
        ORDER BY tgname`
    );
    const fnNames = new Set(fns.map((f) => f.proname));
    for (const t of trg) {
      if (!/search_vector/.test(t.tgname)) continue;
      line(
        `TRIGGER ${t.tgname}`,
        t.fn,
        fnNames.has(t.fn),
        "trigger aponta para funcao sem o termo novo"
      );
    }

    // ── 2. Dados ─────────────────────────────────────────────────────────────
    const { rows: t } = await client.query(
      `SELECT COUNT(*)::int AS total,
              COUNT(commercial_model)::int AS com_modelo,
              COUNT(*) FILTER (WHERE status <> 'deleted')::int AS nao_deletados,
              COUNT(*) FILTER (WHERE status <> 'deleted' AND commercial_model IS NULL)::int AS nulos_nao_deletados,
              COUNT(*) FILTER (WHERE status = 'active')::int AS ativos,
              COUNT(*) FILTER (WHERE status = 'active' AND commercial_model IS NOT NULL)::int AS ativos_com_modelo,
              COUNT(*) FILTER (WHERE search_vector IS NULL)::int AS vetor_nulo,
              COUNT(*) FILTER (WHERE commercial_model IS NOT NULL
                                 AND NOT (search_vector @@ plainto_tsquery('portuguese', commercial_model)))::int AS vetor_sem_modelo
         FROM ads`
    );
    const r = t[0];
    line("ANUNCIOS_TOTAL", r.total, r.total > 0, "tabela ads vazia");
    line("COM_COMMERCIAL_MODEL", r.com_modelo, true, "");
    line("ATIVOS_COM_MODELO", `${r.ativos_com_modelo} de ${r.ativos}`, true, "");
    const rate = r.nao_deletados ? r.nulos_nao_deletados / r.nao_deletados : 0;
    line(
      "NULL_ENTRE_NAO_DELETADOS",
      `${r.nulos_nao_deletados} de ${r.nao_deletados} (${(rate * 100).toFixed(1)} %)`,
      rate <= NULL_RATE_LIMIT,
      "acima de 20 % — revisar a lista antes de seguir"
    );
    line("SEARCH_VECTOR_NULO", r.vetor_nulo, r.vetor_nulo === 0, "anuncio sem search_vector");
    line(
      "VETOR_SEM_O_MODELO",
      r.vetor_sem_modelo,
      r.vetor_sem_modelo === 0,
      "anuncio com commercial_model cujo search_vector nao contem o modelo (trigger nao disparou)"
    );

    const { rows: nulls } = await client.query(
      `SELECT id, status, brand, model FROM ads WHERE commercial_model IS NULL ORDER BY status, id`
    );
    if (nulls.length) {
      console.log(`LISTA_NULL (${nulls.length}): id | status | brand | model`);
      for (const n of nulls)
        console.log(`  ${n.id} | ${n.status} | ${n.brand ?? "NULL"} | ${n.model ?? "NULL"}`);
    }

    // ── 3. Prova concreta em peso A ─────────────────────────────────────────
    const { rows: proof } = await client.query(
      `SELECT a.id, a.commercial_model,
              ts_rank(a.search_vector, to_tsquery('portuguese', quote_literal(lower(split_part(a.commercial_model, ' ', 1))) || ':A')) > 0 AS peso_a
         FROM ads a
        WHERE a.status = 'active' AND a.commercial_model IS NOT NULL
        ORDER BY a.id LIMIT 1`
    );
    if (proof.length) {
      line(
        `PROVA_PESO_A anuncio ${proof[0].id} (${proof[0].commercial_model})`,
        proof[0].peso_a ? "casa em peso A" : "NAO casa em peso A",
        proof[0].peso_a === true,
        "o lexema do modelo comercial nao esta em peso A"
      );
    } else {
      line(
        "PROVA_PESO_A",
        "sem anuncio ativo com modelo",
        false,
        "nenhum anuncio ativo com commercial_model para provar"
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
