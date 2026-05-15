/**
 * Builder puro de SQL para audit-production-image-integrity.mjs.
 *
 * REQUIRED: id, images (sem images não há o que auditar).
 * OPTIONAL: title, slug, status, created_at, city_id.
 */

import { buildSafeColumnList } from "./audit-shared.mjs";

export const REQUIRED_ADS_IMAGE_COLUMNS = ["id", "images"];
export const OPTIONAL_ADS_IMAGE_COLUMNS = ["title", "slug", "status", "created_at", "city_id"];
export const ALL_ADS_IMAGE_COLUMNS = [
  ...REQUIRED_ADS_IMAGE_COLUMNS,
  ...OPTIONAL_ADS_IMAGE_COLUMNS,
];

export function buildImagesAuditQuery({ availableColumns, args }) {
  const { present, missing } = buildSafeColumnList(availableColumns, ALL_ADS_IMAGE_COLUMNS);

  for (const req of REQUIRED_ADS_IMAGE_COLUMNS) {
    if (!present.includes(req)) {
      throw new Error(
        `[audit-image-integrity] tabela ads sem coluna obrigatória '${req}'. Rode --print-schema.`
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
    FROM ads
    ${whereClause}
    ${orderBy}
    LIMIT $${limitPos}
  `.trim();

  return { sql, params, present, missing };
}
