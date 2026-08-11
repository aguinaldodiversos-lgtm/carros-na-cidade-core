// Acesso a dados da caixa postal interna. TODAS as queries são parametrizadas
// ($1,$2,...) — zero concatenação de input.
//
// REGRA DE OURO deste arquivo: nenhuma função aceita "o id da notificação"
// sozinho. Toda leitura e toda escrita carregam `recipientUserId` na cláusula
// WHERE, para que a posse seja garantida pelo BANCO e não por um `if` no
// service. Um `SELECT` seguido de checagem em JS teria dois problemas: uma
// janela entre ler e escrever, e a chance de alguém adicionar um caminho novo
// que esqueça o `if`.

import { query } from "../../infrastructure/database/db.js";

const NOTIFICATION_COLUMNS = `
  id, recipient_user_id, event_type, title, body,
  entity_type, entity_id, action_path, payload,
  read_at, created_at
`;

/**
 * Insere uma notificação de forma idempotente.
 *
 * `ON CONFLICT DO NOTHING` sobre o índice único (recipient_user_id,
 * idempotency_key): quando a linha já existe, o INSERT não retorna nada e nós
 * buscamos a existente. Duas requisições simultâneas com a mesma chave chegam
 * ao mesmo resultado — o banco arbitra, não a aplicação.
 *
 * @returns {Promise<{ notification: object, created: boolean }>}
 */
export async function insertNotification(input) {
  const params = [
    input.recipientUserId,
    input.eventType,
    input.title,
    input.body,
    input.entityType,
    input.entityId,
    input.actionPath,
    JSON.stringify(input.payload ?? {}),
    input.idempotencyKey,
  ];

  const inserted = await query(
    `
    INSERT INTO user_notifications (
      recipient_user_id, event_type, title, body,
      entity_type, entity_id, action_path, payload, idempotency_key
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
    ON CONFLICT (recipient_user_id, idempotency_key) DO NOTHING
    RETURNING ${NOTIFICATION_COLUMNS}
    `,
    params
  );

  if (inserted.rows[0]) {
    return { notification: inserted.rows[0], created: true };
  }

  // Conflito: a notificação já existia. Devolvemos a linha vigente para que o
  // chamador tenha sempre um objeto, independente de ter criado ou não.
  const existing = await query(
    `
    SELECT ${NOTIFICATION_COLUMNS}
    FROM user_notifications
    WHERE recipient_user_id = $1 AND idempotency_key = $2
    LIMIT 1
    `,
    [input.recipientUserId, input.idempotencyKey]
  );

  return { notification: existing.rows[0] ?? null, created: false };
}

/**
 * Página de notificações de UM usuário, mais recentes primeiro.
 *
 * Busca `limit + 1` linhas para descobrir se há próxima página sem precisar de
 * um COUNT — o COUNT custaria uma varredura a cada abertura do sino.
 *
 * O cursor usa comparação de TUPLA `(created_at, id) < ($cursor, $id)`. Um
 * `created_at <` puro perderia linhas com timestamp idêntico (nada impede duas
 * notificações no mesmo instante — é justamente o caso de um fan-out), e um
 * `<=` as repetiria. A tupla ordena total e não tem empate.
 */
export async function listByRecipient({ recipientUserId, limit, cursor }) {
  const params = [recipientUserId];
  let cursorClause = "";

  if (cursor) {
    params.push(cursor.createdAt, cursor.id);
    cursorClause = `AND (created_at, id) < ($${params.length - 1}::timestamptz, $${params.length})`;
  }

  params.push(limit + 1);

  const result = await query(
    `
    SELECT ${NOTIFICATION_COLUMNS}
    FROM user_notifications
    WHERE recipient_user_id = $1
    ${cursorClause}
    ORDER BY created_at DESC, id DESC
    LIMIT $${params.length}
    `,
    params
  );

  const rows = result.rows.slice(0, limit);
  return { rows, hasMore: result.rows.length > limit };
}

/** Quantas não lidas o usuário tem. Serve o índice parcial (read_at IS NULL). */
export async function countUnreadByRecipient(recipientUserId) {
  const result = await query(
    `
    SELECT COUNT(*)::int AS count
    FROM user_notifications
    WHERE recipient_user_id = $1
      AND read_at IS NULL
    `,
    [recipientUserId]
  );
  return result.rows[0]?.count ?? 0;
}

/**
 * Marca UMA notificação como lida, escopada ao dono.
 *
 * O `WHERE ... AND recipient_user_id` faz a autorização acontecer dentro do
 * próprio UPDATE: notificação de outro usuário simplesmente não casa, e a
 * função devolve null — que o service traduz em 404. Não existe caminho em que
 * uma linha alheia seja lida e depois recusada.
 *
 * `read_at = COALESCE(read_at, NOW())` mantém a operação idempotente e
 * PRESERVA o instante da primeira leitura: reenviar o PATCH não reescreve o
 * timestamp nem falha.
 */
export async function markAsReadForRecipient(notificationId, recipientUserId) {
  const result = await query(
    `
    UPDATE user_notifications
    SET read_at = COALESCE(read_at, NOW())
    WHERE id = $1
      AND recipient_user_id = $2
    RETURNING ${NOTIFICATION_COLUMNS}
    `,
    [notificationId, recipientUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * Marca todas as não lidas do usuário. O filtro `read_at IS NULL` evita
 * reescrever linhas já lidas (e faz `updated` refletir o que de fato mudou).
 */
export async function markAllAsReadForRecipient(recipientUserId) {
  const result = await query(
    `
    UPDATE user_notifications
    SET read_at = NOW()
    WHERE recipient_user_id = $1
      AND read_at IS NULL
    `,
    [recipientUserId]
  );
  return result.rowCount ?? 0;
}
