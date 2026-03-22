import { verifyAccessToken } from "../../modules/auth/jwt.strategy.js";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "./error.middleware.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function extractBearerToken(authorizationHeader) {
  const header = normalizeString(authorizationHeader);

  if (!header) {
    throw new AppError("Token não fornecido", 401);
  }

  const [scheme, token] = header.split(/\s+/);

  if (!scheme || scheme.toLowerCase() !== "bearer" || !token) {
    throw new AppError("Token não fornecido", 401);
  }

  return token;
}

function normalizeUserId(value) {
  const normalized = normalizeString(value);

  if (!normalized) {
    throw new AppError("Token inválido", 401);
  }

  return normalized;
}

export async function authMiddleware(req, res, next) {
  try {
    const token = extractBearerToken(req.headers.authorization);
    const decoded = verifyAccessToken(token);
    const userId = normalizeUserId(decoded?.id);

    const result = await pool.query(
      `
      SELECT id, role, plan
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

    const user = result.rows?.[0];

    if (!user) {
      throw new AppError("Usuário inválido", 401);
    }

    req.user = {
      id: String(user.id),
      role: user.role || "user",
      plan: user.plan || "free",
    };

    req.auth = {
      token,
      decoded,
    };

    return next();
  } catch (err) {
    req.log?.warn?.(
      {
        error: err?.message || String(err),
      },
      "[auth.middleware] Falha de autenticação"
    );

    if (err instanceof AppError) {
      return next(err);
    }

    return next(new AppError("Falha interna na autenticação", 500));
  }
}

export default authMiddleware;
