/**
 * Schema readiness check — defesa contra deploy do backend novo sem a
 * migration 025 de antifraude/moderação aplicada.
 *
 * Por quê isto existe:
 *
 *   O pipeline de criação (`createAdNormalized`) tem `try/catch` defensivo
 *   ao redor da persistência de risk/snapshot/eventos. Se as colunas
 *   `risk_score|risk_level|...` ou as tabelas `ad_risk_signals` e
 *   `ad_moderation_events` não existirem, o INSERT do anúncio passa, mas
 *   a auditoria fica vazia. Em produção, isso significa anúncios sendo
 *   criados sem rastro de antifraude — falha silenciosa GRAVE.
 *
 *   Esta função detecta o estado do schema e permite que:
 *     - boot da API recuse a subir em produção;
 *     - `/health` retorne 503 (Render marca instance unhealthy);
 *     - dev/test apenas logue um warning controlado.
 *
 * O check é PURO: recebe um objeto `db` com `query(sql, params)` e
 * retorna `{ ok, missingColumns, missingTables }`. Sem efeito colateral,
 * sem dependência de runtime — fácil de testar com mock.
 */

/**
 * Colunas obrigatórias em `ads` introduzidas pela migration 025.
 * Mantenha sincronizado com `src/database/migrations/025_ads_antifraud_moderation.sql`.
 */
export const ANTIFRAUD_REQUIRED_COLUMNS = Object.freeze([
  "risk_score",
  "risk_level",
  "risk_reasons",
  "reviewed_at",
  "reviewed_by",
  "rejection_reason",
  "correction_requested_reason",
  "fipe_reference_value",
  "fipe_diff_percent",
  "structural_change_count",
]);

/** Tabelas auxiliares introduzidas pela migration 025. */
export const ANTIFRAUD_REQUIRED_TABLES = Object.freeze([
  "ad_risk_signals",
  "ad_moderation_events",
]);

/**
 * Verifica que todas as colunas e tabelas exigidas pela migration 025
 * existem no banco apontado por `db`.
 *
 * @param {object} db — objeto com `query(sql, params)` (`pool` do projeto).
 * @returns {Promise<{
 *   ok: boolean,
 *   missingColumns: string[],
 *   missingTables: string[],
 *   checkedAt: string
 * }>}
 */
export async function checkAntifraudSchema(db) {
  if (!db || typeof db.query !== "function") {
    throw new TypeError(
      "checkAntifraudSchema: parâmetro `db` deve ter método query(sql, params)."
    );
  }

  const checkedAt = new Date().toISOString();

  // Uma única query para colunas (filtro pelo schema corrente — multi-DB seguro).
  const colSql = `
    SELECT column_name
      FROM information_schema.columns
     WHERE table_schema = current_schema()
       AND table_name = 'ads'
       AND column_name = ANY($1::text[])
  `;
  const tableSql = `
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = current_schema()
       AND table_name = ANY($1::text[])
  `;

  const [colsRes, tablesRes] = await Promise.all([
    db.query(colSql, [ANTIFRAUD_REQUIRED_COLUMNS.slice()]),
    db.query(tableSql, [ANTIFRAUD_REQUIRED_TABLES.slice()]),
  ]);

  const presentColumns = new Set(
    (colsRes?.rows || []).map((r) => r.column_name)
  );
  const presentTables = new Set(
    (tablesRes?.rows || []).map((r) => r.table_name)
  );

  const missingColumns = ANTIFRAUD_REQUIRED_COLUMNS.filter(
    (c) => !presentColumns.has(c)
  );
  const missingTables = ANTIFRAUD_REQUIRED_TABLES.filter(
    (t) => !presentTables.has(t)
  );

  return {
    ok: missingColumns.length === 0 && missingTables.length === 0,
    missingColumns,
    missingTables,
    checkedAt,
  };
}

/**
 * Wrapper que aplica a política de boot por ambiente:
 *   - production / staging → throw em caso de schema incompleto
 *   - development / test   → warn no logger e segue
 *
 * Quando lança, a mensagem inclui exatamente o que está faltando para o
 * operador rodar a migration certa.
 *
 * @param {object} db
 * @param {object} [opts]
 * @param {string} [opts.env=process.env.NODE_ENV]
 * @param {object} [opts.logger]
 * @returns {Promise<ReturnType<typeof checkAntifraudSchema>>}
 */
export async function enforceAntifraudSchemaAtBoot(db, opts = {}) {
  const env = String(opts.env ?? process.env.NODE_ENV ?? "development").toLowerCase();
  const log = opts.logger;

  let result;
  try {
    result = await checkAntifraudSchema(db);
  } catch (err) {
    // Se a query falhar (DB down, permissões), o erro é registrado e
    // re-lançado. Boot deve falhar — não há como provar que o schema
    // está correto se nem dá pra consultar.
    log?.error?.(
      {
        domain: "schema-readiness.antifraud",
        env,
        err: err?.message || String(err),
      },
      "[schema] falha ao consultar information_schema (não foi possível verificar migration 025)"
    );
    throw err;
  }

  if (result.ok) {
    log?.info?.(
      {
        domain: "schema-readiness.antifraud",
        env,
        columns: ANTIFRAUD_REQUIRED_COLUMNS.length,
        tables: ANTIFRAUD_REQUIRED_TABLES.length,
      },
      "[schema] migration 025 (antifraude/moderação) presente — schema OK"
    );
    return result;
  }

  const summary = {
    missingColumns: result.missingColumns,
    missingTables: result.missingTables,
    hint:
      "Aplique a migration 025_ads_antifraud_moderation.sql " +
      "(npm run db:migrate). Ver docs/runbooks/025-antifraud-moderation-migration.md.",
  };

  // Em production/staging falhamos o boot. Não é só warning porque o
  // pipeline tem try/catch que mascara a ausência das colunas — logs
  // ficariam silenciosos e auditoria antifraude vazia.
  if (env === "production" || env === "staging") {
    log?.error?.(
      {
        domain: "schema-readiness.antifraud",
        env,
        ...summary,
      },
      "[schema] migration 025 ausente em production/staging — abortando boot"
    );
    const error = new Error(
      `Migration 025 (antifraude/moderação) não está aplicada. ` +
        `Faltam ${result.missingColumns.length} coluna(s) em ads ` +
        `(${result.missingColumns.join(", ") || "—"}) e ` +
        `${result.missingTables.length} tabela(s) ` +
        `(${result.missingTables.join(", ") || "—"}). ` +
        summary.hint
    );
    error.code = "SCHEMA_READINESS_MISSING_MIGRATION_025";
    error.details = summary;
    throw error;
  }

  // Dev/test: warning controlado e segue. Útil para QA local com banco
  // limpo recém-criado em outro branch.
  log?.warn?.(
    {
      domain: "schema-readiness.antifraud",
      env,
      ...summary,
    },
    "[schema] migration 025 ausente — modo dev/test, prosseguindo com warning"
  );
  return result;
}
