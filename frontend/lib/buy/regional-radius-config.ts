// frontend/lib/buy/regional-radius-config.ts
//
// Espelho de `src/read-models/cities/regional-radius.config.js`. Raio padrão
// (km) da cobertura de vizinhança da página de cidade. Configurável por env
// RAIO_PADRAO_KM, default 50 (Haversine ≈ ~60 km estrada). Lido em server-side.
//
// ATENÇÃO — a distância é comparação CONTÍNUA (`region_memberships.distance_km
// <= km`), não bucket: qualquer km funciona. Os valores abaixo são só a escala
// de UI. O precompute (`scripts/build-region-memberships.mjs`) popula LAYER 3
// (60–100 km, cap REGIONAL_LAYER3_MAX_MEMBERS) além dos layers 1/2 (≤60 km),
// então os stops 75 e 100 correspondem a raios reais e DISTINTOS. Requer que o
// `regions:build` tenha rodado com o layer 3 (ver runbook). A Página Regional
// (System B) filtra `layer <= 2` e permanece em ≤60 km.

export const DEFAULT_RADIUS_KM = 50;
const MAX_RADIUS_KM = 150;

export function getRegionalRadiusKm(): number {
  const parsed = Number.parseInt(String(process.env.RAIO_PADRAO_KM ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RADIUS_KM;
  return Math.min(parsed, MAX_RADIUS_KM);
}

/**
 * Opções do seletor "Distância (km)" do bloco "Próximos" (âncora regional).
 * 50 = RAIO_PADRAO_KM (padrão, URL limpa). São o único conjunto aceito — o
 * parser abaixo "encaixa" qualquer valor fora da lista de volta ao padrão, então
 * URLs adulteradas (`?raio=33`) não geram estados órfãos. NÃO inclui "estado":
 * ampliar para o estado é papel do seletor Estado (separado). Ver
 * FilterSidebar / carros-em/[slug].
 */
export const DISTANCE_OPTIONS_KM = [25, 50, 75, 100] as const;

/**
 * Interpreta o parâmetro de URL `?raio=` (ação do usuário, descartada pelo
 * canonical). Retorna sempre um valor da lista permitida; default 50. String,
 * string[] ou lixo → 50.
 */
export function parseRadiusParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return (DISTANCE_OPTIONS_KM as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_RADIUS_KM;
}
