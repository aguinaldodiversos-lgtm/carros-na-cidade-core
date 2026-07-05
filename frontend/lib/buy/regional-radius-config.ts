// frontend/lib/buy/regional-radius-config.ts
//
// Espelho de `src/read-models/cities/regional-radius.config.js`. Raio padrão
// (km) da cobertura de vizinhança da página de cidade. Configurável por env
// RAIO_PADRAO_KM, default 40 (Haversine ≈ ~50 km estrada). Lido em server-side.

export const DEFAULT_RADIUS_KM = 40;
const MAX_RADIUS_KM = 150;

export function getRegionalRadiusKm(): number {
  const parsed = Number.parseInt(String(process.env.RAIO_PADRAO_KM ?? ""), 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_RADIUS_KM;
  return Math.min(parsed, MAX_RADIUS_KM);
}

/**
 * Opções do seletor "Distância (km)" do bloco "Próximos" (âncora regional).
 * 40 = RAIO_PADRAO_KM (padrão, URL limpa). São o único conjunto aceito — o
 * parser abaixo "encaixa" qualquer valor fora da lista de volta ao padrão, então
 * URLs adulteradas (`?raio=33`) não geram estados órfãos. NÃO inclui "estado":
 * ampliar para o estado é papel do seletor Estado (separado). Ver
 * FilterSidebar / carros-em/[slug].
 */
export const DISTANCE_OPTIONS_KM = [10, 25, 40, 100] as const;

/**
 * Interpreta o parâmetro de URL `?raio=` (ação do usuário, descartada pelo
 * canonical). Retorna sempre um valor da lista permitida; default 40. String,
 * string[] ou lixo → 40.
 */
export function parseRadiusParam(raw: string | string[] | undefined): number {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return (DISTANCE_OPTIONS_KM as readonly number[]).includes(parsed)
    ? parsed
    : DEFAULT_RADIUS_KM;
}
