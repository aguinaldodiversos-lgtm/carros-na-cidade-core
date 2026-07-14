import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

/**
 * "Dados da loja" — leitura/edição do cadastro do lojista (tabela `advertisers`),
 * escopado SEMPRE ao usuário autenticado (`userId` do JWT; nunca um id do cliente).
 *
 * Decisões (aprovadas 2026-07-13):
 *  - Edita `advertisers` (name, email, whatsapp, address).
 *  - Documento (`users.document_number` + `document_type`) é READ-ONLY.
 *  - Escopo a quem JÁ tem linha em `advertisers` — SEM upsert. Sem linha → 404.
 *  - `advertisers.email` (contato da loja), não o e-mail de login (`users.email`).
 *  - `advertisers.name` (o que o comprador vê), não `company_name`.
 *
 * O WhatsApp é o campo mais crítico: `COALESCE(whatsapp, mobile_phone, phone)` é o
 * número que o comprador vê e usa (mesma fonte do serializer público). Gravamos em
 * `advertisers.whatsapp`, que tem precedência nesse COALESCE.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function onlyDigits(value) {
  return String(value ?? "").replace(/\D/g, "");
}

/**
 * Normaliza um telefone brasileiro para dígitos SEM o código do país (10 = fixo,
 * 11 = celular). Aceita entrada com/sem `55`. Retorna `null` se implausível:
 * DDD fora de 11–99, tamanho != 10/11, ou celular (11 díg) sem o `9` na 3ª casa.
 */
function normalizeBrPhoneOrNull(input) {
  let digits = onlyDigits(input);
  if (!digits) return null;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2);
  }
  if (digits.length !== 10 && digits.length !== 11) return null;
  const ddd = Number(digits.slice(0, 2));
  if (ddd < 11 || ddd > 99) return null;
  if (digits.length === 11 && digits[2] !== "9") return null;
  return digits;
}

function normalizeDocType(value) {
  const upper = String(value ?? "")
    .trim()
    .toUpperCase();
  return upper === "CNPJ" ? "CNPJ" : upper === "CPF" ? "CPF" : null;
}

let advertisersColumnSetCache = null;
async function getAdvertisersColumnSet() {
  if (advertisersColumnSetCache) return advertisersColumnSetCache;
  const result = await pool.query(
    `SELECT column_name FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'advertisers'`
  );
  advertisersColumnSetCache = new Set(result.rows.map((row) => row.column_name));
  return advertisersColumnSetCache;
}

/**
 * Lê o cadastro da loja do usuário. Lança 404 se ele não tiver linha em
 * `advertisers` (nunca cria — decisão "sem upsert").
 */
export async function getStoreProfile(userId) {
  const advResult = await pool.query(
    `SELECT
       id,
       name,
       email,
       NULLIF(TRIM(whatsapp), '') AS whatsapp,
       COALESCE(
         NULLIF(TRIM(whatsapp), ''),
         NULLIF(TRIM(mobile_phone), ''),
         NULLIF(TRIM(phone), '')
       ) AS contact_number,
       address
     FROM advertisers
     WHERE user_id = $1
     LIMIT 1`,
    [userId]
  );

  if (advResult.rows.length === 0) {
    throw new AppError("Nenhuma loja encontrada para este usuário.", 404);
  }

  const adv = advResult.rows[0];

  const userResult = await pool.query(
    `SELECT document_type, document_number FROM users WHERE id = $1 LIMIT 1`,
    [userId]
  );
  const user = userResult.rows[0] || {};

  return {
    name: adv.name || "",
    email: adv.email || "",
    whatsapp: adv.whatsapp || "",
    address: adv.address || "",
    // O comprador consegue contato quando há QUALQUER número resolvido.
    has_contact_channel: Boolean(adv.contact_number),
    document: {
      type: normalizeDocType(user.document_type),
      number: user.document_number || "",
    },
  };
}

/**
 * Atualiza o cadastro da loja. Valida nome (obrigatório — coluna NOT NULL),
 * e-mail (formato, quando informado) e WhatsApp (formato BR, quando informado).
 * UPDATE tolerante a schema (só mexe em colunas que existem), escopado ao userId.
 */
export async function updateStoreProfile(userId, input) {
  const name = String(input?.name ?? "").trim();
  if (name.length < 2) {
    throw new AppError("Informe o nome da loja.", 400);
  }

  const email = String(input?.email ?? "")
    .trim()
    .toLowerCase();
  if (email && !EMAIL_RE.test(email)) {
    throw new AppError("E-mail inválido.", 400);
  }

  const whatsappRaw = String(input?.whatsapp ?? "").trim();
  let whatsapp = "";
  if (whatsappRaw) {
    const normalized = normalizeBrPhoneOrNull(whatsappRaw);
    if (!normalized) {
      throw new AppError("WhatsApp inválido. Use DDD + número (ex.: 11 91234-5678).", 400);
    }
    whatsapp = normalized;
  }

  const address = String(input?.address ?? "").trim();

  const columns = await getAdvertisersColumnSet();
  const assignments = [];
  const values = [];
  const setIfColumnExists = (column, value) => {
    if (!columns.has(column)) return;
    values.push(value);
    assignments.push(`${column} = $${values.length}`);
  };

  setIfColumnExists("name", name);
  setIfColumnExists("email", email || null);
  setIfColumnExists("whatsapp", whatsapp || null);
  setIfColumnExists("address", address || null);
  if (columns.has("updated_at")) {
    assignments.push("updated_at = NOW()");
  }

  if (assignments.length === 0) {
    throw new AppError('Tabela "advertisers" sem colunas editáveis.', 500);
  }

  values.push(userId);
  const result = await pool.query(
    `UPDATE advertisers SET ${assignments.join(", ")} WHERE user_id = $${values.length}`,
    values
  );

  if (result.rowCount === 0) {
    throw new AppError("Nenhuma loja encontrada para este usuário.", 404);
  }

  return getStoreProfile(userId);
}
