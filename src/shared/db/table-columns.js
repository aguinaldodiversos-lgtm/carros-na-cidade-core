import { pool } from "../../infrastructure/database/db.js";

const cache = new Map();

/**
 * Colunas existentes na tabela (schema atual do Postgres).
 */
export async function getTableColumnSet(tableName) {
  const key = String(tableName || "")
    .trim()
    .toLowerCase();
  if (!key) return new Set();

  if (cache.has(key)) {
    return cache.get(key);
  }

  try {
    const result = await pool.query(
      `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = $1
      `,
      [key]
    );

    const columns = new Set(result.rows.map((row) => row.column_name));
    cache.set(key, columns);
    return columns;
  } catch {
    const empty = new Set();
    cache.set(key, empty);
    return empty;
  }
}

export function tableHasColumn(columnSet, name) {
  return columnSet.has(name);
}
