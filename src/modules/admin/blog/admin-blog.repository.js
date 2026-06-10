import { pool } from "../../../infrastructure/database/db.js";

/**
 * Acesso direto a blog_posts (Fase 4.2 — CMS do Blog).
 *
 * Sem regra de negócio aqui — só SQL puro. Service valida payload, controla
 * transições de status, monta diff e dispara audit. Repository devolve row
 * crua ou null.
 *
 * Convenções:
 *   - Mutação parcial via updateById com build dinâmico de SET (mesmo padrão
 *     de admin-home.repository.updateByPosition): colunas não tocadas nunca
 *     são sobrescritas.
 *   - version bump + updated_at + updated_by_admin_id a cada UPDATE.
 *   - Leitura pública (apenas published) vive aqui também para o controller
 *     público não duplicar SQL — mas só expõe SELECT.
 */

const SELECT_COLS = `id, title, slug, excerpt, content,
  cover_image_url, cover_image_alt, category, tags, author_id,
  status, published_at, archived_at,
  meta_title, meta_description, canonical_url, og_image_url,
  is_indexable, reading_time_minutes,
  version, created_at, updated_at, updated_by_admin_id`;

/** Colunas que o service pode atualizar via PATCH (whitelist). */
const UPDATABLE_COLS = new Set([
  "title",
  "slug",
  "excerpt",
  "content",
  "cover_image_url",
  "cover_image_alt",
  "category",
  "tags",
  "status",
  "published_at",
  "archived_at",
  "meta_title",
  "meta_description",
  "canonical_url",
  "og_image_url",
  "is_indexable",
  "reading_time_minutes",
]);

function serializeValue(col, value) {
  // tags é JSONB — serializa arrays/objetos; demais colunas passam direto.
  if (col === "tags") return JSON.stringify(Array.isArray(value) ? value : []);
  return value;
}

/**
 * Listagem admin com filtros opcionais. search casa título OU slug
 * (ILIKE), status filtra exato. Retorna shape de paginação padrão do
 * projeto: { data, total, limit, offset }.
 */
export async function listPosts({ status, search, limit = 50, offset = 0 } = {}) {
  const where = [];
  const params = [];
  let i = 1;

  if (status) {
    where.push(`status = $${i++}`);
    params.push(String(status));
  }
  if (search && String(search).trim()) {
    where.push(`(title ILIKE $${i} OR slug ILIKE $${i})`);
    params.push(`%${String(search).trim()}%`);
    i++;
  }

  const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

  const safeLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}
       FROM blog_posts
      ${whereSql}
      ORDER BY updated_at DESC, id DESC
      LIMIT $${i++} OFFSET $${i}`,
    [...params, safeLimit, safeOffset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM blog_posts ${whereSql}`,
    params
  );

  return {
    data: rows,
    total: countResult.rows[0]?.total || 0,
    limit: safeLimit,
    offset: safeOffset,
  };
}

export async function findById(id) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) return null;
  const { rows } = await pool.query(`SELECT ${SELECT_COLS} FROM blog_posts WHERE id = $1 LIMIT 1`, [
    numericId,
  ]);
  return rows[0] || null;
}

/**
 * Lookup por slug para verificação de unicidade. `excludeId` permite
 * checar colisão ao renomear o slug de um post existente.
 */
export async function findBySlug(slug, { excludeId = null } = {}) {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  const params = [safeSlug];
  let sql = `SELECT ${SELECT_COLS} FROM blog_posts WHERE slug = $1`;
  if (excludeId != null) {
    sql += ` AND id <> $2`;
    params.push(Number(excludeId));
  }
  sql += ` LIMIT 1`;

  const { rows } = await pool.query(sql, params);
  return rows[0] || null;
}

/**
 * INSERT de post novo (sempre nasce draft — service garante).
 */
export async function insertPost(fields) {
  const cols = [];
  const placeholders = [];
  const params = [];
  let i = 1;

  for (const [col, value] of Object.entries(fields)) {
    if (!UPDATABLE_COLS.has(col) && col !== "author_id" && col !== "updated_by_admin_id") continue;
    cols.push(col);
    placeholders.push(col === "tags" ? `$${i++}::jsonb` : `$${i++}`);
    params.push(serializeValue(col, value));
  }

  const { rows } = await pool.query(
    `INSERT INTO blog_posts (${cols.join(", ")})
     VALUES (${placeholders.join(", ")})
     RETURNING ${SELECT_COLS}`,
    params
  );
  return rows[0] || null;
}

/**
 * UPDATE parcial atômico por id. Bump de version + updated_at +
 * updated_by_admin_id em toda mutação.
 */
export async function updateById(id, fields, adminUserId) {
  const numericId = Number(id);
  if (!Number.isInteger(numericId) || numericId <= 0) {
    throw new Error("[admin-blog.repository] id inválido");
  }

  const sets = [];
  const params = [];
  let i = 1;

  for (const [col, value] of Object.entries(fields)) {
    if (!UPDATABLE_COLS.has(col)) continue;
    sets.push(col === "tags" ? `${col} = $${i++}::jsonb` : `${col} = $${i++}`);
    params.push(serializeValue(col, value));
  }

  sets.push(`version = version + 1`);
  sets.push(`updated_at = NOW()`);
  sets.push(`updated_by_admin_id = $${i++}`);
  params.push(adminUserId == null ? null : String(adminUserId));

  params.push(numericId);

  const { rows } = await pool.query(
    `UPDATE blog_posts
        SET ${sets.join(", ")}
      WHERE id = $${i}
      RETURNING ${SELECT_COLS}`,
    params
  );
  return rows[0] || null;
}

// ───────────────────────────────────────────────────────────────────────────
// Leitura pública — apenas published.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Lista pública paginada: somente status='published', ordenada por
 * published_at DESC. Filtro opcional por categoria.
 */
export async function listPublishedPosts({ category, limit = 12, offset = 0 } = {}) {
  const where = [`status = 'published'`];
  const params = [];
  let i = 1;

  if (category && String(category).trim()) {
    where.push(`category = $${i++}`);
    params.push(String(category).trim());
  }

  const whereSql = `WHERE ${where.join(" AND ")}`;
  const safeLimit = Math.min(Math.max(Number(limit) || 12, 1), 50);
  const safeOffset = Math.max(Number(offset) || 0, 0);

  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}
       FROM blog_posts
      ${whereSql}
      ORDER BY published_at DESC NULLS LAST, id DESC
      LIMIT $${i++} OFFSET $${i}`,
    [...params, safeLimit, safeOffset]
  );

  const countResult = await pool.query(
    `SELECT COUNT(*)::int AS total FROM blog_posts ${whereSql}`,
    params
  );

  return {
    data: rows,
    total: countResult.rows[0]?.total || 0,
    limit: safeLimit,
    offset: safeOffset,
  };
}

/**
 * Detalhe público por slug — retorna null se não existir OU se não estiver
 * published (draft/unpublished/archived são invisíveis ao público).
 */
export async function findPublishedBySlug(slug) {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;
  const { rows } = await pool.query(
    `SELECT ${SELECT_COLS}
       FROM blog_posts
      WHERE slug = $1 AND status = 'published'
      LIMIT 1`,
    [safeSlug]
  );
  return rows[0] || null;
}
