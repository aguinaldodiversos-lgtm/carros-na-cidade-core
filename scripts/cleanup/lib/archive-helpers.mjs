/**
 * SQL builders puros para archive-test-ads.mjs.
 *
 * Pattern: cada função devolve `{ sql, params }` — caller faz a chamada
 * em `pool` ou `client` (transação). Funções não tocam DB.
 *
 * Segurança:
 *   - Todos os UPDATE usam WHERE id = ANY($1::bigint[]) — proteção contra
 *     UPDATE em tabela inteira por engano.
 *   - Todos os UPDATE têm filtro adicional `status = $2` — só altera
 *     anúncios que AINDA estão no status esperado. Se algo mudou entre
 *     audit e archive, esse ad não é tocado.
 *   - NUNCA gera SQL com DELETE. Teste estático em
 *     tests/cleanup/no-delete.test.js valida.
 */

/**
 * SELECT que produz o snapshot pré-update: estado atual dos anúncios
 * candidatos. As colunas vêm do schema introspectado (mesmo pattern do
 * PR 6 audit) — colunas opcionais ausentes viram null no resultado.
 */
export function buildSnapshotSelectQuery({ candidateIds, fromStatus, availableColumns }) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new Error("[archive-helpers] buildSnapshotSelectQuery: candidateIds vazio");
  }
  if (!fromStatus) {
    throw new Error("[archive-helpers] buildSnapshotSelectQuery: fromStatus obrigatório");
  }
  if (!(availableColumns instanceof Set)) {
    throw new Error("[archive-helpers] buildSnapshotSelectQuery: availableColumns precisa ser Set");
  }

  const requested = ["id", "status", "title", "slug", "city_id", "state", "created_at"];
  const present = requested.filter((c) => availableColumns.has(c));

  if (!present.includes("id") || !present.includes("status")) {
    throw new Error(
      `[archive-helpers] tabela ads precisa de 'id' e 'status' (presentes: ${present.join(", ") || "nenhuma"})`
    );
  }

  const sql = `
    SELECT ${present.join(", ")}
    FROM ads
    WHERE id = ANY($1::bigint[])
      AND status = $2
    ORDER BY id ASC
  `.trim();

  return { sql, params: [candidateIds, fromStatus], present };
}

/**
 * UPDATE de arquivamento. Só atualiza anúncios que ainda têm o status
 * esperado — proteção contra race between audit + execute.
 *
 * Devolve o rowcount via RETURNING id para o caller comparar com o
 * tamanho do snapshot (se divergir, alerta).
 */
export function buildArchiveUpdateQuery({ candidateIds, fromStatus, toStatus }) {
  if (!Array.isArray(candidateIds) || candidateIds.length === 0) {
    throw new Error("[archive-helpers] buildArchiveUpdateQuery: candidateIds vazio");
  }
  if (!fromStatus || !toStatus) {
    throw new Error("[archive-helpers] buildArchiveUpdateQuery: fromStatus/toStatus obrigatórios");
  }
  if (fromStatus === toStatus) {
    throw new Error("[archive-helpers] fromStatus == toStatus (no-op rejeitado)");
  }

  const sql = `
    UPDATE ads
       SET status = $3
     WHERE id = ANY($1::bigint[])
       AND status = $2
    RETURNING id, status
  `.trim();

  return { sql, params: [candidateIds, fromStatus, toStatus] };
}

/**
 * Inventory queries — total ativo, por estado, por cidade. Aceita uma
 * exclusionIds opcional para simular "depois de arquivar".
 */
export function buildInventoryQueries({ excludeIds = [], availableColumns } = {}) {
  if (!(availableColumns instanceof Set)) {
    throw new Error("[archive-helpers] buildInventoryQueries: availableColumns precisa ser Set");
  }
  if (!availableColumns.has("status")) {
    throw new Error("[archive-helpers] tabela ads precisa de coluna 'status' para inventory");
  }

  const hasExcludes = excludeIds.length > 0;
  const hasState = availableColumns.has("state");
  const hasCityId = availableColumns.has("city_id");

  const whereActive = hasExcludes
    ? `status = 'active' AND NOT (id = ANY($1::bigint[]))`
    : `status = 'active'`;
  const baseParams = hasExcludes ? [excludeIds] : [];

  const total = {
    sql: `SELECT COUNT(*)::int AS total FROM ads WHERE ${whereActive}`,
    params: baseParams,
  };

  const byState = hasState
    ? {
        sql: `
        SELECT state, COUNT(*)::int AS count
          FROM ads
         WHERE ${whereActive}
         GROUP BY state
         ORDER BY count DESC, state ASC
      `.trim(),
        params: baseParams,
      }
    : null;

  const byCity = hasCityId
    ? {
        sql: `
        SELECT a.city_id, c.name AS city_name, COUNT(*)::int AS count
          FROM ads a
          LEFT JOIN cities c ON c.id = a.city_id
         WHERE ${whereActive.replace(/\bid\b/g, "a.id").replace(/\bstatus\b/g, "a.status")}
         GROUP BY a.city_id, c.name
         ORDER BY count DESC, c.name ASC NULLS LAST
         LIMIT 50
      `.trim(),
        params: baseParams,
      }
    : null;

  return { total, byState, byCity };
}

/**
 * Computa array de alertas a partir do inventário final.
 */
export function computeInventoryAlerts({ totalActiveAfter, minRemainingActive }) {
  const alerts = [];
  if (totalActiveAfter <= 0) {
    alerts.push(
      "INVENTÁRIO ZERADO após arquivamento. Vitrine ficará vazia. Não ativar SEO regional."
    );
  } else if (totalActiveAfter < minRemainingActive) {
    alerts.push(
      `Após arquivar anúncios de teste, restarão apenas ${totalActiveAfter} anúncio(s) ativo(s) (< ${minRemainingActive}). ` +
        "Não ativar SEO regional. A prioridade é popular inventário real antes de indexar."
    );
  }
  return alerts;
}

/**
 * Resume um finding cru para o snapshot e o resultado — só campos
 * relevantes para auditoria e rollback. PII já redactada na auditoria.
 */
export function buildSnapshotEntry({ row, reason, archiveTimestamp }) {
  return {
    id: row.id,
    previous_status: row.status,
    title: row.title ?? null,
    slug: row.slug ?? null,
    city_id: row.city_id ?? null,
    state: row.state ?? null,
    created_at: row.created_at ?? null,
    archive_reason: reason || "test_ad_suspect:high",
    archive_timestamp: archiveTimestamp || new Date().toISOString(),
  };
}
