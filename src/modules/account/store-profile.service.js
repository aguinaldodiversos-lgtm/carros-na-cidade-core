import crypto from "node:crypto";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { ensureAdvertiserForUser } from "../advertisers/advertiser.ensure.service.js";
import { isValidCnpj, normalizeCnpj } from "./cnpj-validation.js";

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

function validStoreImageUrl(value, userId, kind) {
  if (value === "") return true;
  if (typeof value !== "string" || value.length > 350) return false;
  try {
    const url = new URL(value, "https://carrosnacidade.com");
    const hash = crypto.createHash("sha256").update(String(userId)).digest("hex").slice(0, 20);
    const key = url.searchParams.get("key") || "";
    return (
      value.startsWith("/api/vehicle-images?") &&
      url.pathname === "/api/vehicle-images" &&
      url.searchParams.size === 1 &&
      new RegExp("^dealers/" + hash + "/" + kind + "/[a-f0-9-]{36}\\.webp$").test(key)
    );
  } catch {
    return false;
  }
}

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
       adv.id,
       adv.name,
       adv.email,
       NULLIF(TRIM(adv.whatsapp), '') AS whatsapp,
       COALESCE(
         NULLIF(TRIM(adv.whatsapp), ''),
         NULLIF(TRIM(adv.mobile_phone), ''),
         NULLIF(TRIM(adv.phone), '')
       ) AS contact_number,
       adv.address,
       adv.public_description,
       adv.public_cover_url,
       adv.public_logo_url,
       adv.city_id,
       adv.verified,
       cities.name AS city_name,
       cities.state AS city_state
     FROM advertisers adv
     LEFT JOIN cities ON cities.id = adv.city_id
     WHERE adv.user_id = $1
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
    description: adv.public_description || "",
    cover_url: adv.public_cover_url || "",
    logo_url: adv.public_logo_url || "",
    city: adv.city_id
      ? { id: Number(adv.city_id), name: adv.city_name || "", state: adv.city_state || "" }
      : null,
    verified: adv.verified === true,
    // O comprador consegue contato quando há QUALQUER número resolvido.
    has_contact_channel: Boolean(adv.contact_number),
    document: {
      type: normalizeDocType(user.document_type),
      number: user.document_number || "",
    },
  };
}

/**
 * Cadastro independente da publicação de anúncios. A cidade precisa vir do
 * catálogo (city_id explícito), e o ensure idempotente usa advisory lock
 * para evitar duplicidade entre cadastro e publicação simultâneos.
 * Apenas conta CNPJ. Conferência oficial/presencial continua manual.
 */
export async function createStoreProfile(userId, input) {
  const user = await pool.query(
    "SELECT document_type, document_number FROM users WHERE id = $1 LIMIT 1",
    [userId]
  );
  const account = user.rows[0];
  if (!account || normalizeDocType(account.document_type) !== "CNPJ") {
    throw new AppError("Cadastro de loja disponível somente para contas CNPJ.", 403);
  }
  if (!isValidCnpj(account.document_number)) {
    throw new AppError("CNPJ cadastrado inválido. Solicite a correção pelo suporte.", 422);
  }
  if (!Number.isSafeInteger(Number(input?.city_id)) || Number(input?.city_id) <= 0) {
    throw new AppError("Selecione a cidade da loja no catálogo.", 400);
  }
  if (
    String(input?.name ?? "").trim().length < 2 ||
    !EMAIL_RE.test(String(input?.email ?? "").trim()) ||
    !normalizeBrPhoneOrNull(input?.whatsapp) ||
    String(input?.address ?? "").trim().length < 10
  ) {
    throw new AppError("Informe nome, e-mail, WhatsApp e endereço completo da loja.", 400);
  }
  // A verificação de documento no cadastro já tenta impedir duplicatas,
  // mas o onboarding sem anúncio também deve se proteger de contas legadas.
  const duplicate = await pool.query(
    `SELECT id FROM users
       WHERE id::text <> $1::text
         AND LOWER(TRIM(document_type)) = 'cnpj'
         AND UPPER(REGEXP_REPLACE(COALESCE(document_number, ''), '[^A-Za-z0-9]', '', 'g')) = $2
       LIMIT 1`,
    [String(userId), normalizeCnpj(account.document_number)]
  );
  if (duplicate.rows.length) {
    throw new AppError("Este CNPJ já está associado a outra conta. Procure o suporte.", 409);
  }

  await ensureAdvertiserForUser(userId, {
    cityId: Number(input.city_id),
    source: "account.store.onboarding",
  });
  return updateStoreProfile(userId, input);
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

  if (input && Object.prototype.hasOwnProperty.call(input, "description")) {
    const description = String(input.description ?? "").trim();
    if (description.length > 600) throw new AppError("Descrição limitada a 600 caracteres.", 400);
    setIfColumnExists("public_description", description || null);
  }
  for (const [field, column, kind] of [
    ["cover_url", "public_cover_url", "cover"],
    ["logo_url", "public_logo_url", "logo"],
  ]) {
    if (input && Object.prototype.hasOwnProperty.call(input, field)) {
      const url = String(input[field] ?? "").trim();
      if (!validStoreImageUrl(url, userId, kind)) {
        throw new AppError("Imagem da loja inválida. Envie pelo formulário da loja.", 400);
      }
      setIfColumnExists(column, url || null);
    }
  }
  // Cadastro verificado perde o selo se razão/nome ou endereço for alterado.
  // Alterar apenas contato não desfaz a vistoria administrativa.
  if (columns.has("verified") && (columns.has("name") || columns.has("address"))) {
    values.push(name, address || null);
    const nameParam = "$" + (values.length - 1);
    const addressParam = "$" + values.length;
    assignments.push(
      `verified = CASE WHEN name IS DISTINCT FROM ${nameParam} OR address IS DISTINCT FROM ${addressParam} THEN FALSE ELSE verified END`
    );
  }
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
