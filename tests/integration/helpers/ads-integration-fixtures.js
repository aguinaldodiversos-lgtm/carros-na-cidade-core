/**
 * Fixtures para testes de integração do pipeline de anúncios (Postgres real).
 *
 * - `RUN_INTEGRATION_ADS_TESTS=1` (definido por `npm run test:integration:ads`) força a suíte
 *   mesmo com `SKIP_INTEGRATION_ADS=1` no `.env`.
 * - Caso contrário, a suíte roda quando `SKIP_INTEGRATION_ADS` não é `1`.
 *
 * URL: `TEST_DATABASE_URL` > `DATABASE_URL` > fallback local (ver `integration-db-bootstrap.js`).
 */
import bcrypt from "bcryptjs";

const PREFIX = "integration_ads_";

export function shouldRunAdsIntegrationTests() {
  if (String(process.env.RUN_INTEGRATION_ADS_TESTS || "").trim() === "1") {
    return true;
  }
  return String(process.env.SKIP_INTEGRATION_ADS || "").trim() !== "1";
}

/**
 * Falha o suite se o banco não responder — não mascara ambiente quebrado.
 */
export async function assertIntegrationDatabaseReady(pool) {
  try {
    const { rows } = await pool.query("SELECT 1 AS ok");
    if (rows?.[0]?.ok !== 1) {
      throw new Error("SELECT 1 não retornou ok");
    }
  } catch (err) {
    const hint =
      process.env.TEST_DATABASE_URL || process.env.DATABASE_URL
        ? "Verifique DATABASE_URL/TEST_DATABASE_URL e se o Postgres está acessível."
        : "Suba o Postgres (ex.: docker compose -f docker-compose.test.yml up -d) ou defina DATABASE_URL.";
    throw new Error(`[integration] Postgres inacessível. ${hint} Detalhe: ${err?.message || err}`);
  }
}

export async function getFirstCity(pool) {
  const { rows } = await pool.query(
    `
    SELECT id, name, state, slug
    FROM cities
    ORDER BY id ASC
    LIMIT 1
    `
  );
  return rows[0] || null;
}

/** Segunda cidade distinta (para asserts de city_id), ou null se só existir uma. */
export async function getSecondCityIfAny(pool, excludeId) {
  const { rows } = await pool.query(
    `
    SELECT id, name, state, slug
    FROM cities
    WHERE id <> $1
    ORDER BY id ASC
    LIMIT 1
    `,
    [excludeId]
  );
  return rows[0] || null;
}

/**
 * Cria usuário apto a publicar (CPF com documento verificado).
 * @param {string} tag — sufixo único por execução (ex.: `${runId}_a`)
 */
export async function createPublishableUser(pool, tag) {
  const email = `${PREFIX}${tag}@example.test`;
  const passwordHash = await bcrypt.hash("Integration1!", 10);

  const { rows } = await pool.query(
    `
    INSERT INTO users (
      email,
      password_hash,
      name,
      document_type,
      document_verified,
      plan,
      role,
      email_verified
    )
    VALUES ($1, $2, $3, 'cpf', true, 'free', 'user', true)
    RETURNING id, email
    `,
    [email, passwordHash, `Integration ${tag}`]
  );

  return { id: rows[0].id, email: rows[0].email };
}

/**
 * Remove anúncios e anunciantes/usuários criados no teste (por email).
 */
export async function cleanupIntegrationArtifacts(pool, { emails = [], adIds = [] }) {
  if (adIds.length) {
    await pool.query(`DELETE FROM ads WHERE id = ANY($1)`, [adIds]);
  }
  if (!emails.length) return;

  await pool
    .query(
      `
      DELETE FROM refresh_tokens
      WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))
      `,
      [emails]
    )
    .catch(() => {});

  await pool.query(
    `
    DELETE FROM advertisers
    WHERE user_id IN (SELECT id FROM users WHERE email = ANY($1))
    `,
    [emails]
  );
  await pool.query(`DELETE FROM users WHERE email = ANY($1)`, [emails]);
}
