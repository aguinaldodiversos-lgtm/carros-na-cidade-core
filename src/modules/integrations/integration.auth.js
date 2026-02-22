import crypto from "crypto";
import { AppError } from "../../shared/middlewares/error.middleware.js";

export function verifyHmac(req, res, next) {
  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  if (!signature || !timestamp)
    throw new AppError("Assinatura ausente", 401);

  const secret = process.env.CRM_HMAC_SECRET;

  const payload = JSON.stringify(req.body) + timestamp;

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  if (signature !== expected)
    throw new AppError("Assinatura inválida", 401);

  next();
}
