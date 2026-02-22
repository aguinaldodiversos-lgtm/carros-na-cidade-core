// src/shared/middlewares/auth.middleware.js

import { verifyAccessToken } from "../../modules/auth/jwt.strategy.js";
import { AppError } from "./error.middleware.js";

export function authMiddleware(requiredRole = null) {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        throw new AppError("Token não fornecido", 401);
      }

      const token = authHeader.split(" ")[1];

      const decoded = verifyAccessToken(token);

      req.user = decoded;

      if (requiredRole && decoded.role !== requiredRole) {
        throw new AppError("Permissão insuficiente", 403);
      }

      next();
    } catch (err) {
      next(new AppError("Token inválido ou expirado", 401));
    }
  };
}
