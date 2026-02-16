const {
  sendPhoneVerification,
  confirmPhoneCode,
} = require("../../services/phoneVerification.service");

/* =====================================================
   ENVIAR CÓDIGO
===================================================== */
async function sendCode(req, res) {
  try {
    const userId = req.user.id;
    const { phone } = req.body;

    if (!phone) {
      return res.status(400).json({
        error: "Telefone não informado",
      });
    }

    await sendPhoneVerification(userId, phone);

    return res.json({
      success: true,
      message: "Código enviado para o WhatsApp",
    });
  } catch (err) {
    console.error("Erro ao enviar código:", err);
    res.status(500).json({
      error: "Erro interno",
    });
  }
}

/* =====================================================
   CONFIRMAR CÓDIGO
===================================================== */
async function confirmCode(req, res) {
  try {
    const userId = req.user.id;
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: "Código não informado",
      });
    }

    const valid = await confirmPhoneCode(userId, code);

    if (!valid) {
      return res.status(400).json({
        error: "Código inválido ou expirado",
      });
    }

    return res.json({
      success: true,
      message: "Telefone verificado com sucesso",
    });
  } catch (err) {
    console.error("Erro ao confirmar código:", err);
    res.status(500).json({
      error: "Erro interno",
    });
  }
}

module.exports = {
  sendCode,
  confirmCode,
};
