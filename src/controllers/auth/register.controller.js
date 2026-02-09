const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: "Email e senha são obrigatórios",
      });
    }

    // verifica se usuário já existe
    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({
        error: "Email já cadastrado",
      });
    }

    // criptografa a senha
    const passwordHash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (name, email, password_hash)
       VALUES ($1, $2, $3)
       RETURNING id, email`,
      [name || null, email, passwordHash]
    );

    const user = result.rows[0];

    // gera token
    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Erro no registro:", err);
    res.status(500).json({
      error: "Erro ao registrar usuário",
    });
  }
};
