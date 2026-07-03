// Acesso a dados dos chamados de suporte. TODAS as queries são
// parametrizadas ($1,$2,...) — zero concatenação de input. Operações
// compostas (criar chamado + 1ª mensagem, responder + atualizar timestamps)
// rodam em transação para nunca deixar estado inconsistente.

import { query, withTransaction } from "../../infrastructure/database/db.js";
import { SUPPORT_AUTHOR_ROLE, SUPPORT_TICKET_STATUS } from "./support.constants.js";

const TICKET_COLUMNS = `
  id, user_id, subject, category, status,
  created_at, updated_at, last_message_at
`;

const MESSAGE_COLUMNS = `
  id, ticket_id, author_id, author_role, body, created_at
`;

/**
 * Cria um chamado + a 1ª mensagem numa MESMA transação. Nunca deixa ticket
 * órfão sem mensagem: se a mensagem falhar, o ticket sofre ROLLBACK.
 * @returns {Promise<{ ticket: object, message: object }>}
 */
export async function createTicketWithFirstMessage({ userId, subject, category, body }) {
  return withTransaction(async (tx) => {
    const ticketResult = await tx.query(
      `
      INSERT INTO support_tickets (user_id, subject, category, status)
      VALUES ($1, $2, $3, $4)
      RETURNING ${TICKET_COLUMNS}
      `,
      [userId, subject, category, SUPPORT_TICKET_STATUS.OPEN]
    );
    const ticket = ticketResult.rows[0];

    const messageResult = await tx.query(
      `
      INSERT INTO support_ticket_messages (ticket_id, author_id, author_role, body)
      VALUES ($1, $2, $3, $4)
      RETURNING ${MESSAGE_COLUMNS}
      `,
      [ticket.id, userId, SUPPORT_AUTHOR_ROLE.USER, body]
    );

    return { ticket, message: messageResult.rows[0] };
  });
}

/** Lista os chamados de UM usuário (mais recentes por atividade primeiro). */
export async function listTicketsByUser(userId) {
  const result = await query(
    `
    SELECT ${TICKET_COLUMNS}
    FROM support_tickets
    WHERE user_id = $1
    ORDER BY last_message_at DESC
    `,
    [userId]
  );
  return result.rows;
}

/** Busca um chamado garantindo posse pelo usuário. Retorna null se não existe
 * OU não pertence ao usuário (o serviço traduz null → 404, sem vazar). */
export async function getTicketByIdForUser(ticketId, userId) {
  const result = await query(
    `
    SELECT ${TICKET_COLUMNS}
    FROM support_tickets
    WHERE id = $1 AND user_id = $2
    LIMIT 1
    `,
    [ticketId, userId]
  );
  return result.rows[0] || null;
}

/** Busca um chamado (visão admin) com dados do autor via JOIN em users. */
export async function getTicketByIdWithAuthor(ticketId) {
  const result = await query(
    `
    SELECT
      t.id, t.user_id, t.subject, t.category, t.status,
      t.created_at, t.updated_at, t.last_message_at,
      u.name          AS user_name,
      u.email         AS user_email,
      u.document_type AS user_document_type
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    WHERE t.id = $1
    LIMIT 1
    `,
    [ticketId]
  );
  return result.rows[0] || null;
}

/** Lê a thread completa de um chamado em ordem cronológica. */
export async function listMessages(ticketId) {
  const result = await query(
    `
    SELECT ${MESSAGE_COLUMNS}
    FROM support_ticket_messages
    WHERE ticket_id = $1
    ORDER BY created_at ASC, id ASC
    `,
    [ticketId]
  );
  return result.rows;
}

/**
 * Adiciona a resposta do USUÁRIO e atualiza o chamado na mesma transação:
 * bump de last_message_at/updated_at e REABERTURA (resolvido → aberto).
 * @returns {Promise<{ ticket: object, message: object }>}
 */
export async function addUserMessage({ ticketId, userId, body }) {
  return withTransaction(async (tx) => {
    const messageResult = await tx.query(
      `
      INSERT INTO support_ticket_messages (ticket_id, author_id, author_role, body)
      VALUES ($1, $2, $3, $4)
      RETURNING ${MESSAGE_COLUMNS}
      `,
      [ticketId, userId, SUPPORT_AUTHOR_ROLE.USER, body]
    );

    const ticketResult = await tx.query(
      `
      UPDATE support_tickets
      SET last_message_at = NOW(),
          updated_at = NOW(),
          status = CASE WHEN status = $2 THEN $3 ELSE status END
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}
      `,
      [ticketId, SUPPORT_TICKET_STATUS.RESOLVED, SUPPORT_TICKET_STATUS.OPEN]
    );

    return { ticket: ticketResult.rows[0], message: messageResult.rows[0] };
  });
}

/**
 * Adiciona a resposta do ADMIN e move o chamado para 'em_andamento' na mesma
 * transação (bump de timestamps).
 * @returns {Promise<{ ticket: object, message: object }>}
 */
export async function addAdminMessage({ ticketId, adminId, body }) {
  return withTransaction(async (tx) => {
    const messageResult = await tx.query(
      `
      INSERT INTO support_ticket_messages (ticket_id, author_id, author_role, body)
      VALUES ($1, $2, $3, $4)
      RETURNING ${MESSAGE_COLUMNS}
      `,
      [ticketId, adminId, SUPPORT_AUTHOR_ROLE.ADMIN, body]
    );

    const ticketResult = await tx.query(
      `
      UPDATE support_tickets
      SET status = $2,
          last_message_at = NOW(),
          updated_at = NOW()
      WHERE id = $1
      RETURNING ${TICKET_COLUMNS}
      `,
      [ticketId, SUPPORT_TICKET_STATUS.IN_PROGRESS]
    );

    return { ticket: ticketResult.rows[0], message: messageResult.rows[0] };
  });
}

/** Muda o status manualmente (admin). Retorna o chamado atualizado ou null. */
export async function updateTicketStatus(ticketId, status) {
  const result = await query(
    `
    UPDATE support_tickets
    SET status = $2, updated_at = NOW()
    WHERE id = $1
    RETURNING ${TICKET_COLUMNS}
    `,
    [ticketId, status]
  );
  return result.rows[0] || null;
}

/**
 * Lista TODOS os chamados (visão admin) com dados do autor, filtros opcionais
 * (status exato, busca por assunto/nome/e-mail) e paginação. Devolve linhas +
 * total para paginar. Filtros usam placeholders — nada é concatenado.
 */
export async function listAllTickets({ status, q, limit, offset }) {
  const conditions = [];
  const params = [];

  if (status) {
    params.push(status);
    conditions.push(`t.status = $${params.length}`);
  }

  if (q) {
    params.push(`%${q}%`);
    const idx = params.length;
    conditions.push(
      `(t.subject ILIKE $${idx} OR u.name ILIKE $${idx} OR u.email ILIKE $${idx})`
    );
  }

  const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";

  const totalResult = await query(
    `
    SELECT COUNT(*)::int AS total
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    ${where}
    `,
    params
  );
  const total = totalResult.rows[0]?.total ?? 0;

  params.push(limit);
  const limitIdx = params.length;
  params.push(offset);
  const offsetIdx = params.length;

  const rowsResult = await query(
    `
    SELECT
      t.id, t.user_id, t.subject, t.category, t.status,
      t.created_at, t.updated_at, t.last_message_at,
      u.name          AS user_name,
      u.email         AS user_email,
      u.document_type AS user_document_type,
      (
        SELECT COUNT(*)::int
        FROM support_ticket_messages m
        WHERE m.ticket_id = t.id
      ) AS message_count
    FROM support_tickets t
    LEFT JOIN users u ON u.id = t.user_id
    ${where}
    ORDER BY t.last_message_at DESC
    LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `,
    params
  );

  return { rows: rowsResult.rows, total };
}

/** Contagem de chamados por status (para o resumo/contador do admin). */
export async function countTicketsByStatus() {
  const result = await query(
    `
    SELECT status, COUNT(*)::int AS count
    FROM support_tickets
    GROUP BY status
    `
  );
  return result.rows;
}

/** Dados de contato do autor (id, nome, e-mail, tipo de documento) para
 * montar a notificação por e-mail sem redigitação. */
export async function getUserContact(userId) {
  const result = await query(
    `
    SELECT id, name, email, document_type
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );
  return result.rows[0] || null;
}
