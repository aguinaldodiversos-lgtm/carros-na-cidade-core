const { sendResetPasswordEmail } = require("../../services/email.service");
const { Pool } = require("pg");
const crypto = require("crypto");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const { email } = req.body;

    const result = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user) {
      return res.json({ success: true });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const expires = new Date(Date.now() + 1000 * 60 * 60); // 1 hora

    await pool.query(
      `UPDATE users
       SET reset_token = $1,
           reset_token_expires = $2
       WHERE id = $3`,
      [resetToken, expires, user.id]
    );

    // envio do email real
    await sendResetPasswordEmail(email, resetToken);

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no forgot password:", err);
    res.status(500).json({
      error: "Erro ao processar solicitação",
    });
  }
};
