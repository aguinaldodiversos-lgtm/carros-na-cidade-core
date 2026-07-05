// src/read-models/cities/regional-radius.config.js
//
// Raio padrão (km) da cobertura de vizinhança da página de cidade (modelo
// "âncora regional" — Onda 2 Fase 2a). Configurável por env RAIO_PADRAO_KM,
// default 40 (Haversine/linha reta ≈ ~50 km de estrada). NUNCA cravar o raio no
// código — a cobertura se ajusta trocando a env, sem redeploy de lógica.
//
// Distância = Haversine persistido em `region_memberships.distance_km` (mesmo
// UF; ver scripts/build-region-memberships.mjs). É EXPERIÊNCIA, não indexação:
// nenhuma expansão por raio gera URL indexável (só cidade com estoque próprio
// >= SITEMAP_MIN_ADS é indexável).

const DEFAULT_RADIUS_KM = 40; // env RAIO_PADRAO_KM (Render=40); troca por env + deploy
const MAX_RADIUS_KM = 150; // teto de sanidade (admin regional 10..150)

export function getRegionalRadiusKm() {
  const parsed = Number.parseInt(String(process.env.RAIO_PADRAO_KM ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RADIUS_KM;
  return Math.min(parsed, MAX_RADIUS_KM);
}
