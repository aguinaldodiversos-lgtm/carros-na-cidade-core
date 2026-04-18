import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

function normalizeAccountType(input) {
  if (input == null || String(input).trim() === "") {
    return "pending";
  }
  const raw = String(input).trim().toLowerCase();
  return raw === "cnpj" ? "CNPJ" : "CPF";
}

/**
 * Carrega conta para painel / pagamentos / ensure de advertiser.
 * Isolado de `account.service.js` para evitar dependência circular com `advertiser.ensure.service.js`.
 */
export async function getAccountUser(userId) {
  const result = await pool.query(
    `
    SELECT
      id,
      name,
      email,
      document_type,
      COALESCE(document_verified, false) AS document_verified,
      COALESCE(plan, 'free') AS plan
    FROM users
    WHERE id = $1
    LIMIT 1
    `,
    [userId]
  );

  const row = result.rows[0];
  if (!row) {
    throw new AppError("Usuario nao encontrado", 404);
  }

  const type = normalizeAccountType(row.document_type);

  return {
    id: String(row.id),
    name: row.name?.trim() || "Usuario",
    email: row.email?.trim() || "",
    type,
    cnpj_verified: type === "CNPJ" ? Boolean(row.document_verified) : false,
    document_verified: Boolean(row.document_verified),
    raw_plan: row.plan || "free",
  };
}
