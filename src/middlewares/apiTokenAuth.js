const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function apiTokenAuth(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).json({ error: "Token não informado" });
    }

    const token = authHeader.replace("Bearer ", "").trim();

    const result = await pool.query(
      `
      SELECT advertiser_id
      FROM api_tokens
      WHERE token = $1
        AND is_active = true
      LIMIT 1
      `,
      [token]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Token inválido" });
    }

    req.advertiserId = result.rows[0].advertiser_id;

    next();
  } catch (err) {
    console.error("Erro na autenticação do token:", err);
    res.status(500).json({ error: "Erro interno" });
  }
}

module.exports = apiTokenAuth;
