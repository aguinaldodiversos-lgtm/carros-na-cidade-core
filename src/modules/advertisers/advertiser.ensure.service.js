import { pool, withTransaction } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";

/** Ordem de preferência para ler telefone/WhatsApp em `users` (schema varia por deploy). */
const USER_CONTACT_COLUMN_PRIORITY = [
  "whatsapp",
  "phone",
  "mobile_phone",
  "telephone",
  "telefone",
  "contact_phone",
  "celular",
];

/** Onde gravar o mesmo contato em `advertisers` (só colunas que existirem). */
const ADVERTISER_CONTACT_COLUMN_PRIORITY = [
  "whatsapp",
  "phone",
  "mobile_phone",
  "telephone",
  "telefone",
];

let advertisersColumnsPromise = null;
let usersColumnsPromise = null;

async function getAdvertisersColumnSet() {
  if (!advertisersColumnsPromise) {
    advertisersColumnsPromise = pool
      .query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'advertisers'
        `
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        advertisersColumnsPromise = null;
        throw error;
      });
  }

  return advertisersColumnsPromise;
}

async function getUsersColumnSet() {
  if (!usersColumnsPromise) {
    usersColumnsPromise = pool
      .query(
        `
          SELECT column_name
          FROM information_schema.columns
          WHERE table_schema = current_schema()
            AND table_name = 'users'
        `
      )
      .then((result) => new Set(result.rows.map((row) => row.column_name)))
      .catch((error) => {
        usersColumnsPromise = null;
        throw error;
      });
  }

  return usersColumnsPromise;
}

function hasColumn(columns, name) {
  return columns.has(name);
}

function pickContactFromUserRow(row, usersCols) {
  for (const col of USER_CONTACT_COLUMN_PRIORITY) {
    if (!usersCols.has(col)) continue;
    const v = row[col];
    if (v != null && String(v).trim()) {
      return String(v).trim();
    }
  }
  return null;
}

function buildContactFieldsForAdvertiser(contact, advertiserCols) {
  if (!contact) {
    return {};
  }
  const out = {};
  for (const col of ADVERTISER_CONTACT_COLUMN_PRIORITY) {
    if (advertiserCols.has(col)) {
      out[col] = contact;
    }
  }
  return out;
}

function normalizeDocType(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  return t === "cnpj" || t === "cpf" ? t : null;
}

function buildSelectUserForAdvertiserSql(usersCols) {
  const parts = [];

  parts.push("id");

  if (usersCols.has("name")) {
    parts.push(`COALESCE(NULLIF(TRIM(name), ''), '') AS name`);
  } else {
    parts.push(`''::text AS name`);
  }

  if (usersCols.has("email")) {
    parts.push("email");
  } else {
    parts.push(`NULL::text AS email`);
  }

  if (usersCols.has("document_type")) {
    parts.push("document_type");
  } else {
    parts.push(`'cpf'::text AS document_type`);
  }

  if (usersCols.has("document_verified")) {
    parts.push("COALESCE(document_verified, false) AS document_verified");
  } else {
    parts.push("false AS document_verified");
  }

  if (usersCols.has("plan")) {
    parts.push(`COALESCE(plan, 'free') AS plan`);
  } else {
    parts.push(`'free' AS plan`);
  }

  for (const col of USER_CONTACT_COLUMN_PRIORITY) {
    if (usersCols.has(col)) {
      parts.push(col);
    }
  }

  return `SELECT ${parts.join(",\n        ")}
      FROM users`;
}

/**
 * Garante um registro em `advertisers` para o usuário, quando apto a publicar.
 * Usa lock consultivo por usuário para evitar duplicidade sob concorrência.
 *
 * @param {string} userId
 * @param {{ cityId: number }} context — city_id do anúncio (obrigatório para novo cadastro)
 * @returns {Promise<{ id: string|number, user_id?: string }>}
 */
export async function ensureAdvertiserForPublishing(userId, context = {}) {
  const cityId = context.cityId;
  if (cityId == null || Number.isNaN(Number(cityId))) {
    throw new AppError(
      "Não foi possível criar o cadastro de anunciante: cidade inválida.",
      400
    );
  }

  const [advertiserCols, usersCols] = await Promise.all([
    getAdvertisersColumnSet(),
    getUsersColumnSet(),
  ]);

  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1::text))`, [
      String(userId),
    ]);

    const existing = await client.query(
      `SELECT id, user_id FROM advertisers WHERE user_id = $1 LIMIT 1`,
      [userId]
    );

    if (existing.rows[0]?.id) {
      return existing.rows[0];
    }

    const userSql = `${buildSelectUserForAdvertiserSql(usersCols)}
      WHERE id = $1
      LIMIT 1`;

    const userResult = await client.query(userSql, [userId]);

    const user = userResult.rows[0];
    if (!user) {
      throw new AppError("Usuário não encontrado.", 404);
    }

    if (!user.document_verified) {
      throw new AppError(
        "Para publicar, verifique seu documento (CPF ou CNPJ) no perfil.",
        400
      );
    }

    const docType = normalizeDocType(user.document_type);
    if (!docType) {
      throw new AppError(
        "Complete o tipo de documento (CPF ou CNPJ) no perfil antes de publicar.",
        400
      );
    }

    const displayName = user.name?.trim() || "Anunciante";
    const baseSlug = (
      slugify(`${displayName}-${userId}`) || `anunciante-${userId}`
    ).slice(0, 120);

    const contact = pickContactFromUserRow(user, usersCols);
    const contactFields = buildContactFieldsForAdvertiser(contact, advertiserCols);

    const row = {
      user_id: userId,
      city_id: Number(cityId),
      name: displayName,
      company_name: docType === "cnpj" ? displayName : "",
      email: String(user.email || "")
        .trim()
        .toLowerCase() || null,
      plan: user.plan || "free",
      status: "active",
      verified: false,
      ...contactFields,
    };

    const fieldNames = [];
    const values = [];

    for (const [key, value] of Object.entries(row)) {
      if (!hasColumn(advertiserCols, key)) {
        continue;
      }
      if (key === "email" && !value) {
        continue;
      }
      fieldNames.push(key);
      values.push(value);
    }

    if (!hasColumn(advertiserCols, "slug")) {
      throw new AppError(
        "Schema de anunciantes incompatível (coluna slug ausente).",
        500
      );
    }

    const maxAttempts = 8;
    const slug = baseSlug;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptSlug =
        attempt === 0 ? slug : `${baseSlug}-${Date.now()}-${attempt}`.slice(0, 120);
      const insertFields = [...fieldNames, "slug"];
      const insertValues = [...values, attemptSlug];
      const placeholders = insertFields.map((_, i) => `$${i + 1}`).join(", ");

      try {
        const insert = await client.query(
          `
          INSERT INTO advertisers (${insertFields.join(", ")})
          VALUES (${placeholders})
          RETURNING id, user_id
          `,
          insertValues
        );

        return insert.rows[0];
      } catch (error) {
        if (error?.code === "23505" && attempt < maxAttempts - 1) {
          continue;
        }
        throw error;
      }
    }

    throw new AppError("Não foi possível criar o cadastro de anunciante.", 500);
  });
}
