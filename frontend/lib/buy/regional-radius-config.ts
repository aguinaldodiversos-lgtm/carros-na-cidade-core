// frontend/lib/buy/regional-radius-config.ts
//
// Espelho de `src/read-models/cities/regional-radius.config.js`. Raio padrão
// (km) da cobertura de vizinhança da página de cidade. Configurável por env
// RAIO_PADRAO_KM, default 40 (Haversine ≈ ~50 km estrada). Lido em server-side.

const DEFAULT_RADIUS_KM = 40;
const MAX_RADIUS_KM = 150;

export function getRegionalRadiusKm(): number {
  const parsed = Number.parseInt(String(process.env.RAIO_PADRAO_KM ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RADIUS_KM;
  return Math.min(parsed, MAX_RADIUS_KM);
}
