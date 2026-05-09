import { pool, withTransaction } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";

/**
 * Serviço para `platform_settings` — configurações globais editáveis por admin.
 *
 * Por que cache em memória de 60 s?
 * - `getSetting` é chamado em hot path (cada GET /api/internal/regions/:slug
 *   ainda lê o radius). Sem cache = SELECT por request.
 * - 60 s é curto o suficiente para que admin veja mudança rápida no painel
 *   (próxima leitura recompila a região), mas longo o suficiente para
 *   absorver picos. Para invalidação imediata, `setSetting` limpa a entry.
 * - Cache LOCAL ao processo. Em ambiente multi-instance, cada instância
 *   atualiza sua própria entry em até 60 s; o `cacheInvalidatePrefix`
 *   no Redis (chamado por admin-regional-settings.service.js) cuida do
 *   cache da rota pública.
 *
 * Por que NÃO usa Redis aqui?
 * - Settings são em volume baixo (poucas keys, poucas leituras absolutas).
 *   Redis adiciona latência de rede e ponto de falha sem ganho real.
 * - Redis ESTÁ usado downstream (cache da rota /api/internal/regions/*),
 *   onde absorve milhares de requests; aqui é supérfluo.
 *
 * Fail-safe na leitura:
 * - Se o SELECT falhar (DB offline, schema não migrado, etc.), retorna
 *   `defaultValue` do caller em vez de propagar exception. Justificativa:
 *   uma falha aqui NUNCA pode derrubar a Página Regional pública. Logamos
 *   o erro e seguimos com o default.
 */

const CACHE_TTL_MS = 60_000;
const cache = new Map(); // key -> { value, expiresAt }

function getCached(key) {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() >= entry.expiresAt) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function setCached(key, value) {
  cache.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
}

function invalidateCache(key) {
  cache.delete(key);
}

/**
 * Lê o valor JSONB de uma key. Retorna `defaultValue` se a key não existir
 * ou se a leitura falhar (logado mas não propagado).
 *
 * @template T
 * @param {string} key — namespace.nome (ex.: "regional.radius_km")
 * @param {T} defaultValue — valor a retornar quando ausente/erro
 * @returns {Promise<T>}
 */
export async function getSetting(key, defaultValue) {
  const safeKey = String(key || "").trim();
  if (!safeKey) return defaultValue;

  const cached = getCached(safeKey);
  if (cached !== undefined) return cached;

  try {
    const result = await pool.query(
      `SELECT value FROM platform_settings WHERE key = $1 LIMIT 1`,
      [safeKey]
    );
    if (!result.rows[0]) {
      // Cacheia o default também — evita SELECT repetido para keys ausentes.
      setCached(safeKey, defaultValue);
      return defaultValue;
    }
    const value = result.rows[0].value;
    setCached(safeKey, value);
    return value;
  } catch (err) {
    logger.error(
      { err: err?.message, key: safeKey },
      "[platform.settings] falha ao ler setting — usando defaultValue"
    );
    return defaultValue;
  }
}

/**
 * Grava (insert ou update) o valor de uma key. Transacional. Invalida cache
 * local imediatamente após sucesso.
 *
 * Validação do shape de `value` é responsabilidade do caller — aqui só
 * garantimos atomicidade e auditabilidade básica.
 *
 * @param {{ key: string, value: unknown, updatedBy?: number|string|null, description?: string|null }} params
 * @returns {Promise<{ key: string, value: unknown, updated_at: string }>}
 */
export async function setSetting({ key, value, updatedBy = null, description = null }) {
  const safeKey = String(key || "").trim();
  if (!safeKey) {
    throw new Error("setSetting: key obrigatória");
  }
  if (value === undefined) {
    throw new Error("setSetting: value não pode ser undefined");
  }

  const result = await withTransaction(async (tx) => {
    const upsert = await tx.query(
      `
      INSERT INTO platform_settings (key, value, description, updated_by, updated_at)
      VALUES ($1, $2::jsonb, $3, $4, NOW())
      ON CONFLICT (key) DO UPDATE
        SET value = EXCLUDED.value,
            description = COALESCE(EXCLUDED.description, platform_settings.description),
            updated_by = EXCLUDED.updated_by,
            updated_at = NOW()
      RETURNING key, value, updated_at
      `,
      [safeKey, JSON.stringify(value), description, updatedBy == null ? null : String(updatedBy)]
    );
    return upsert.rows[0];
  });

  // Invalida APÓS commit. Se o commit falhar e jogar exception, o cache
  // ainda guarda o valor antigo — comportamento correto.
  invalidateCache(safeKey);

  return {
    key: result.key,
    value: result.value,
    updated_at: result.updated_at,
  };
}

/**
 * Invalida manualmente uma entrada do cache local. Útil em testes.
 */
export function invalidateSettingCache(key) {
  invalidateCache(String(key || "").trim());
}

/**
 * Limpa cache inteiro. Útil em testes.
 */
export function clearSettingsCache() {
  cache.clear();
}
