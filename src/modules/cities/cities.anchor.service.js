import { pool } from "../../infrastructure/database/db.js";
import { logger } from "../../shared/logger.js";
import { getSetting } from "../platform/settings.service.js";

const MIN_ANUNCIOS_DEFAULT = 1;
const DIAS_INATIVIDADE_DEFAULT = 90;

/**
 * Ativa is_ancora para uma cidade se ela tiver pelo menos
 * `regional.min_anuncios_ancora` anúncios ativos aprovados.
 *
 * Chamado após cada INSERT de anúncio com status ACTIVE. Falhas são
 * logadas mas NÃO propagadas — nunca podem reverter a criação do anúncio.
 */
export async function markCityAsAncoraIfEligible(cityId) {
  if (!cityId) return;

  let minAnuncios = MIN_ANUNCIOS_DEFAULT;
  try {
    const raw = await getSetting("regional.min_anuncios_ancora", MIN_ANUNCIOS_DEFAULT);
    minAnuncios = Number.isFinite(Number(raw)) ? Number(raw) : MIN_ANUNCIOS_DEFAULT;
  } catch (_) {
    // usa default
  }

  try {
    const { rows } = await pool.query(
      `SELECT COUNT(*) AS cnt
       FROM ads
       WHERE city_id = $1 AND status = 'ACTIVE'`,
      [cityId]
    );
    const activeCount = Number(rows[0]?.cnt ?? 0);
    if (activeCount < minAnuncios) return;

    await pool.query(
      `UPDATE cities
       SET is_ancora = true,
           ancora_ativada_em = NOW(),
           updated_at = NOW()
       WHERE id = $1 AND is_ancora = false`,
      [cityId]
    );

    logger.info({ cityId, activeCount }, "[ancora] cidade marcada como âncora");
  } catch (err) {
    logger.error(
      { err: err?.message, cityId },
      "[ancora] falha ao marcar cidade como âncora — anúncio criado normalmente"
    );
  }
}

/**
 * Job diário: desativa âncoras que ficaram mais de
 * `regional.dias_inatividade_ancora` dias sem nenhum anúncio ativo.
 *
 * Retorna { deactivated: number } com a quantidade de cidades desativadas.
 */
export async function deactivateStaleAncoras() {
  let dias = DIAS_INATIVIDADE_DEFAULT;
  try {
    const raw = await getSetting("regional.dias_inatividade_ancora", DIAS_INATIVIDADE_DEFAULT);
    dias = Number.isFinite(Number(raw)) ? Number(raw) : DIAS_INATIVIDADE_DEFAULT;
  } catch (_) {
    // usa default
  }

  const result = await pool.query(
    `UPDATE cities
     SET is_ancora = false,
         ancora_desativada_em = NOW(),
         updated_at = NOW()
     WHERE is_ancora = true
       AND id NOT IN (
         SELECT DISTINCT city_id
         FROM ads
         WHERE status = 'ACTIVE'
           AND created_at >= NOW() - ($1 || ' days')::interval
       )`,
    [dias]
  );

  const deactivated = result.rowCount ?? 0;
  if (deactivated > 0) {
    logger.info({ deactivated, dias }, "[ancora] âncoras inativas desativadas");
  }
  return { deactivated };
}
