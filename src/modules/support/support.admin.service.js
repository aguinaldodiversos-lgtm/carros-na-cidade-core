// Operações do ADMIN sobre qualquer chamado. Autorização (role=admin) é
// garantida pelo requireAdmin() nas rotas; aqui cuidamos de validação,
// paginação segura e transições de status.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import * as repo from "./support.repository.js";
import { parseTicketId, validateBody, validateStatus } from "./support.validation.js";
import { SUPPORT_TICKET_STATUS, SUPPORT_TICKET_STATUSES } from "./support.constants.js";
import { notifyUserAdminReply } from "./support.notifications.js";

/** Deriva o tipo de conta (CNPJ/CPF/pending) do document_type — mesma regra
 * do auth.middleware, para o admin ver "Lojista" vs "Particular". */
function accountTypeFromDocument(documentType) {
  const doc = documentType == null ? "" : String(documentType).trim().toLowerCase();
  if (doc === "") return "pending";
  if (doc === "cnpj") return "CNPJ";
  return "CPF";
}

function decorateAuthor(ticket) {
  if (!ticket) return ticket;
  return {
    ...ticket,
    user_account_type: accountTypeFromDocument(ticket.user_document_type),
  };
}

function clampInt(value, fallback, min, max) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

/** Lista paginada de chamados com filtros (status, busca). Devolve envelope
 * data/total/limit/offset alinhado ao ApiList do admin frontend. */
export async function listTickets(rawFilters = {}) {
  const status =
    rawFilters.status &&
    SUPPORT_TICKET_STATUSES.includes(String(rawFilters.status).trim().toLowerCase())
      ? String(rawFilters.status).trim().toLowerCase()
      : null;
  const q =
    typeof rawFilters.q === "string" && rawFilters.q.trim()
      ? rawFilters.q.trim().slice(0, 120)
      : null;
  const limit = clampInt(rawFilters.limit, 30, 1, 100);
  const offset = clampInt(rawFilters.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const { rows, total } = await repo.listAllTickets({ status, q, limit, offset });
  return { data: rows.map(decorateAuthor), total, limit, offset };
}

/** Contadores por status para os KPIs da fila. */
export async function getSummary() {
  const rows = await repo.countTicketsByStatus();
  const counts = {
    [SUPPORT_TICKET_STATUS.OPEN]: 0,
    [SUPPORT_TICKET_STATUS.IN_PROGRESS]: 0,
    [SUPPORT_TICKET_STATUS.RESOLVED]: 0,
  };
  for (const row of rows) {
    if (Object.prototype.hasOwnProperty.call(counts, row.status)) {
      counts[row.status] = row.count;
    }
  }
  const total = counts[SUPPORT_TICKET_STATUS.OPEN] +
    counts[SUPPORT_TICKET_STATUS.IN_PROGRESS] +
    counts[SUPPORT_TICKET_STATUS.RESOLVED];
  return { counts, total };
}

/** Chamado + thread + dados do autor. 404 se não existir. */
export async function getTicket(rawId) {
  const ticketId = parseTicketId(rawId);
  const ticket = await repo.getTicketByIdWithAuthor(ticketId);
  if (!ticket) {
    throw new AppError("Chamado não encontrado.", 404);
  }
  const messages = await repo.listMessages(ticketId);
  return { ticket: decorateAuthor(ticket), messages };
}

/** Resposta do admin: adiciona mensagem, move para 'em_andamento' e notifica
 * o usuário (best-effort). */
export async function replyToTicket(adminId, rawId, input) {
  const ticketId = parseTicketId(rawId);
  const body = validateBody(input?.body);

  const existing = await repo.getTicketByIdWithAuthor(ticketId);
  if (!existing) {
    throw new AppError("Chamado não encontrado.", 404);
  }

  const { ticket, message } = await repo.addAdminMessage({ ticketId, adminId, body });

  // Reanexa os dados do autor (e-mail/tipo) ao ticket atualizado para a
  // notificação e para a resposta ao front.
  const enriched = {
    ...ticket,
    user_email: existing.user_email,
    user_name: existing.user_name,
    user_document_type: existing.user_document_type,
  };

  notifyUserAdminReply({ ticket: enriched, message });

  return { ticket: decorateAuthor(enriched), message };
}

/** Mudança manual de status pelo admin. Valida o valor ∈ conjunto permitido. */
export async function changeStatus(rawId, input) {
  const ticketId = parseTicketId(rawId);
  const status = validateStatus(input?.status);

  const ticket = await repo.updateTicketStatus(ticketId, status);
  if (!ticket) {
    throw new AppError("Chamado não encontrado.", 404);
  }
  return ticket;
}
