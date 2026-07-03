// Envio de e-mail transacional via Resend.
//
// NOTA DE MÓDULO (2026-07): este arquivo era CommonJS (require/module.exports)
// num projeto "type":"module" — ou seja, NÃO carregava sob ESM e era
// inutilizável pelo servidor (import falhava com "require is not defined").
// Convertido para ESM para que o backend possa de fato enviar e-mail (usado
// pelas notificações de chamados de suporte). As funções existentes
// (sendResetPasswordEmail, sendNewAdAlert) mantêm comportamento idêntico.
//
// Regra transversal: NENHUMA função aqui deve derrubar o chamador — cada
// envio tem try/catch próprio e apenas loga em falha. E-mail é notificação
// secundária, nunca bloqueia a operação principal.

import { Resend } from "resend";

const FROM = "Carros na Cidade <no-reply@carrosnacidade.com>";

// Cliente Resend LAZY e import-safe. O construtor lança se RESEND_API_KEY
// estiver ausente — construir no topo do módulo derrubaria o boot/os testes
// em qualquer ambiente sem a chave. Aqui, sem chave, retornamos null e cada
// função vira no-op silencioso (loga e segue) — coerente com "e-mail nunca
// bloqueia a operação principal".
let resendClient = null;
let resendInitFailed = false;

function getResend() {
  if (resendClient) return resendClient;
  if (resendInitFailed) return null;

  const key = process.env.RESEND_API_KEY;
  if (!key || !key.trim()) {
    return null;
  }

  try {
    resendClient = new Resend(key);
    return resendClient;
  } catch (err) {
    resendInitFailed = true;
    console.error("Erro ao inicializar Resend:", err?.message || err);
    return null;
  }
}

/**
 * Escapa entidades HTML para interpolar input do usuário (assunto/corpo) em
 * templates de e-mail sem risco de injeção de markup.
 */
export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Preserva quebras de linha do texto do usuário depois de escapado. */
function escapeMultiline(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function frontendBaseUrl() {
  const raw = process.env.FRONTEND_URL || "";
  return raw.replace(/\/+$/, "");
}

/* =====================================================
   EMAIL: RESET DE SENHA
===================================================== */
export async function sendResetPasswordEmail(to, token) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] RESEND_API_KEY ausente — e-mail de reset não enviado");
      return;
    }
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await resend.emails.send({
      from: FROM,
      to,
      subject: "Redefinição de senha",
      html: `
        <h2>Redefinição de senha</h2>
        <p>Você solicitou a redefinição da sua senha.</p>
        <p>Clique no link abaixo para criar uma nova senha:</p>
        <a href="${resetUrl}">${resetUrl}</a>
        <p>Este link expira em 1 hora.</p>
      `,
    });

    console.log(`📧 Email de reset enviado para: ${to}`);
  } catch (err) {
    console.error("Erro ao enviar email de reset:", err);
  }
}

/* =====================================================
   EMAIL: ALERTA DE NOVO ANÚNCIO
===================================================== */
export async function sendNewAdAlert(to, ad) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] RESEND_API_KEY ausente — alerta de anúncio não enviado");
      return;
    }
    const adUrl = `${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

    await resend.emails.send({
      from: FROM,
      to,
      subject: "Novo carro encontrado para você",
      html: `
        <h2>Encontramos um carro para você 🚗</h2>
        <p><strong>${ad.brand} ${ad.model}</strong></p>
        <p>Ano: ${ad.year}</p>
        <p>Preço: R$ ${ad.price}</p>
        <p>Cidade: ${ad.city}</p>

        <a href="${adUrl}" style="
          display:inline-block;
          padding:12px 20px;
          background:#2563eb;
          color:#fff;
          text-decoration:none;
          border-radius:6px;
          margin-top:10px;
        ">
          Ver anúncio
        </a>
      `,
    });

    console.log(`📢 Alerta de anúncio enviado para: ${to}`);
  } catch (err) {
    console.error("Erro ao enviar alerta de anúncio:", err);
  }
}

/* =====================================================
   EMAIL: CHAMADO DE SUPORTE — NOVO (aviso ao admin)
===================================================== */
/**
 * Avisa o admin de um chamado novo. Link direto para o painel admin do
 * chamado. subject/nome/e-mail do autor são escapados (input do usuário).
 * @param {string} adminEmail destinatário (ADMIN_NOTIFICATION_EMAIL)
 * @param {{ ticket: object, user?: object }} payload
 */
export async function sendTicketCreated(adminEmail, { ticket, user }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] RESEND_API_KEY ausente — aviso de chamado novo não enviado");
      return;
    }
    const adminUrl = `${frontendBaseUrl()}/admin/chamados/${ticket.id}`;
    const authorName = user?.name ? escapeHtml(user.name) : "Usuário";
    const authorEmail = user?.email ? escapeHtml(user.email) : "—";
    const subject = escapeHtml(ticket.subject);
    const category = ticket.category ? escapeHtml(ticket.category) : "—";

    await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `Novo chamado de suporte: ${subject}`,
      html: `
        <h2>Novo chamado de suporte 🆘</h2>
        <p><strong>Assunto:</strong> ${subject}</p>
        <p><strong>Categoria:</strong> ${category}</p>
        <p><strong>De:</strong> ${authorName} (${authorEmail})</p>
        <p><strong>Chamado #${ticket.id}</strong></p>
        <a href="${adminUrl}" style="
          display:inline-block;
          padding:12px 20px;
          background:#0f4db6;
          color:#fff;
          text-decoration:none;
          border-radius:6px;
          margin-top:10px;
        ">
          Abrir chamado no painel
        </a>
      `,
    });

    console.log(`🆘 Aviso de chamado novo enviado para admin: ${adminEmail}`);
  } catch (err) {
    console.error("Erro ao enviar aviso de chamado novo:", err);
  }
}

/* =====================================================
   EMAIL: CHAMADO DE SUPORTE — RESPOSTA DO ADMIN (aviso ao usuário)
===================================================== */
/**
 * Avisa o usuário que o admin respondeu. O link do painel é derivado do tipo
 * de conta do dono (CNPJ → painel da loja; senão painel PF). Corpo da
 * mensagem é escapado.
 * @param {string} userEmail destinatário (dono do chamado)
 * @param {{ ticket: object, message: object }} payload
 */
export async function sendTicketReply(userEmail, { ticket, message }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] RESEND_API_KEY ausente — aviso de resposta não enviado");
      return;
    }
    const doc = String(ticket?.user_document_type || "").trim().toLowerCase();
    const basePath = doc === "cnpj" ? "/dashboard-loja/suporte" : "/dashboard/suporte";
    const panelUrl = `${frontendBaseUrl()}${basePath}?ticket=${ticket.id}`;
    const subject = escapeHtml(ticket.subject);
    const excerpt = message?.body ? escapeMultiline(String(message.body).slice(0, 600)) : "";

    await resend.emails.send({
      from: FROM,
      to: userEmail,
      subject: `Resposta ao seu chamado: ${subject}`,
      html: `
        <h2>Você tem uma resposta do suporte 💬</h2>
        <p>O nosso time respondeu ao seu chamado <strong>#${ticket.id}</strong> — "${subject}".</p>
        ${excerpt ? `<blockquote style="border-left:3px solid #cfe0fc;margin:12px 0;padding:8px 14px;color:#334155;">${excerpt}</blockquote>` : ""}
        <a href="${panelUrl}" style="
          display:inline-block;
          padding:12px 20px;
          background:#0f4db6;
          color:#fff;
          text-decoration:none;
          border-radius:6px;
          margin-top:10px;
        ">
          Ver conversa
        </a>
      `,
    });

    console.log(`💬 Aviso de resposta enviado ao usuário: ${userEmail}`);
  } catch (err) {
    console.error("Erro ao enviar aviso de resposta de chamado:", err);
  }
}

/* =====================================================
   EMAIL: CHAMADO DE SUPORTE — RESPOSTA DO USUÁRIO (aviso ao admin)
===================================================== */
/**
 * Avisa o admin de que o usuário respondeu num chamado existente (sem isso o
 * admin não sabe que houve nova mensagem). Link direto para o painel admin do
 * chamado. Nome/e-mail do autor e corpo da mensagem são escapados.
 * @param {string} adminEmail destinatário (ADMIN_NOTIFICATION_EMAIL)
 * @param {{ ticket: object, message: object, user?: object }} payload
 */
export async function sendTicketUserReply(adminEmail, { ticket, message, user }) {
  try {
    const resend = getResend();
    if (!resend) {
      console.warn("[email] RESEND_API_KEY ausente — aviso de resposta do usuário não enviado");
      return;
    }
    const adminUrl = `${frontendBaseUrl()}/admin/chamados/${ticket.id}`;
    const authorName = user?.name ? escapeHtml(user.name) : "Usuário";
    const authorEmail = user?.email ? escapeHtml(user.email) : "—";
    const subject = escapeHtml(ticket.subject);
    const excerpt = message?.body ? escapeMultiline(String(message.body).slice(0, 600)) : "";

    await resend.emails.send({
      from: FROM,
      to: adminEmail,
      subject: `Nova resposta no chamado: ${subject}`,
      html: `
        <h2>Nova resposta de usuário 💬</h2>
        <p><strong>${authorName}</strong> (${authorEmail}) respondeu ao chamado <strong>#${ticket.id}</strong> — "${subject}".</p>
        ${excerpt ? `<blockquote style="border-left:3px solid #cfe0fc;margin:12px 0;padding:8px 14px;color:#334155;">${excerpt}</blockquote>` : ""}
        <a href="${adminUrl}" style="
          display:inline-block;
          padding:12px 20px;
          background:#0f4db6;
          color:#fff;
          text-decoration:none;
          border-radius:6px;
          margin-top:10px;
        ">
          Abrir chamado no painel
        </a>
      `,
    });

    console.log(`💬 Aviso de resposta de usuário enviado ao admin: ${adminEmail}`);
  } catch (err) {
    console.error("Erro ao enviar aviso de resposta de usuário:", err);
  }
}
