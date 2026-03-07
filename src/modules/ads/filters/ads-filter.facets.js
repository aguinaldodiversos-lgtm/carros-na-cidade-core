import { pool } from "../../../infrastructure/database/db.js";
import { buildAdsFacetWhere } from "./ads-filter.builder.js";

export async function getAdsFacets(filters = {}) {
  const { whereClause, params } = buildAdsFacetWhere(filters);

  const [brands, models, fuelTypes, bodyTypes] = await Promise.all([
    pool.query(
      `
      SELECT a.brand, COUNT(*)::int AS total
      FROM ads a
      LEFT JOIN cities c ON c.id = a.city_id
      ${whereClause}
        AND a.brand IS NOT NULL
      GROUP BY a.brand
      ORDER BY total DESC, a.brand ASC
      LIMIT 20
      `,
      params
    ),
    pool.query(
      `
      SELECT a.brand, a.model, COUNT(*)::int AS total
      FROM ads a
      LEFT JOIN cities c ON c.id = a.city_id
      ${whereClause}
        AND a.brand IS NOT NULL
        AND a.model IS NOT NULL
      GROUP BY a.brand, a.model
      ORDER BY total DESC, a.brand ASC, a.model ASC
      LIMIT 30
      `,
      params
    ),
    pool.query(
      `
      SELECT a.fuel_type, COUNT(*)::int AS total
      FROM ads a
      LEFT JOIN cities c ON c.id = a.city_id
      ${whereClause}
        AND a.fuel_type IS NOT NULL
      GROUP BY a.fuel_type
      ORDER BY total DESC, a.fuel_type ASC
      LIMIT 15
      `,
      params
    ),
    pool.query(
      `
      SELECT a.body_type, COUNT(*)::int AS total
      FROM ads a
      LEFT JOIN cities c ON c.id = a.city_id
      ${whereClause}
        AND a.body_type IS NOT NULL
      GROUP BY a.body_type
      ORDER BY total DESC, a.body_type ASC
      LIMIT 15
      `,
      params
    ),
  ]);

  return {
    brands: brands.rows,
    models: models.rows,
    fuelTypes: fuelTypes.rows,
    bodyTypes: bodyTypes.rows,
  };
}
