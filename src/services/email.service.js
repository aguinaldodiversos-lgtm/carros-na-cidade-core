const { Resend } = require("resend");

const resend = new Resend(process.env.RESEND_API_KEY);

/* =====================================================
   EMAIL: RESET DE SENHA
===================================================== */
async function sendResetPasswordEmail(to, token) {
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
}

/* =====================================================
   EMAIL: ALERTA DE NOVO ANÚNCIO
===================================================== */
async function sendNewAdAlert(to, ad) {
  const adUrl = `${process.env.FRONTEND_URL}/anuncio/${ad.id}`;

  await resend.emails.send({
    from: "Carros na Cidade <no-reply@carrosnacidade.com>",
    to,
    subject: "Novo carro encontrado para você",
    html: `
      <h2>Novo veículo disponível</h2>
      <p><strong>${ad.title}</strong></p>
      <p>Preço: R$ ${ad.price}</p>
      <a href="${adUrl}">Ver anúncio</a>
    `,
  });
}

module.exports = {
  sendResetPasswordEmail,
  sendNewAdAlert,
};
