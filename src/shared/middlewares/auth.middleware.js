import { verifyAccessToken } from "../../modules/auth/jwt.strategy.js";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "./error.middleware.js";

export async function authMiddleware(req, res, next) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      throw new AppError("Token não fornecido", 401);
    }

    const token = authHeader.split(" ")[1];

    const decoded = verifyAccessToken(token);

    // Verifica se usuário ainda existe
    const result = await pool.query(
      "SELECT id, role, plan FROM users WHERE id = $1",
      [decoded.id]
    );

    if (!result.rows.length) {
      throw new AppError("Usuário inválido", 401);
    }

    req.user = result.rows[0];

    next();
  } catch (err) {
    next(new AppError("Acesso não autorizado", 401));
  }
}
