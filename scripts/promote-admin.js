#!/usr/bin/env node

/**
 * Promote an existing user to admin role.
 *
 * Usage:
 *   node scripts/promote-admin.js --email admin@carrosnacidade.com
 *   node scripts/promote-admin.js --user-id 42
 *   ADMIN_SEED_EMAIL=admin@carrosnacidade.com node scripts/promote-admin.js
 *
 * Environment:
 *   DATABASE_URL — required (connection string)
 *   ADMIN_SEED_EMAIL — fallback if no --email flag
 *
 * This script is IDEMPOTENT: running it multiple times has no side effect
 * if the user is already an admin.
 *
 * It does NOT create users. The target must already exist in the users table.
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

function parseArgs() {
  const args = process.argv.slice(2);
  let email = null;
  let userId = null;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) {
      email = args[++i].trim().toLowerCase();
    }
    if (args[i] === "--user-id" && args[i + 1]) {
      userId = args[++i].trim();
    }
  }

  if (!email && !userId) {
    email = (process.env.ADMIN_SEED_EMAIL || "").trim().toLowerCase() || null;
  }

  return { email, userId };
}

async function main() {
  const { email, userId } = parseArgs();

  if (!email && !userId) {
    console.error(
      "Usage:\n" +
      "  node scripts/promote-admin.js --email admin@example.com\n" +
      "  node scripts/promote-admin.js --user-id 42\n" +
      "  ADMIN_SEED_EMAIL=admin@example.com node scripts/promote-admin.js"
    );
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is required.");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes("localhost")
      ? false
      : { rejectUnauthorized: false },
  });

  try {
    const where = email ? "email = $1" : "id = $1";
    const param = email || userId;

    const check = await pool.query(
      `SELECT id, email, role FROM users WHERE ${where} LIMIT 1`,
      [param]
    );

    if (!check.rows[0]) {
      console.error(`User not found: ${email || userId}`);
      process.exit(1);
    }

    const user = check.rows[0];

    if (user.role === "admin") {
      console.log(`User ${user.email} (id=${user.id}) is already admin. No changes needed.`);
      process.exit(0);
    }

    await pool.query(
      `UPDATE users SET role = 'admin' WHERE id = $1`,
      [user.id]
    );

    console.log(`SUCCESS: User ${user.email} (id=${user.id}) promoted to admin.`);
    console.log("They can now access /api/admin/* endpoints with their existing credentials.");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
