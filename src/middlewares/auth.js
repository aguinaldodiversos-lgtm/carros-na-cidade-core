const jwt = require("jsonwebtoken");

function auth(req, res, next) {
  try {
    const header = req.headers.authorization;

    if (!header) {
      return res.status(401).json({ error: "Token não fornecido" });
    }

    const token = header.replace("Bearer ", "");

    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET
    );

    req.user = decoded;

    next();
  } catch (err) {
    console.error("Erro de autenticação:", err.message);
    return res.status(401).json({
      error: "Token inválido ou expirado",
    });
  }
}

module.exports = auth;
