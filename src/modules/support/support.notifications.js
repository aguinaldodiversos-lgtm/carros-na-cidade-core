// Notificação por e-mail dos chamados (camada SECUNDÁRIA). Regra de ouro:
// e-mail NUNCA bloqueia nem derruba a operação principal. Tudo aqui é
// fire-and-forget com .catch — se o Resend falhar/estiver lento, o chamado
// já foi salvo e a request já respondeu; só logamos o erro.

import { logger } from "../../shared/logger.js";
import {
  sendTicketCreated,
  sendTicketReply,
  sendTicketUserReply,
} from "../../services/email.service.js";

/** Resolve o destinatário admin da env. Vazio/ausente → null (com WARN). */
function resolveAdminEmail() {
  const email = process.env.ADMIN_NOTIFICATION_EMAIL;
  return typeof email === "string" && email.trim() ? email.trim() : null;
}

/**
 * Avisa o admin de um chamado novo. Se ADMIN_NOTIFICATION_EMAIL não estiver
 * configurada, loga WARN explícito e segue — não é erro fatal.
 */
export function notifyAdminNewTicket({ ticket, user }) {
  const adminEmail = resolveAdminEmail();
  if (!adminEmail) {
    logger.warn(
      "[support] ADMIN_NOTIFICATION_EMAIL não configurada — aviso de chamado novo não enviado"
    );
    return;
  }

  Promise.resolve()
    .then(() => sendTicketCreated(adminEmail, { ticket, user }))
    .catch((err) =>
      logger.error(
        { err: err?.message || String(err), ticketId: ticket?.id },
        "[support] falha ao notificar admin de chamado novo"
      )
    );
}

/**
 * Avisa o usuário que o admin respondeu. O e-mail e o tipo de conta do dono
 * vêm no próprio `ticket` (carregado via JOIN users na camada admin).
 */
export function notifyUserAdminReply({ ticket, message }) {
  const userEmail =
    ticket && typeof ticket.user_email === "string" ? ticket.user_email.trim() : "";
  if (!userEmail) {
    logger.warn(
      { ticketId: ticket?.id },
      "[support] chamado sem e-mail de usuário — resposta do admin não notificada"
    );
    return;
  }

  Promise.resolve()
    .then(() => sendTicketReply(userEmail, { ticket, message }))
    .catch((err) =>
      logger.error(
        { err: err?.message || String(err), ticketId: ticket?.id },
        "[support] falha ao notificar usuário de resposta do admin"
      )
    );
}

/**
 * Avisa o admin quando o USUÁRIO responde num chamado existente. Guarda por
 * author_role='user' (defesa: nunca notifica o admin da própria resposta do
 * admin). Se ADMIN_NOTIFICATION_EMAIL não estiver configurada, loga WARN e
 * segue — não é erro fatal.
 */
export function notifyAdminUserReply({ ticket, message, user }) {
  // Só quando a mensagem é do usuário. O fluxo já vem do endpoint do usuário,
  // mas mantemos a checagem como rede de segurança.
  if (message?.author_role && message.author_role !== "user") {
    return;
  }

  const adminEmail = resolveAdminEmail();
  if (!adminEmail) {
    logger.warn(
      "[support] ADMIN_NOTIFICATION_EMAIL não configurada — resposta do usuário não notificada ao admin"
    );
    return;
  }

  Promise.resolve()
    .then(() => sendTicketUserReply(adminEmail, { ticket, message, user }))
    .catch((err) =>
      logger.error(
        { err: err?.message || String(err), ticketId: ticket?.id },
        "[support] falha ao notificar admin de resposta do usuário"
      )
    );
}
