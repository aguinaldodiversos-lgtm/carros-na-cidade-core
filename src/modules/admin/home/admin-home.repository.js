import { pool } from "../../../infrastructure/database/db.js";

/**
 * Acesso direto a home_sections (Fase 4.1.1 — carrossel multi-banner).
 *
 * Sem regra de negócio aqui — só SQL puro. Service valida payload, monta
 * diff e dispara audit. Repository devolve row crua ou null.
 *
 * Convenções:
 *   - section_type identifica o agrupamento ('home_hero', futuros…).
 *   - position é 1..3 para home_hero (enforce no service + CHECK SQL).
 *   - key é gerada como `<section_type>_<position>` por convenção; mantida
 *     como UNIQUE para lookup explícito por audit (target_id = key).
 */

const SELECT_COLS = `id, key, section_type, position,
  title, subtitle, cta_label, cta_url,
  image_desktop_url, image_mobile_url, image_alt,
  is_active, version, created_at, updated_at, updated_by_admin_id`;

/**
 * Lista todas as rows de um section_type ordenadas por position.
 *
 * `includeInactive=true` é o uso admin (vê tudo, ativo ou não).
 * `includeInactive=false` é o uso público (só ativos, na ordem do carrossel).
 */
export async function listBySectionType(sectionType, { includeInactive = true } = {}) {
  const safeType = String(sectionType || "").trim();
  if (!safeType) return [];

  const where = includeInactive
    ? "WHERE section_type = $1"
    : "WHERE section_type = $1 AND is_active = TRUE";

  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}
       FROM home_sections
      ${where}
      ORDER BY position NULLS LAST, id`,
    [safeType]
  );
  return rows;
}

/**
 * Busca uma linha por (section_type, position). Útil para PATCH/upload
 * direcionado a um banner específico.
 */
export async function findByPosition(sectionType, position) {
  const safeType = String(sectionType || "").trim();
  const pos = Number(position);
  if (!safeType || !Number.isInteger(pos)) return null;

  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}
       FROM home_sections
      WHERE section_type = $1 AND position = $2
      LIMIT 1`,
    [safeType, pos]
  );
  return rows[0] || null;
}

/**
 * UPDATE atômico de UMA row identificada por (section_type, position).
 *
 * Bump de version + updated_at + updated_by_admin_id. Build dinâmico para
 * PATCH parcial (não sobrescreve colunas não tocadas). CRÍTICO: o WHERE
 * inclui section_type + position — não dá para um PATCH do Banner 1
 * atingir o Banner 2 acidentalmente.
 */
export async function updateByPosition(sectionType, position, fields, adminUserId) {
  const safeType = String(sectionType || "").trim();
  const pos = Number(position);
  if (!safeType) throw new Error("[admin-home.repository] section_type obrigatório");
  if (!Number.isInteger(pos)) throw new Error("[admin-home.repository] position inválido");

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

  sets.push(`version = version + 1`);
  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by_admin_id = $${i++}`);
  params.push(adminUserId == null ? null : String(adminUserId));

  // Section_type + position no WHERE — isolamento por banner garantido.
  params.push(safeType);
  params.push(pos);

  const sql = `
    UPDATE home_sections
       SET ${sets.join(", ")}
     WHERE section_type = $${i++}
       AND position     = $${i}
     RETURNING ${SELECT_COLS}
  `;

  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}
