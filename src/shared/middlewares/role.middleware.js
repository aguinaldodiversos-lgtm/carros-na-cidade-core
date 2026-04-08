import { AppError } from "./error.middleware.js";
import { USER_ROLE } from "../constants/status.js";

/**
 * Express middleware factory that enforces role-based access control.
 * Must be placed AFTER authMiddleware (requires req.user).
 *
 * @param {string[]} allowedRoles — roles that can access the route
 * @returns {import('express').RequestHandler}
 */
export function requireRole(...allowedRoles) {
  const roles = new Set(allowedRoles.flat());

  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Autenticação necessária", 401));
    }

    const userRole = req.user.role || USER_ROLE.USER;

    if (!roles.has(userRole)) {
      return next(new AppError("Acesso não autorizado para este recurso", 403));
    }

    return next();
  };
}

export function requireAdmin() {
  return requireRole(USER_ROLE.ADMIN);
}
