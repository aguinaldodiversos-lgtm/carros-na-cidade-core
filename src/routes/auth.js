const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const { OAuth2Client } = require("google-auth-library");
const { Pool } = require("pg");

const router = express.Router();
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/* =====================================================
   GERAR JWT
===================================================== */
function generateToken(user) {
  return jwt.sign(
    {
      user_id: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    { expiresIn: "7d" }
  );
}

/* =====================================================
   LOGIN COM GOOGLE
   Frontend envia: { id_token }
===================================================== */
router.post("/google", async (req, res) => {
  try {
    const { id_token } = req.body;

    if (!id_token) {
      return res.status(400).json({ error: "id_token não informado" });
    }

    // validar token com Google
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });

    const payload = ticket.getPayload();
    const googleId = payload.sub;
    const email = payload.email;
    const name = payload.name;
    const avatar = payload.picture;

    // verificar se usuário já existe
    let userResult = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    let user;

    if (userResult.rows.length === 0) {
      // criar usuário
      const insertUser = await pool.query(
        `INSERT INTO users (email, name, avatar_url)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [email, name, avatar]
      );
      user = insertUser.rows[0];

      // criar provider google
      await pool.query(
        `INSERT INTO auth_providers
         (user_id, provider, provider_user_id)
         VALUES ($1, 'google', $2)`,
        [user.id, googleId]
      );
    } else {
      user = userResult.rows[0];
    }

    const token = generateToken(user);

    res.json({
      token,
      user,
    });
  } catch (err) {
    console.error("Erro login Google:", err);
    res.status(401).json({ error: "Falha na autenticação Google" });
  }
});

/* =====================================================
   REGISTRO COM EMAIL E SENHA
===================================================== */
router.post("/register", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: "Email e senha obrigatórios" });
    }

    const existing = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [email]
    );

    if (existing.rows.length > 0) {
      return res.status(400).json({ error: "Email já cadastrado" });
    }

    const hash = await bcrypt.hash(password, 10);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING *`,
      [email, hash, name || null]
    );

    const user = result.rows[0];

    await pool.query(
      `INSERT INTO auth_providers
       (user_id, provider, provider_user_id)
       VALUES ($1, 'email', $2)`,
      [user.id, email]
    );

    const token = generateToken(user);

    res.json({ token, user });
  } catch (err) {
    console.error("Erro registro:", err);
    res.status(500).json({ error: "Erro ao registrar usuário" });
  }
});

/* =====================================================
   LOGIN COM EMAIL E SENHA
===================================================== */

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const result = await pool.query(
      "SELECT * FROM users WHERE email = $1",
      [email]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const user = result.rows[0];

    if (!user.password_hash) {
      return res.status(400).json({
        error: "Conta criada com Google. Use login social.",
      });
    }

    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ error: "Credenciais inválidas" });
    }

    const token = generateToken(user);

    // usuário seguro (sem password_hash)
    const safeUser = {
      id: user.id,
      email: user.email,
      name: user.name,
      avatar_url: user.avatar_url,
    };

    res.json({ token, user: safeUser });
  } catch (err) {
    console.error("Erro login:", err);
    res.status(500).json({ error: "Erro no login" });
  }
});

module.exports = router;

