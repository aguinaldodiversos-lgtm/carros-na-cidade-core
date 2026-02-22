// src/shared/middlewares/validate.middleware.js

import { AppError } from "./error.middleware.js";

export function validate(schema) {
  return (req, res, next) => {
    try {
      req.body = schema.parse(req.body);
      next();
    } catch (err) {
      throw new AppError("Dados inválidos", 400);
    }
  };
}
