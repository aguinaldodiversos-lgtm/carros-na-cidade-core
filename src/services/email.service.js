const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/* =====================================================
   EMAIL: RESET DE SENHA
===================================================== */
async function sendResetPasswordEmail(to, token) {
  try {
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${token}`;

    await resend.emails.send({
      from: "Carros na Cidade <no-reply@carrosnacidade.com>",
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
async function sendNewAdAlert(to, ad) {
  try {
    const adUrl = `${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

    await resend.emails.send({
      from: "Carros na Cidade <no-reply@carrosnacidade.com>",
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

module.exports = {
  sendResetPasswordEmail,
  sendNewAdAlert,
};
