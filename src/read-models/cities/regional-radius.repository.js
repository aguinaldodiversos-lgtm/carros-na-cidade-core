// src/read-models/cities/regional-radius.repository.js
//
// Queries do modelo "âncora regional" (Onda 2 Fase 2a). Fonte da cobertura =
// `region_memberships` (Haversine persistido, mesmo UF). Read-only.

import { pool } from "../../infrastructure/database/db.js";

/**
 * Cidades-membro de `citySlug` dentro do raio (km), da mais próxima p/ a mais
 * distante. NÃO inclui a própria cidade (distância 0 é a base). Mesmo UF já é
 * garantido pelo build de `region_memberships`.
 *
 * @returns Array<{ slug, name, state, distance_km }>
 */
export async function getRadiusMembers(citySlug, radiusKm) {
  const result = await pool.query(
    `
    SELECT m.slug, m.name, m.state, rm.distance_km
    FROM cities base
    JOIN region_memberships rm ON rm.base_city_id = base.id
    JOIN cities m ON m.id = rm.member_city_id
    WHERE base.slug = $1
      AND rm.distance_km IS NOT NULL
      AND rm.distance_km <= $2
    ORDER BY rm.distance_km ASC
    `,
    [citySlug, radiusKm]
  );
  return result.rows;
}

/** Contagem de anúncios ATIVOS da própria cidade (gate de indexação/âncora). */
export async function getOwnActiveCount(citySlug) {
  const result = await pool.query(
    `
    SELECT COUNT(*)::int AS total
    FROM ads a
    JOIN cities c ON c.id = a.city_id
    WHERE c.slug = $1 AND a.status = 'active'
    `,
    [citySlug]
  );
  return result.rows[0]?.total || 0;
}

