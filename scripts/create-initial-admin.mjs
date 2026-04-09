#!/usr/bin/env node

/**
 * Bootstrap: create or promote exactly ONE initial admin.
 *
 * Usage:
 *   node scripts/create-initial-admin.mjs --email admin@dominio.com --password "SENHA_FORTE"
 *   node scripts/create-initial-admin.mjs --email admin@dominio.com --password "SENHA_FORTE" --name "Admin CNC"
 *
 * Or via env (CI-friendly):
 *   ADMIN_SEED_EMAIL=admin@dominio.com ADMIN_SEED_PASSWORD=senhaforte node scripts/create-initial-admin.mjs
 *
 * Behavior:
 *   1. If any user with role='admin' already exists → abort (no changes).
 *   2. If a regular user with the given email exists → promote to admin (no password change
 *      unless --force-password is passed).
 *   3. If no user with that email exists → create a new user with role='admin'.
 *
 * Safety:
 *   - Never logs the password in plaintext.
 *   - Uses the same bcryptjs hash as the existing auth system.
 *   - Idempotent: safe to run multiple times.
 *   - Creates at most 1 admin via this mechanism.
 *
 * Requirements:
 *   - DATABASE_URL env var must be set.
 *   - bcryptjs must be installed (already a project dependency).
 */

import "dotenv/config";
import pg from "pg";
import bcrypt from "bcryptjs";

const { Pool } = pg;

// ── Helpers ──────────────────────────────────────────

function die(msg, code = 1) {
  console.error(`[create-initial-admin] ERRO: ${msg}`);
  process.exit(code);
}

function info(msg) {
  console.log(`[create-initial-admin] ${msg}`);
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── Parse CLI args + env fallback ────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  let email = null;
  let password = null;
  let name = null;
  let forcePassword = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--email" && args[i + 1]) email = args[++i].trim().toLowerCase();
    else if (arg === "--password" && args[i + 1]) password = args[++i];
    else if (arg === "--name" && args[i + 1]) name = args[++i].trim();
    else if (arg === "--force-password") forcePassword = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage:\n" +
        "  node scripts/create-initial-admin.mjs --email EMAIL --password PASSWORD [--name NAME] [--force-password]\n\n" +
        "Or via env:\n" +
        "  ADMIN_SEED_EMAIL=... ADMIN_SEED_PASSWORD=... node scripts/create-initial-admin.mjs\n\n" +
        "Flags:\n" +
        "  --force-password   Also update password when promoting an existing user\n"
      );
      process.exit(0);
    }
  }

  if (!email) email = (process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase() || null;
  if (!password) password = process.env.ADMIN_SEED_PASSWORD || null;
  if (!name) name = (process.env.ADMIN_SEED_NAME || "").trim() || null;

  return { email, password, name, forcePassword };
}

// ── Main ─────────────────────────────────────────────

async function main() {
  const { email, password, name, forcePassword } = parseArgs();

  if (!email) die("Email é obrigatório. Use --email ou ADMIN_SEED_EMAIL.");
  if (!isValidEmail(email)) die(`Email inválido: ${email}`);
  if (!password) die("Senha é obrigatória. Use --password ou ADMIN_SEED_PASSWORD.");
  if (password.length < 8) die("Senha deve ter no mínimo 8 caracteres.");

  if (!process.env.DATABASE_URL) die("DATABASE_URL é obrigatória.");

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost") || process.env.DATABASE_URL.includes("127.0.0.1")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    // 1. Check if any admin already exists
    const adminCheck = await pool.query(
      "SELECT id, email FROM users WHERE role = 'admin' LIMIT 1"
    );

    if (adminCheck.rows.length > 0) {
      const existing = adminCheck.rows[0];
      info(`Já existe um admin no sistema: ${existing.email} (id=${existing.id}).`);
      info("Nenhuma alteração realizada. Para mais admins, use promote-admin.js.");
      process.exit(0);
    }

    // 2. Hash password (same bcrypt config as auth.service.js)
    const parsedRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 10);
    const rounds = Number.isInteger(parsedRounds) && parsedRounds >= 4 && parsedRounds <= 15 ? parsedRounds : 10;
    const passwordHash = await bcrypt.hash(password.trim(), rounds);

    // 3. Check if user with this email already exists
    const userCheck = await pool.query(
      "SELECT id, email, role FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1",
      [email]
    );

    if (userCheck.rows.length > 0) {
      const user = userCheck.rows[0];

      if (user.role === "admin") {
        info(`Usuário ${user.email} (id=${user.id}) já é admin. Nenhuma alteração.`);
        process.exit(0);
      }

      // Promote existing user
      if (forcePassword) {
        const pwCol = await resolvePasswordColumn(pool);
        await pool.query(
          `UPDATE users SET role = 'admin', ${pwCol} = $2, updated_at = NOW() WHERE id = $1`,
          [user.id, passwordHash]
        );
        info(`Usuário existente ${user.email} (id=${user.id}) promovido a admin com senha atualizada.`);
      } else {
        await pool.query(
          "UPDATE users SET role = 'admin', updated_at = NOW() WHERE id = $1",
          [user.id]
        );
        info(`Usuário existente ${user.email} (id=${user.id}) promovido a admin (senha mantida).`);
        info("Use --force-password para também redefinir a senha.");
      }

      process.exit(0);
    }

    // 4. Create new admin user
    const pwCol = await resolvePasswordColumn(pool);
    const adminName = name || "Admin";

    const result = await pool.query(
      `INSERT INTO users (name, email, ${pwCol}, role, email_verified, created_at, updated_at)
       VALUES ($1, $2, $3, 'admin', true, NOW(), NOW())
       RETURNING id, email, role`,
      [adminName, email, passwordHash]
    );

    const created = result.rows[0];
    info(`Admin criado com sucesso: ${created.email} (id=${created.id}, role=${created.role}).`);
    info("Faça login em /login com essas credenciais e acesse /admin.");
  } finally {
    await pool.end();
  }
}

// ── Resolve password column name ─────────────────────

async function resolvePasswordColumn(pool) {
  const result = await pool.query(`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name = 'users'
      AND column_name IN ('password_hash', 'password')
    ORDER BY CASE WHEN column_name = 'password_hash' THEN 0 ELSE 1 END
    LIMIT 1
  `);

  if (!result.rows.length) {
    die('Tabela "users" não possui coluna de senha compatível (password_hash ou password).');
  }

  return result.rows[0].column_name;
}

// ── Run ──────────────────────────────────────────────

main().catch((err) => {
  console.error("[create-initial-admin] FALHA:", err.message);
  process.exit(1);
});
