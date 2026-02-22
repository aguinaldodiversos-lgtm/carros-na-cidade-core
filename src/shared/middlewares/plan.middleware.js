// src/shared/middlewares/plan.middleware.js

import { AppError } from "./error.middleware.js";

const PLAN_HIERARCHY = {
  free: 1,
  start: 2,
  pro: 3,
};

export function requirePlan(requiredPlan) {
  return (req, res, next) => {
    if (!req.user) {
      throw new AppError("Usuário não autenticado", 401);
    }

    const userPlan = req.user.plan || "free";

    if (
      PLAN_HIERARCHY[userPlan] <
      PLAN_HIERARCHY[requiredPlan]
    ) {
      throw new AppError(
        `Plano ${requiredPlan} necessário`,
        403
      );
    }

    next();
  };
}
