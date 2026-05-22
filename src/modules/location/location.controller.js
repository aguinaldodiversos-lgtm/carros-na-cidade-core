import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

import { resolveLocation } from "./location.service.js";

/**
 * Controller: POST /api/internal/location/resolve
 *
 * Body esperado:
 *   { latitude: number, longitude: number }
 *
 * Saída:
 *   200 { ok: true, data: { city, state, region, confidence, distanceKm } }
 *   200 { ok: true, data: null }   // fora de cobertura — frontend decide o fallback
 *   400 { ok: false, error: "..." } // payload inválido
 *
 * Princípios:
 *   - NÃO loga as coordenadas. Loga apenas o resultado agregado (já no
 *     service). Em log de erro, expõe message do erro mas não o body.
 *   - Resposta 200 + data:null para "fora de cobertura" — facilita o
 *     frontend distinguir "erro técnico" de "sem cidade próxima".
 */

export async function resolveLocationEndpoint(req, res, next) {
  try {
    const body = req.body || {};
    const lat = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
    const lng = typeof body.longitude === "number" ? body.longitude : Number(body.longitude);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ ok: false, error: "latitude inválida" });
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ ok: false, error: "longitude inválida" });
    }

    const result = await resolveLocation(lat, lng);

    // Diagnóstico em produção (header não-sensível) quando data:null —
    // distingue se a tabela cities está vazia/sem coords vs se o
    // haversine genuinamente não achou nada no raio. Coordenadas NUNCA
    // aparecem nos headers, só contagens agregadas.
    if (!result) {
      try {
        const probe = await pool.query(
          `
          SELECT
            COUNT(*)::int AS total,
            COUNT(*) FILTER (
              WHERE latitude IS NOT NULL AND longitude IS NOT NULL
            )::int AS with_geo,
            COUNT(*) FILTER (
              WHERE latitude IS NOT NULL
                AND longitude IS NOT NULL
                AND latitude BETWEEN $1 - 0.72 AND $1 + 0.72
            )::int AS in_bbox
          FROM cities
          `,
          [lat],
        );
        const row = probe.rows[0] || {};
        res.setHeader(
          "X-Diag-Cities",
          `total=${row.total ?? 0};with_geo=${row.with_geo ?? 0};in_bbox=${row.in_bbox ?? 0}`,
        );
      } catch (probeErr) {
        res.setHeader(
          "X-Diag-Cities",
          `probe_failed:${(probeErr?.message || "unknown").slice(0, 60)}`,
        );
      }
    }

    // 200 com data:null quando fora de cobertura. O frontend interpreta como
    // "sem cidade no raio aceitável" e cai para fallback estadual.
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    logger.error({ err: err?.message || String(err) }, "[location] resolveLocation falhou");
    return next(err);
  }
}
