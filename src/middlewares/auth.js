/**
 * LEGACY COMPAT — src/middlewares/auth.js
 *
 * Este middleware está depreciado e é usado apenas por rotas em src/routes/
 * que NÃO estão montadas no app.js principal (dead code).
 *
 * Para novas rotas, use SEMPRE: src/shared/middlewares/auth.middleware.js
 *
 * Este arquivo foi endurecido para validar issuer, audience e type do token,
 * alinhando-o com o middleware canônico.
 */
const jwt = require("jsonwebtoken");

const JWT_ISSUER   = process.env.JWT_ISSUER   || "carros-na-cidade";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "carros-na-cidade-users";

function auth(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const parts  = header.split(/\s+/);

    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer" || !parts[1]) {
      return res.status(401).json({ error: "Token não fornecido" });
    }

    const decoded = jwt.verify(parts[1], process.env.JWT_SECRET, {
      issuer:     JWT_ISSUER,
      audience:   JWT_AUDIENCE,
      algorithms: ["HS256"],
    });

    if (decoded.type !== "access") {
      return res.status(401).json({ error: "Token inválido" });
    }

    req.user = decoded;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido ou expirado" });
  }
}

module.exports = auth;
