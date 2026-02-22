import { AppError } from "./error.middleware.js";

export function requirePlan(requiredPlan) {
  const hierarchy = ["free", "start", "pro"];

  return (req, res, next) => {
    const userPlan = req.user.plan || "free";

    if (
      hierarchy.indexOf(userPlan) <
      hierarchy.indexOf(requiredPlan)
    ) {
      throw new AppError("Plano insuficiente", 403);
    }

    next();
  };
}
