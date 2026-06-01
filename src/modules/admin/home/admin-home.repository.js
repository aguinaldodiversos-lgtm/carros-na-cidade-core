import { pool } from "../../../infrastructure/database/db.js";

/**
 * Acesso direto a home_sections. Sem regra de negócio aqui — só SQL.
 * Service valida payload, monta diff e dispara audit.
 *
 * Padrão alinhado a admin-seo.repository.js: funções pequenas, retornam
 * row crua ou null.
 */

/**
 * Busca a linha por key. Inclui registros inativos — o caller decide se
 * filtra por is_active. Retorna null se não existir.
 */
export async function findByKey(key) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return null;

  const { rows } = await pool.query(
    `SELECT id, key, title, subtitle, cta_label, cta_url,
            image_desktop_url, image_mobile_url, image_alt,
            is_active, version, created_at, updated_at, updated_by_admin_id
     FROM home_sections
     WHERE key = $1
     LIMIT 1`,
    [safeKey]
  );
  return rows[0] || null;
}

/**
 * UPDATE atômico com bump de version + updated_at + updated_by_admin_id.
 *
 * `fields` é um objeto com APENAS colunas conhecidas — service garante
 * isso. Build dinâmico para suportar PATCH parcial sem reescrever
 * colunas não tocadas (ex.: PATCH só do title preserva image_desktop_url).
 */
export async function updateByKey(key, fields, adminUserId) {
  const safeKey = String(key || "").trim();
  if (!safeKey) throw new Error("[admin-home.repository] key obrigatória");

  const allowed = [
    "title",
    "subtitle",
    "cta_label",
    "cta_url",
    "image_desktop_url",
    "image_mobile_url",
    "image_alt",
    "is_active",
  ];

  const sets = [];
  const params = [];
  let i = 1;

  for (const col of allowed) {
    if (Object.prototype.hasOwnProperty.call(fields, col)) {
      sets.push(`${col} = $${i++}`);
      params.push(fields[col]);
    }
  }

  // Sempre bump version + timestamps + admin id.
  sets.push(`version = version + 1`);
  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by_admin_id = $${i++}`);
  params.push(adminUserId == null ? null : String(adminUserId));

  // key na cláusula WHERE.
  params.push(safeKey);

  const sql = `
    UPDATE home_sections
       SET ${sets.join(", ")}
     WHERE key = $${i}
     RETURNING id, key, title, subtitle, cta_label, cta_url,
              image_desktop_url, image_mobile_url, image_alt,
              is_active, version, created_at, updated_at, updated_by_admin_id
  `;

  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
