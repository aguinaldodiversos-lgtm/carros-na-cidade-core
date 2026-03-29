import { pool, withTransaction } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { slugify } from "../../shared/utils/slugify.js";

let advertisersColumnsPromise = null;

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

function hasAdvertiserColumn(columns, name) {
  return columns.has(name);
}

function normalizeDocType(value) {
  const t = String(value || "")
    .trim()
    .toLowerCase();
  return t === "cnpj" || t === "cpf" ? t : null;
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

  const columns = await getAdvertisersColumnSet();

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

    const userResult = await client.query(
      `
      SELECT
        id,
        COALESCE(NULLIF(TRIM(name), ''), '') AS name,
        email,
        phone,
        document_type,
        COALESCE(document_verified, false) AS document_verified,
        COALESCE(plan, 'free') AS plan
      FROM users
      WHERE id = $1
      LIMIT 1
      `,
      [userId]
    );

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

    const row = {
      user_id: userId,
      city_id: Number(cityId),
      name: displayName,
      // PF: string vazia quando a coluna existir e for NOT NULL; lojista: nome fantasia mínimo
      company_name: docType === "cnpj" ? displayName : "",
      email: String(user.email || "")
        .trim()
        .toLowerCase() || null,
      plan: user.plan || "free",
      status: "active",
      verified: false,
      phone: user.phone ? String(user.phone).trim() : null,
      whatsapp: user.phone ? String(user.phone).trim() : null,
    };

    const fieldNames = [];
    const values = [];

    for (const [key, value] of Object.entries(row)) {
      if (!hasAdvertiserColumn(columns, key)) {
        continue;
      }
      if (key === "email" && !value) {
        continue;
      }
      fieldNames.push(key);
      values.push(value);
    }

    if (!hasAdvertiserColumn(columns, "slug")) {
      throw new AppError(
        "Schema de anunciantes incompatível (coluna slug ausente).",
        500
      );
    }

    const maxAttempts = 8;
    let slug = baseSlug;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      const attemptSlug = attempt === 0 ? slug : `${baseSlug}-${Date.now()}-${attempt}`.slice(0, 120);
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
