// src/shared/middlewares/requestId.middleware.js

import { v4 as uuidv4 } from "uuid";

export function requestIdMiddleware(req, res, next) {
  const requestId = req.headers["x-request-id"] || uuidv4();

  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  next();
}
