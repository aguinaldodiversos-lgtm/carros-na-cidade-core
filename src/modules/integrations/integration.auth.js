import crypto from "crypto";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

const MAX_TIMESTAMP_DIFF = 5 * 60 * 1000; // 5 minutos

export async function verifyHmac(req, res, next) {
  const publicKey = req.headers["x-api-key"];
  const signature = req.headers["x-signature"];
  const timestamp = req.headers["x-timestamp"];

  if (!publicKey || !signature || !timestamp) {
    throw new AppError("Headers de autenticação ausentes", 401);
  }

  const now = Date.now();
  const requestTime = parseInt(timestamp);

  if (Math.abs(now - requestTime) > MAX_TIMESTAMP_DIFF) {
    throw new AppError("Timestamp inválido", 401);
  }

  const clientResult = await pool.query(
    `SELECT * FROM api_clients WHERE public_key = $1 AND active = true`,
    [publicKey]
  );

  const client = clientResult.rows[0];

  if (!client) {
    throw new AppError("Cliente API inválido", 401);
  }

  const payload = JSON.stringify(req.body) + timestamp;

  const expectedSignature = crypto
    .createHmac("sha256", client.secret_key)
    .update(payload)
    .digest("hex");

  if (signature !== expectedSignature) {
    throw new AppError("Assinatura inválida", 401);
  }

  req.apiClient = client;

  next();
}
