/**
 * Builders puros de SQL para o script audit-production-ads-quality.mjs.
 *
 * Por que arquivo separado:
 *   O script principal importa `pool` + tem `main()` no top-level (padrão
 *   do projeto, ver `cleanup-orphan-test-ads.mjs`). Esse top-level dispara
 *   conexão com DB ao importar, o que polui testes unitários. Os builders
 *   ficam aqui, isolados e puros — testáveis sem mock de pool.
 *
 * Contrato:
 *   - REQUIRED_ADS_COLUMNS / OPTIONAL_ADS_COLUMNS são a SSoT das colunas
 *     que o script consulta.
 *   - buildAdsQualityQuery: gera SELECT respeitando colunas disponíveis.
 *     Lança erro se faltar coluna REQUIRED. OPTIONAL ausente vira warning
 *     no caller.
 *   - buildDuplicateSlugsQuery: GROUP BY com WHERE de status só se a
 *     coluna existir.
 */

import { buildSafeColumnList } from "./audit-shared.mjs";

export const REQUIRED_ADS_COLUMNS = ["id", "title", "slug", "status"];
export const OPTIONAL_ADS_COLUMNS = [
  "brand",
  "model",
  "version",
  "description",
  "city",
  "state",
  "city_id",
  "plan",
  "created_at",
  "advertiser_id",
  "dealership_id",
  "user_id",
];

export const ALL_ADS_COLUMNS = [...REQUIRED_ADS_COLUMNS, ...OPTIONAL_ADS_COLUMNS];

/**
 * Constrói SELECT da tabela ads com as colunas que existem em produção.
 *
 * @param {object} input
 * @param {Set<string>} input.availableColumns - Set vindo de `fetchExistingColumns(pool, "ads")`
 * @param {object} input.args - { limit, statusFilter, sinceDays }
 * @param {string} [input.targetTable="ads"] - nome da tabela (testado em runtime contra SAFE_IDENTIFIER_RE)
 * @returns {{ sql: string, params: any[], present: string[], missing: string[] }}
 * @throws {Error} se uma coluna REQUIRED estiver ausente
 */
export function buildAdsQualityQuery({ availableColumns, args, targetTable = "ads" }) {
  const { present, missing } = buildSafeColumnList(availableColumns, ALL_ADS_COLUMNS);

  for (const req of REQUIRED_ADS_COLUMNS) {
    if (!present.includes(req)) {
      throw new Error(
        `[audit-ads-quality] coluna obrigatória '${req}' não existe na tabela ${targetTable}. ` +
          `Rode --print-schema para ver as colunas detectadas.`
      );
    }
  }

  const where = [];
  const params = [];

  if (args.statusFilter && present.includes("status")) {
    params.push(args.statusFilter);
    where.push(`status = $${params.length}`);
  }
  if (args.sinceDays && present.includes("created_at")) {
    params.push(args.sinceDays);
    where.push(`created_at >= NOW() - ($${params.length}::int * INTERVAL '1 day')`);
  }

  params.push(args.limit);
  const limitPos = params.length;

  const whereClause = where.length > 0 ? `WHERE ${where.join(" AND ")}` : "";
  const orderBy = present.includes("created_at") ? "ORDER BY created_at DESC" : "";

  const sql = `
    SELECT ${present.join(", ")}
    FROM ${targetTable}
    ${whereClause}
    ${orderBy}
    LIMIT $${limitPos}
  `.trim();

  return { sql, params, present, missing };
}

/**
 * SQL de duplicatas de slug. Só inclui filtro de status se a coluna
 * existir — defesa para tabelas em schemas reduzidos.
 */
export function buildDuplicateSlugsQuery({ availableColumns, args, targetTable = "ads" }) {
  if (!availableColumns.has("slug")) {
    throw new Error(`[audit-ads-quality] tabela ${targetTable} sem coluna 'slug' — incompatível com auditoria.`);
  }
  const hasStatus = availableColumns.has("status");
  const params = [];
  const filters = ["slug IS NOT NULL", "slug <> ''"];
  if (hasStatus && args.statusFilter) {
    params.push(args.statusFilter);
    filters.push(`status = $${params.length}`);
  }
  const sql = `
    SELECT slug, COUNT(*)::int AS cnt, ARRAY_AGG(id ORDER BY id) AS ids
    FROM ${targetTable}
    WHERE ${filters.join(" AND ")}
    GROUP BY slug
    HAVING COUNT(*) > 1
    ORDER BY cnt DESC, slug ASC
    LIMIT 500
  `.trim();
  return { sql, params };
}
