import crypto from "crypto";
import { getLogger } from "../logger.js";

function generateRequestId() {
  if (typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function normalizeRequestId(value) {
  if (!value) return null;

  const requestId = Array.isArray(value) ? value[0] : value;

  if (typeof requestId !== "string") {
    return null;
  }

  const normalized = requestId.trim();

  if (!normalized) {
    return null;
  }

  /**
   * Evita aceitar headers absurdamente grandes ou malformados.
   * Mantém flexível para IDs vindos de proxies/gateways externos.
   */
  if (normalized.length > 128) {
    return null;
  }

  return normalized;
}

export function requestIdMiddleware(req, res, next) {
  const incomingRequestId = normalizeRequestId(req.headers["x-request-id"]);
  const requestId = incomingRequestId || generateRequestId();

  req.requestId = requestId;
  req.log = getLogger(req);

  res.setHeader("X-Request-Id", requestId);

  next();
}
