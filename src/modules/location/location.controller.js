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
    const body = (req.body || {});
    const lat = typeof body.latitude === "number" ? body.latitude : Number(body.latitude);
    const lng =
      typeof body.longitude === "number" ? body.longitude : Number(body.longitude);

    if (!Number.isFinite(lat) || lat < -90 || lat > 90) {
      return res.status(400).json({ ok: false, error: "latitude inválida" });
    }

    if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
      return res.status(400).json({ ok: false, error: "longitude inválida" });
    }

    const result = await resolveLocation(lat, lng);

    // 200 com data:null quando fora de cobertura. O frontend interpreta como
    // "sem cidade no raio aceitável" e cai para fallback estadual.
    return res.status(200).json({ ok: true, data: result });
  } catch (err) {
    logger.error(
      { err: err?.message || String(err) },
      "[location] resolveLocation falhou"
    );
    return next(err);
  }
}
