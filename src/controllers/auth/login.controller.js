const { Pool } = require("pg");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

module.exports = async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT id, password_hash FROM users WHERE email = $1",
      [email]
    );

    const user = result.rows[0];

    if (!user || !user.password_hash) {
      return res.status(401).json({
        error: "Credenciais inválidas",
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({
        error: "Credenciais inválidas",
      });
    }

    const token = jwt.sign(
      { id: user.id },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ token });
  } catch (err) {
    console.error("Erro no login:", err);
    res.status(500).json({
      error: "Erro ao fazer login",
    });
  }
};
