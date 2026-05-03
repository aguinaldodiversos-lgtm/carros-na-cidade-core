import { pool } from "../../infrastructure/database/db.js";

/**
 * Lê a região aproximada de uma cidade-base.
 *
 * Retorna `null` quando a cidade-base não existe (slug desconhecido). Para
 * cidades-base que existem mas não têm vizinhos cadastrados em
 * `region_memberships` (ex.: lat/long ainda não populados, worker
 * `regions:build` ainda não rodou), retorna `{ base, members: [] }`.
 *
 * `members` exclui a self-row (layer 0). Cliente que quiser tratar a
 * cidade-base como membro da própria região deve injetá-la separadamente
 * — semanticamente, "membros" = vizinhos.
 *
 * Ordenação: layer ASC (1 antes de 2), distance_km ASC, name ASC. A ordem
 * deixa as cidades mais próximas no topo da lista, dentro de cada camada.
 */
export async function getRegionByBaseSlug(slug) {
  const safeSlug = String(slug || "").trim();
  if (!safeSlug) return null;

  const baseResult = await pool.query(
    `SELECT id, slug, name, state FROM cities WHERE slug = $1 LIMIT 1`,
    [safeSlug]
  );

  const base = baseResult.rows[0];
  if (!base) return null;

  const membersResult = await pool.query(
    `
    SELECT
      c.id        AS city_id,
      c.slug      AS slug,
      c.name      AS name,
      c.state     AS state,
      rm.layer    AS layer,
      rm.distance_km AS distance_km
    FROM region_memberships rm
    JOIN cities c ON c.id = rm.member_city_id
    WHERE rm.base_city_id = $1
      AND rm.member_city_id != $1
    ORDER BY rm.layer ASC, rm.distance_km ASC NULLS LAST, c.name ASC
    `,
    [base.id]
  );

  return {
    base: {
      id: Number(base.id),
      slug: base.slug,
      name: base.name,
      state: base.state,
    },
    members: membersResult.rows.map((row) => ({
      city_id: Number(row.city_id),
      slug: row.slug,
      name: row.name,
      state: row.state,
      layer: Number(row.layer),
      distance_km: row.distance_km == null ? null : Number(row.distance_km),
    })),
  };
}
