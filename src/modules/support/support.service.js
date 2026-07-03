// Operações do USUÁRIO logado sobre seus próprios chamados. O autor vem
// SEMPRE de req.user.id (passado pelas rotas) — nunca do corpo da request.
// Validação de entrada e posse são checadas em toda operação.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as repo from "./support.repository.js";
import {
  parseTicketId,
  validateBody,
  validateCategory,
  validateSubject,
} from "./support.validation.js";
import { notifyAdminNewTicket, notifyAdminUserReply } from "./support.notifications.js";

/**
 * Cria um chamado (ticket + 1ª mensagem em transação) e dispara aviso ao
 * admin (best-effort — não bloqueia).
 */
export async function createTicket(userId, input) {
  const subject = validateSubject(input?.subject);
  const category = validateCategory(input?.category);
  const body = validateBody(input?.body);

  const { ticket, message } = await repo.createTicketWithFirstMessage({
    userId,
    subject,
    category,
    body,
  });

  // Dados do autor para a notificação (nome/e-mail). Falha aqui NÃO derruba
  // a criação — no pior caso o admin recebe um e-mail com menos contexto.
  let user = null;
  try {
    user = await repo.getUserContact(userId);
  } catch {
    user = null;
  }
  notifyAdminNewTicket({ ticket, user: user || { id: userId } });

  return { ticket, messages: [message] };
}

/** Lista os chamados do próprio usuário. */
export async function listMyTickets(userId) {
  return repo.listTicketsByUser(userId);
}

/** Retorna um chamado do próprio usuário + a thread. 404 se não for dele. */
export async function getMyTicket(userId, rawId) {
  const ticketId = parseTicketId(rawId);
  const ticket = await repo.getTicketByIdForUser(ticketId, userId);
  if (!ticket) {
    // 404 (não 403) de propósito: não vaza a existência de chamado alheio.
    throw new AppError("Chamado não encontrado.", 404);
  }
  const messages = await repo.listMessages(ticketId);
  return { ticket, messages };
}

/** Adiciona a resposta do usuário ao próprio chamado (reabre se resolvido). */
export async function replyToMyTicket(userId, rawId, input) {
  const ticketId = parseTicketId(rawId);
  const body = validateBody(input?.body);

  const existing = await repo.getTicketByIdForUser(ticketId, userId);
  if (!existing) {
    throw new AppError("Chamado não encontrado.", 404);
  }

  const { ticket, message } = await repo.addUserMessage({ ticketId, userId, body });

  // Avisa o admin da resposta (best-effort — não bloqueia). Buscar o contato
  // do autor pode falhar sem derrubar a operação: no pior caso o e-mail vai
  // com menos contexto.
  let user = null;
  try {
    user = await repo.getUserContact(userId);
  } catch {
    user = null;
  }
  notifyAdminUserReply({ ticket, message, user: user || { id: userId } });

  return { ticket, message };
}
