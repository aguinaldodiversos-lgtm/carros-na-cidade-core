async function sendResetPasswordEmail(to, token) {
  try {
    const url = `https://carrosnacidade.com/reset-password?token=${token}`;

    await resend.emails.send({
      from: process.env.EMAIL_FROM,
      to,
      subject: "Redefinir sua senha",
      html: `
        <div style="font-family: Arial, sans-serif;">
          <h2>Redefinição de senha</h2>
          <p>Recebemos uma solicitação para redefinir sua senha.</p>
          <p>Clique no botão abaixo para criar uma nova senha:</p>
          <br>
          <a href="${url}" 
             style="background:#0d6efd;color:#fff;padding:10px 16px;
                    text-decoration:none;border-radius:6px;">
            Redefinir senha
          </a>
          <br><br>
          <small>
            Este link expira em 1 hora.
          </small>
        </div>
      `,
    });
  } catch (err) {
    console.error("Erro ao enviar email de reset:", err);
  }
}

module.exports = {
  sendNewAdAlert,
  sendResetPasswordEmail,
};
