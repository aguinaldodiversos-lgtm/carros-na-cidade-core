import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

// Identidade cadastral não é editável neste fluxo: somente os contatos do PF.
function digits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

function normalizePhone(value, field) {
  let number = digits(value);
  if (!number) return null;
  if ((number.length === 12 || number.length === 13) && number.startsWith("55")) {
    number = number.slice(2);
  }
  if (
    ![10, 11].includes(number.length) ||
    Number(number.slice(0, 2)) < 11 ||
    Number(number.slice(0, 2)) > 99 ||
    (number.length === 11 && number[2] !== "9")
  ) {
    throw new AppError(`${field} inválido. Informe DDD e número.`, 400);
  }
  return number;
}

export async function getPersonalProfile(userId) {
  const { rows } = await pool.query(
    `SELECT name, email, document_type, document_number, document_verified,
            phone, whatsapp, address, city
       FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = rows[0];
  if (!user) throw new AppError("Conta não encontrada.", 404);
  if (String(user.document_type ?? "").trim().toLowerCase() === "cnpj") {
    throw new AppError("Esta página é exclusiva de pessoa física.", 403);
  }
  return {
    name: user.name || "",
    email: user.email || "",
    document: {
      type: String(user.document_type ?? "").toLowerCase() === "cpf" ? "CPF" : null,
      number: user.document_number || "",
      verified: Boolean(user.document_verified),
    },
    phone: user.phone || "",
    whatsapp: user.whatsapp || "",
    address: user.address || "",
    city: user.city || "",
  };
}

export async function updatePersonalProfile(userId, input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new AppError("Dados de contato inválidos.", 400);
  }
  const allowed = new Set(["phone", "whatsapp", "address"]);
  if (
    Object.keys(input).some((key) => !allowed.has(key)) ||
    [...allowed].some((key) => typeof input[key] !== "string")
  ) {
    throw new AppError("Somente telefone, WhatsApp e endereço podem ser alterados.", 400);
  }

  const phone = normalizePhone(input.phone, "Telefone");
  const whatsapp = normalizePhone(input.whatsapp, "WhatsApp");
  const address = input.address.trim();
  if (address.length > 300) throw new AppError("Endereço muito longo.", 400);

  const updated = await pool.query(
    `UPDATE users
        SET phone = $1, whatsapp = $2, address = $3, updated_at = NOW()
      WHERE id = $4
        AND (document_type IS NULL OR LOWER(TRIM(document_type)) <> 'cnpj')
      RETURNING id`,
    [phone, whatsapp, address || null, userId]
  );
  if (!updated.rowCount) throw new AppError("Conta não encontrada ou acesso negado.", 403);
  return getPersonalProfile(userId);
}
