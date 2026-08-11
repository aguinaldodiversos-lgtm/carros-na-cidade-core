// Regras do domínio de notificações internas.
//
// Duas superfícies bem separadas:
//
//   1. CRIAÇÃO — `createUserNotification`. Chamada por CÓDIGO INTERNO
//      (futuros Produtos A e B). NÃO existe rota que permita ao navegador
//      criar notificação: quem cria decide para quem, e isso nunca pode vir
//      do cliente.
//
//   2. CONSUMO — listar, contar, marcar como lida. Chamado pelas rotas
//      autenticadas, SEMPRE com o `userId` vindo de `req.user.id`.
//
// O domínio não sabe o que é anúncio, oferta, lance ou visita. Recebe texto
// pronto e um caminho de destino. A dependência é `Produtos → Notificações`.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import * as repo from "./notifications.repository.js";
import { NOTIFICATION_PAGE } from "./notifications.constants.js";
import {
  decodeCursor,
  encodeCursor,
  parseLimit,
  parseNotificationId,
  validateActionPath,
  validateBody,
  validateEntityId,
  validateEntityType,
  validateEventType,
  validateIdempotencyKey,
  validatePayload,
  validateTitle,
} from "./notifications.validation.js";

/**
 * Normaliza o id do destinatário. Aceita number|string — o driver `pg` devolve
 * BIGINT como string, então o id que circula na aplicação alterna entre os dois
 * tipos e comparar sem normalizar é fonte garantida de bug.
 *
 * `0` é recusado explicitamente: `users.id` é serial e começa em 1, então zero
 * nunca é um destinatário real. Sem esta guarda ele passaria pelo teste de
 * dígitos e só morreria lá embaixo, como violação de FK — um 500 no lugar de um
 * 400, e um erro de banco no log em vez da causa verdadeira.
 */
function requireRecipientUserId(raw) {
  const value = String(raw ?? "").trim();
  if (!/^\d+$/.test(value) || Number(value) <= 0) {
    throw new AppError("Destinatário inválido para notificação.", 400, true, {
      code: "NOTIFICATION_INVALID_RECIPIENT",
    });
  }
  return value;
}

/**
 * Cria uma notificação interna de forma IDEMPOTENTE.
 *
 * Reprocessar o mesmo evento lógico não duplica: a garantia é o índice único
 * `(recipient_user_id, idempotency_key)` no banco, não uma checagem prévia em
 * JS (que teria janela de corrida entre o SELECT e o INSERT).
 *
 * Colisão idempotente NÃO é erro — devolve `created: false` com a notificação
 * vigente. Um 500 aqui faria um retry legítimo do produtor derrubar o fluxo
 * que gerou o evento.
 *
 * @param {{
 *   recipientUserId: string|number,
 *   eventType: string,
 *   title: string,
 *   body: string,
 *   entityType?: string|null,
 *   entityId?: string|number|null,
 *   actionPath?: string|null,
 *   payload?: object|null,
 *   idempotencyKey: string,
 * }} input
 * @returns {Promise<{ notification: object|null, created: boolean }>}
 */
export async function createUserNotification(input) {
  const recipientUserId = requireRecipientUserId(input?.recipientUserId);
  const eventType = validateEventType(input?.eventType);
  const title = validateTitle(input?.title);
  const body = validateBody(input?.body);
  const entityType = validateEntityType(input?.entityType);
  const entityId = validateEntityId(input?.entityId);
  const actionPath = validateActionPath(input?.actionPath);
  const payload = validatePayload(input?.payload);
  const idempotencyKey = validateIdempotencyKey(input?.idempotencyKey);

  try {
    const result = await repo.insertNotification({
      recipientUserId,
      eventType,
      title,
      body,
      entityType,
      entityId,
      actionPath,
      payload,
      idempotencyKey,
    });

    logger.info(
      {
        ...buildDomainFields({
          action: "notification.create",
          result: "success",
          userId: recipientUserId,
        }),
        eventType,
        entityType,
        created: result.created,
      },
      result.created
        ? "[notifications] notificação criada"
        : "[notifications] já existia (idempotente)"
    );

    return result;
  } catch (error) {
    // Log útil SEM PII: tipo do evento, destinatário e entidade. Nunca title,
    // body ou payload — é justamente onde dado de pessoa pode acabar caindo.
    logger.error(
      {
        ...buildDomainFields({
          action: "notification.create",
          result: "error",
          userId: recipientUserId,
        }),
        eventType,
        entityType,
        err: error?.message || String(error),
      },
      "[notifications] falha ao criar notificação"
    );
    throw error;
  }
}

/**
 * Página de notificações do PRÓPRIO usuário.
 *
 * `userId` vem sempre da sessão. `limit` e `cursor` vêm da query e são
 * saneados: limit é clampado a [1, MAX] e cursor malformado é ignorado.
 */
export async function listMyNotifications(userId, { limit: rawLimit, cursor: rawCursor } = {}) {
  const recipientUserId = requireRecipientUserId(userId);
  const limit = parseLimit(rawLimit);
  const cursor = decodeCursor(rawCursor);

  const { rows, hasMore } = await repo.listByRecipient({ recipientUserId, limit, cursor });

  return {
    notifications: rows,
    // Só emite cursor quando há mesmo próxima página — assim o cliente para de
    // pedir sozinho, sem precisar comparar tamanhos.
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1]) : null,
    limit,
  };
}

/** Contador de não lidas do próprio usuário. */
export async function countMyUnread(userId) {
  const recipientUserId = requireRecipientUserId(userId);
  return repo.countUnreadByRecipient(recipientUserId);
}

/**
 * Marca UMA notificação do próprio usuário como lida.
 *
 * 404 (não 403) quando não é dele: responder "pertence a outro usuário"
 * confirmaria a existência da linha para quem está sondando ids. Mesmo
 * critério do módulo de suporte.
 *
 * Idempotente: já lida devolve o objeto normalmente, sem erro e sem reescrever
 * o `read_at` original.
 */
export async function markMyNotificationAsRead(userId, rawId) {
  const recipientUserId = requireRecipientUserId(userId);
  const notificationId = parseNotificationId(rawId);

  const notification = await repo.markAsReadForRecipient(notificationId, recipientUserId);
  if (!notification) {
    throw new AppError("Notificação não encontrada.", 404);
  }

  return notification;
}

/** Marca todas as não lidas do próprio usuário. Retorna quantas mudaram. */
export async function markAllMyNotificationsAsRead(userId) {
  const recipientUserId = requireRecipientUserId(userId);
  const updated = await repo.markAllAsReadForRecipient(recipientUserId);
  return { updated };
}

export { NOTIFICATION_PAGE };
