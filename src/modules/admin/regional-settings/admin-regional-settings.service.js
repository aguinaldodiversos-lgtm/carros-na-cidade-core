import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { getSetting, setSetting } from "../../platform/settings.service.js";
import { recordAdminAction } from "../admin.audit.js";
import { cacheInvalidatePrefix } from "../../../shared/cache/cache.middleware.js";
import { logger } from "../../../shared/logger.js";

/**
 * Configurações da Página Regional editáveis pelo admin.
 *
 * Hoje cobre apenas `radius_km` (raio em km usado para montar a região
 * a partir da cidade base). Default 80, range válido 10..150.
 *
 * Por que defaultar para 80 e não 60 (limite atual de region_memberships)?
 * - O produto pediu 80 explicitamente. region_memberships continua
 *   existindo como fallback offline (workers/dashboards), mas a Página
 *   Regional pública passa a usar haversine dinâmico em SQL contra
 *   cities.latitude/longitude, lendo o radius daqui.
 *
 * Por que limites 10..150?
 * - Mínimo 10: abaixo disso a região vira "uma cidade só" — é melhor o
 *   visitante usar a Página da Cidade direto.
 * - Máximo 150: acima disso começa a cruzar fronteiras de UF e diluir a
 *   intenção comercial. 150 já cobre regiões metropolitanas grandes
 *   (RMSP ≈ 80, RMC ≈ 50, Vale do Paraíba ≈ 120).
 */

export const REGIONAL_RADIUS_KEY = "regional.radius_km";
export const REGIONAL_RADIUS_DEFAULT = 80;
export const REGIONAL_RADIUS_MIN = 10;
export const REGIONAL_RADIUS_MAX = 150;

/**
 * Normaliza o valor lido do platform_settings para inteiro.
 * Aceita number puro (`80`), JSONB number (`80`) ou objeto legado
 * `{ "value": 80 }`. Se não conseguir extrair um inteiro válido, cai
 * no default.
 */
export function normalizeRadiusValue(raw) {
  let candidate = raw;
  if (raw && typeof raw === "object" && !Array.isArray(raw) && "value" in raw) {
    candidate = raw.value;
  }
  const n = Number(candidate);
  if (!Number.isFinite(n) || !Number.isInteger(n)) return REGIONAL_RADIUS_DEFAULT;
  if (n < REGIONAL_RADIUS_MIN || n > REGIONAL_RADIUS_MAX) {
    // Valor fora do range é tratado como inválido — usa default. NÃO
    // propaga exception para não derrubar página pública por causa
    // de valor corrompido.
    logger.warn(
      { value: n, min: REGIONAL_RADIUS_MIN, max: REGIONAL_RADIUS_MAX },
      "[admin.regional-settings] valor de radius fora do range — caindo no default"
    );
    return REGIONAL_RADIUS_DEFAULT;
  }
  return n;
}

/**
 * Lê o raio regional atual. Sempre retorna inteiro válido. Em caso de
 * falha de leitura, retorna o default (80).
 */
export async function getRegionalRadiusKm() {
  const raw = await getSetting(REGIONAL_RADIUS_KEY, REGIONAL_RADIUS_DEFAULT);
  return normalizeRadiusValue(raw);
}

/**
 * Snapshot completo das settings regionais. Estrutura preparada para
 * acomodar futuras configs (max_city_slugs, fallback_layer_max, etc.)
 * sem quebrar a API.
 */
export async function getRegionalSettings() {
  const radius_km = await getRegionalRadiusKm();
  return {
    radius_km,
    radius_min_km: REGIONAL_RADIUS_MIN,
    radius_max_km: REGIONAL_RADIUS_MAX,
    radius_default_km: REGIONAL_RADIUS_DEFAULT,
  };
}

/**
 * Valida o payload do PATCH e grava o novo radius. Lança AppError(400)
 * com mensagem específica em cada caso de erro. NÃO grava se inválido.
 *
 * Side-effects pós-gravação (best-effort, não bloqueiam resposta):
 *  1. Audit em admin_actions (recordAdminAction).
 *  2. Invalida cache Redis "internal:regions:*" para que próximas
 *     leituras da Página Regional usem o novo raio imediatamente.
 */
export async function updateRegionalSettings({ adminUserId, payload }) {
  if (!payload || typeof payload !== "object") {
    throw new AppError("Body inválido", 400);
  }

  if (!("radius_km" in payload)) {
    throw new AppError("Campo radius_km é obrigatório", 400);
  }

  const raw = payload.radius_km;
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new AppError("radius_km deve ser numérico", 400);
  }
  if (!Number.isInteger(n)) {
    throw new AppError("radius_km deve ser inteiro", 400);
  }
  if (n < REGIONAL_RADIUS_MIN) {
    throw new AppError(
      `radius_km mínimo é ${REGIONAL_RADIUS_MIN} km`,
      400
    );
  }
  if (n > REGIONAL_RADIUS_MAX) {
    throw new AppError(
      `radius_km máximo é ${REGIONAL_RADIUS_MAX} km`,
      400
    );
  }

  const oldValue = await getRegionalRadiusKm();

  const written = await setSetting({
    key: REGIONAL_RADIUS_KEY,
    value: n,
    updatedBy: adminUserId,
    description:
      "Raio em km usado para montar a Página Regional a partir da cidade base.",
  });

  // Side-effects best-effort. Falha em audit/invalidação NUNCA pode
  // reverter a mudança já comitada.
  recordAdminAction({
    adminUserId,
    action: "update_regional_radius",
    targetType: "platform_settings",
    targetId: REGIONAL_RADIUS_KEY,
    oldValue: { radius_km: oldValue },
    newValue: { radius_km: n },
    reason: payload.reason || null,
  }).catch(() => {});

  cacheInvalidatePrefix("internal:regions").catch((err) => {
    logger.warn(
      { err: err?.message },
      "[admin.regional-settings] falha ao invalidar cache internal:regions"
    );
  });

  return {
    radius_km: n,
    radius_min_km: REGIONAL_RADIUS_MIN,
    radius_max_km: REGIONAL_RADIUS_MAX,
    radius_default_km: REGIONAL_RADIUS_DEFAULT,
    updated_at: written.updated_at,
  };
}
