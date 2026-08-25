/**
 * Bloqueio e reativação administrativa de anúncio (Fase 4.10A).
 *
 * PRINCÍPIO
 *   Bloquear NÃO exclui: a linha, as fotos, o vínculo com o anunciante e todo
 *   o histórico continuam intactos. O que muda é `ads.status`, e é isso que
 *   remove o anúncio de TODAS as superfícies públicas de uma vez — a camada
 *   pública inteira filtra `status = 'active'` (AD_STATUS_PUBLIC), então não
 *   existe superfície que precise "lembrar" de checar bloqueio.
 *
 * POR QUE NÃO UMA FLAG PARALELA
 *   Um `is_blocked` obrigaria ~100 queries públicas a lembrar de
 *   `status='active' AND is_blocked=false`. A primeira que esquecesse vazaria
 *   o anúncio. Reutilizar o status mantém UM ponto de verdade e torna o
 *   vazamento impossível por construção, não por disciplina.
 *
 * POR QUE GUARDAR O ESTADO ANTERIOR
 *   Reativar não é "forçar active". Um anúncio pausado pelo dono, ou retido em
 *   `pending_review` pela fila antifraude, tem de VOLTAR para onde estava —
 *   senão o desbloqueio publicaria um anúncio que nenhuma outra regra havia
 *   liberado. `blocked_previous_status` transforma a reativação em restauração.
 */

import { AppError } from "../../../shared/middlewares/error.middleware.js";
import { query, withTransaction } from "../../../infrastructure/database/db.js";
import { AD_STATUS } from "../../../shared/constants/status.js";
import {
  AD_BLOCK_NOTE_MAX_LENGTH,
  AD_BLOCK_NOTE_MIN_LENGTH,
  isValidAdBlockReasonCode,
  requiresNote,
} from "../../../shared/moderation/ad-block-reasons.js";
import { invalidateAdsCachesAfterMutation } from "../../ads/ads.mutation-cache.js";
import { revalidatePublicAdsOnNext } from "../../../shared/cache/next-revalidate.js";
import { recordAdminAction } from "../admin.audit.js";
import { MODERATION_EVENT } from "../../ads/risk/ad-risk.thresholds.js";

/**
 * Limpa as DUAS camadas de cache, nesta ordem e só depois do COMMIT.
 *
 * Chamar antes do commit faria o Next revalidar contra o estado anterior e
 * reaquecer o cache com o dado velho — o oposto do efeito desejado.
 *
 * Redis primeiro: o Next vai reler do backend, e reler de um Redis ainda
 * quente traria de volta exatamente a resposta que estamos tentando derrubar.
 *
 * Nenhuma das duas etapas pode desfazer o bloqueio: ambas são falha-soft, e a
 * fonte de verdade continua sendo o banco.
 */
async function invalidatePublicCaches() {
  await invalidateAdsCachesAfterMutation().catch(() => {});
  return revalidatePublicAdsOnNext();
}

/**
 * Estados a partir dos quais o bloqueio administrativo NÃO faz sentido.
 *
 * `deleted` é terminal (soft-delete do dono) — bloquear um anúncio já removido
 * só embaralharia o estado anterior a restaurar. Allowlist ao contrário: em vez
 * de listar o que pode, listamos o único que não pode, porque bloquear precisa
 * funcionar em QUALQUER estado vivo (inclusive `paused` e `pending_review`, que
 * são justamente os casos em que forçar `active` na volta seria um bug).
 */
const BLOCK_FORBIDDEN_FROM = Object.freeze([AD_STATUS.DELETED]);

/**
 * Fallback de restauração quando `blocked_previous_status` é nulo — só ocorre
 * em linha bloqueada antes da migration 062 que tenha escapado do backfill.
 * `active` reproduz exatamente o comportamento do caminho antigo
 * ("Desbloquear" só oferecia active), então não inventa estado novo.
 */
const RESTORE_FALLBACK_STATUS = AD_STATUS.ACTIVE;

/**
 * Nunca restaure para um estado que a própria reativação não deveria poder
 * criar. `deleted` e `blocked` como estado anterior seriam dado corrompido;
 * cair no fallback é mais seguro que propagar a corrupção.
 */
const RESTORE_REJECTED_TARGETS = Object.freeze([AD_STATUS.DELETED, AD_STATUS.BLOCKED]);

function normalizeNote(note, { required, reasonCode }) {
  const missing = () => {
    throw new AppError(`O motivo "${reasonCode}" exige uma descrição administrativa.`, 400);
  };

  if (note == null || note === "") {
    if (required) missing();
    return null;
  }
  if (typeof note !== "string") {
    throw new AppError("Observação administrativa inválida.", 400);
  }
  const trimmed = note.trim();
  if (!trimmed) {
    if (required) missing();
    return null;
  }
  if (required && trimmed.length < AD_BLOCK_NOTE_MIN_LENGTH) {
    throw new AppError(
      `Descrição administrativa muito curta (mínimo ${AD_BLOCK_NOTE_MIN_LENGTH} caracteres).`,
      400
    );
  }
  return trimmed.slice(0, AD_BLOCK_NOTE_MAX_LENGTH);
}

/**
 * Lê o anúncio travando a linha até o fim da transação.
 *
 * `FOR UPDATE` é o que resolve as corridas de uma só vez: dois bloqueios
 * simultâneos, bloqueio contra reativação e reativação contra reativação passam
 * a ser serializados pelo banco. O segundo a chegar lê o estado JÁ gravado pelo
 * primeiro e cai no ramo de idempotência, em vez de sobrescrever com uma
 * decisão tomada sobre um estado obsoleto.
 */
async function lockAd(tx, adId) {
  const { rows } = await tx.query(
    `SELECT id, status, blocked_reason_code, blocked_reason, blocked_at,
            blocked_previous_status, blocked_by_user_id
       FROM ads
      WHERE id = $1
      FOR UPDATE`,
    [adId]
  );
  return rows[0] || null;
}

/**
 * Grava o evento de moderação DENTRO da transação.
 *
 * Diferente de `recordAdminAction` (best-effort e que nunca lança, por design),
 * a trilha append-only de moderação acompanha a mutação: se o INSERT falhar, o
 * bloqueio inteiro faz rollback. Um anúncio bloqueado sem registro de quem
 * bloqueou e por quê é pior do que um bloqueio que não aconteceu.
 */
async function recordModerationEventTx(tx, evt) {
  await tx.query(
    `INSERT INTO ad_moderation_events
       (ad_id, event_type, actor_user_id, actor_role, from_status, to_status, reason, metadata)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)`,
    [
      evt.adId,
      String(evt.eventType),
      evt.actorUserId != null ? String(evt.actorUserId) : null,
      evt.actorRole ?? "admin",
      evt.fromStatus ?? null,
      evt.toStatus ?? null,
      evt.reason ?? null,
      JSON.stringify(evt.metadata ?? {}),
    ]
  );
}

/**
 * Bloqueia um anúncio.
 *
 * Idempotente: bloquear um anúncio JÁ bloqueado devolve `changed: false` sem
 * gravar segundo evento, sem recarimbar `blocked_at` e sem sobrescrever o
 * motivo original — um retry de rede não pode reescrever a história nem apagar
 * o estado anterior guardado no primeiro bloqueio.
 *
 * @returns {Promise<{ changed: boolean, ad: object }>}
 */
export async function blockAd(adminUserId, adId, { reasonCode, note = null } = {}) {
  if (!isValidAdBlockReasonCode(reasonCode)) {
    throw new AppError("Motivo de bloqueio inválido.", 400);
  }
  const normalizedNote = normalizeNote(note, {
    required: requiresNote(reasonCode),
    reasonCode,
  });

  const outcome = await withTransaction(async (tx) => {
    const ad = await lockAd(tx, adId);
    if (!ad) throw new AppError("Anúncio não encontrado", 404);

    if (ad.status === AD_STATUS.BLOCKED) {
      return { changed: false, ad };
    }

    if (BLOCK_FORBIDDEN_FROM.includes(ad.status)) {
      throw new AppError(
        `Anúncio em status '${ad.status}' não admite bloqueio administrativo.`,
        400
      );
    }

    const previousStatus = ad.status;

    const { rows } = await tx.query(
      `UPDATE ads
          SET status                  = $2,
              blocked_reason_code     = $3,
              blocked_reason          = $4,
              blocked_previous_status = $5,
              blocked_by_user_id      = $6,
              blocked_at              = NOW(),
              updated_at              = NOW()
        WHERE id = $1
        RETURNING *`,
      [adId, AD_STATUS.BLOCKED, reasonCode, normalizedNote, previousStatus, String(adminUserId)]
    );

    await recordModerationEventTx(tx, {
      adId,
      eventType: MODERATION_EVENT.ADMIN_BLOCKED,
      actorUserId: adminUserId,
      actorRole: "admin",
      fromStatus: previousStatus,
      toStatus: AD_STATUS.BLOCKED,
      reason: reasonCode,
      metadata: { reason_code: reasonCode, note: normalizedNote },
    });

    return { changed: true, ad: rows[0], previousStatus };
  });

  if (!outcome.changed) {
    return { changed: false, ad: outcome.ad };
  }

  await recordAdminAction({
    adminUserId,
    action: "block_ad",
    targetType: "ad",
    targetId: adId,
    oldValue: { status: outcome.previousStatus },
    newValue: {
      status: AD_STATUS.BLOCKED,
      reason_code: reasonCode,
      previous_status: outcome.previousStatus,
    },
    reason: reasonCode,
  });

  // Sem isto o anúncio bloqueado continua servido de cache (busca, facetas,
  // cidade, home) até o TTL expirar. A moderação já invalidava; o bloqueio não.
  const revalidated = await invalidatePublicCaches();

  return { changed: true, ad: outcome.ad, revalidated };
}

/**
 * Reativa (desbloqueia) um anúncio.
 *
 * NÃO força `active`: restaura `blocked_previous_status`. Se o anúncio estava
 * `paused` quando foi bloqueado, ele volta `paused` — o desbloqueio remove a
 * sanção administrativa e nada mais. Os demais portões de publicação continuam
 * valendo exatamente como valiam antes do bloqueio.
 *
 * Idempotente: reativar um anúncio não-bloqueado devolve `changed: false`.
 */
export async function unblockAd(adminUserId, adId, { note = null } = {}) {
  const normalizedNote = normalizeNote(note, { required: false, reasonCode: null });

  const outcome = await withTransaction(async (tx) => {
    const ad = await lockAd(tx, adId);
    if (!ad) throw new AppError("Anúncio não encontrado", 404);

    if (ad.status !== AD_STATUS.BLOCKED) {
      return { changed: false, ad };
    }

    const stored = ad.blocked_previous_status;
    const restoredStatus =
      stored && !RESTORE_REJECTED_TARGETS.includes(stored) ? stored : RESTORE_FALLBACK_STATUS;

    const { rows } = await tx.query(
      `UPDATE ads
          SET status                  = $2,
              blocked_reason_code     = NULL,
              blocked_reason          = NULL,
              blocked_previous_status = NULL,
              blocked_by_user_id      = NULL,
              blocked_at              = NULL,
              updated_at              = NOW()
        WHERE id = $1
        RETURNING *`,
      [adId, restoredStatus]
    );

    await recordModerationEventTx(tx, {
      adId,
      eventType: MODERATION_EVENT.ADMIN_UNBLOCKED,
      actorUserId: adminUserId,
      actorRole: "admin",
      fromStatus: AD_STATUS.BLOCKED,
      toStatus: restoredStatus,
      reason: normalizedNote,
      metadata: {
        restored_status: restoredStatus,
        previous_reason_code: ad.blocked_reason_code ?? null,
        note: normalizedNote,
      },
    });

    return {
      changed: true,
      ad: rows[0],
      restoredStatus,
      previousReasonCode: ad.blocked_reason_code,
    };
  });

  if (!outcome.changed) {
    return { changed: false, ad: outcome.ad };
  }

  await recordAdminAction({
    adminUserId,
    action: "unblock_ad",
    targetType: "ad",
    targetId: adId,
    oldValue: {
      status: AD_STATUS.BLOCKED,
      reason_code: outcome.previousReasonCode ?? null,
    },
    newValue: { status: outcome.restoredStatus },
    reason: normalizedNote,
  });

  // Vale nos dois sentidos. Revalidar não significa "tornar público": significa
  // "releia a fonte de verdade". Se o estado restaurado for `paused` ou
  // `pending_review`, a releitura confirma que o anúncio continua fora do ar.
  const revalidated = await invalidatePublicCaches();

  return { changed: true, ad: outcome.ad, revalidated };
}

/**
 * Histórico de moderação do anúncio para a tela administrativa.
 *
 * Devolve APENAS os eventos de bloqueio/reativação, em ordem cronológica
 * decrescente. Append-only: a tabela nunca é atualizada nem apagada por este
 * fluxo, então bloqueio e reativação aparecem como duas linhas distintas.
 *
 * NÃO expõe `actor_user_id` — ver o DTO montado no controller.
 */
export async function listModerationHistory(adId, { limit = 50 } = {}) {
  const { rows } = await query(
    `SELECT id, event_type, from_status, to_status, reason, metadata, created_at
       FROM ad_moderation_events
      WHERE ad_id = $1
        AND event_type IN ($2, $3)
      ORDER BY created_at DESC, id DESC
      LIMIT $4`,
    [adId, MODERATION_EVENT.ADMIN_BLOCKED, MODERATION_EVENT.ADMIN_UNBLOCKED, limit]
  );
  return rows;
}
