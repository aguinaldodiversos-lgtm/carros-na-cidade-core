import * as adsService from "./ads.service.js";
import { getFacets } from "./facets.service.js";
import {
  normalizeFacetFilters,
  normalizeSearchFilters,
  validateAdIdentifier,
  validateAdId,
  validateCreateAdPayload,
  sanitizeString,
} from "./ads.validators.js";
import { pool } from "../../infrastructure/database/db.js";

export async function autocomplete(req, res, next) {
  try {
    const q = sanitizeString(req.query.q);

    if (!q || q.length < 2) {
      return res.json({ success: true, suggestions: [] });
    }

    const queryText = q.slice(0, 80);

    const result = await pool.query(
      `
      SELECT
        brand,
        model,
        city,
        COUNT(*) as total,
        ts_rank(search_vector, plainto_tsquery('portuguese', $1)) AS rank
      FROM ads
      WHERE
        status = 'active'
        AND search_vector @@ plainto_tsquery('portuguese', $1)
      GROUP BY brand, model, city, search_vector
      ORDER BY rank DESC, total DESC
      LIMIT 8
      `,
      [queryText]
    );

    const suggestions = result.rows.map((row) => ({
      label: `${row.brand} ${row.model} - ${row.city}`,
      brand: row.brand,
      model: row.model,
      city: row.city,
      total: Number(row.total),
    }));

    res.json({ success: true, suggestions });
  } catch (err) {
    next(err);
  }
}

export async function facets(req, res, next) {
  try {
    const filters = normalizeFacetFilters(req.query);
    const facets = await getFacets(filters);

    res.json({
      success: true,
      facets,
    });
  } catch (err) {
    next(err);
  }
}

export async function list(req, res, next) {
  try {
    const filters = normalizeSearchFilters(req.query);
    const result = await adsService.list(filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function search(req, res, next) {
  try {
    const filters = normalizeSearchFilters(req.query);
    const result = await adsService.search(filters);

    res.json({
      success: true,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}

export async function show(req, res, next) {
  try {
    const identifier = validateAdIdentifier(req.params.identifier);
    const ad = await adsService.show(identifier);

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function create(req, res, next) {
  try {
    const payload = validateCreateAdPayload(req.body);
    const ad = await adsService.create(payload, req.user);

    res.status(201).json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function update(req, res, next) {
  try {
    const id = validateAdId(req.params.id);
    const ad = await adsService.update(id, req.body, req.user);

    res.json({
      success: true,
      data: ad,
    });
  } catch (err) {
    next(err);
  }
}

export async function remove(req, res, next) {
  try {
    const id = validateAdId(req.params.id);
    await adsService.remove(id, req.user);

    res.json({
      success: true,
      message: "Anúncio removido com sucesso",
    });
  } catch (err) {
    next(err);
  }
}
