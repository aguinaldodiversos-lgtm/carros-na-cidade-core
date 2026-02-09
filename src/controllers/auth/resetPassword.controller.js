const { Pool } = require("pg");
const bcrypt = require("bcryptjs");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const { token, password } = req.body;

    const result = await pool.query(
      `SELECT id
       FROM users
       WHERE reset_token = $1
       AND reset_token_expires > NOW()`,
      [token]
    );

    const user = result.rows[0];

    if (!user) {
      return res.status(400).json({
        error: "Token inválido ou expirado",
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    await pool.query(
      `UPDATE users
       SET password_hash = $1,
           reset_token = NULL,
           reset_token_expires = NULL
       WHERE id = $2`,
      [passwordHash, user.id]
    );

    res.json({ success: true });
  } catch (err) {
    console.error("Erro no reset password:", err);
    res.status(500).json({
      error: "Erro ao redefinir senha",
    });
  }
};
