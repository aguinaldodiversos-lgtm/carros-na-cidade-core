// src/modules/auth/auth.service.js
import bcrypt from "bcryptjs";
import { pool } from "../../infrastructure/database/db.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";

import { logLoginAttempt } from "./auth.audit.service.js";
import {
  validateUserForLogin,
  handleFailedLogin,
  resetLoginAttempts,
} from "./auth.security.service.js";

import { issueSession } from "./sessions/session.issuer.js";
import {
  rotateRefreshToken,
  revokeRefreshToken,
  revokeAllUserRefreshTokens,
} from "./sessions/refreshToken.repository.js";

const BCRYPT_ROUNDS = Number(process.env.BCRYPT_SALT_ROUNDS || 10);

let cachedUsersColumns = null;

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value) {
  return normalizeString(value).toLowerCase();
}

function onlyDigits(value) {
  return normalizeString(value).replace(/\D/g, "");
}

function normalizeDocumentType(value) {
  const normalized = normalizeString(value).toLowerCase();
  return normalized === "cpf" || normalized === "cnpj" ? normalized : null;
}

function sanitizeUser(user) {
  if (!user || typeof user !== "object") return user;

  const sanitized = { ...user };
  delete sanitized.password;
  delete sanitized.password_hash;
  delete sanitized.refresh_token;
  delete sanitized.refreshToken;

  return sanitized;
}

async function getUsersTableColumns() {
  if (cachedUsersColumns) return cachedUsersColumns;

  const result = await pool.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
    `
  );

  cachedUsersColumns = new Set(result.rows.map((row) => row.column_name));
  return cachedUsersColumns;
}

function hasColumn(columns, name) {
  return columns.has(name);
}

function resolvePasswordColumn(columns) {
  if (hasColumn(columns, "password_hash")) return "password_hash";
  if (hasColumn(columns, "password")) return "password";
  throw new AppError(
    'Tabela "users" não possui coluna de senha compatível (password_hash ou password).',
    500
  );
}

function appendInsertField(columns, values, placeholders, fieldName, value) {
  columns.push(fieldName);
  values.push(value);
  placeholders.push(`$${values.length}`);
}

export async function hashPassword(password) {
  const normalizedPassword = normalizeString(password);

  if (!normalizedPassword) {
    throw new AppError("Senha é obrigatória.", 400);
  }

  if (normalizedPassword.length < 6) {
    throw new AppError("Senha deve ter no mínimo 6 caracteres.", 400);
  }

  return bcrypt.hash(normalizedPassword, BCRYPT_ROUNDS);
}

export async function verifyPassword(password, passwordHash) {
  const normalizedPassword = normalizeString(password);

  if (!normalizedPassword || !passwordHash) {
    return false;
  }

  return bcrypt.compare(normalizedPassword, passwordHash);
}

/* =====================================================
   REGISTER
===================================================== */
export async function register(
  { name, email, password, phone, city, document_type, document_number },
  reqMeta = {}
) {
  const usersColumns = await getUsersTableColumns();

  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizeString(password);
  const normalizedName = normalizeString(name) || null;
  const normalizedPhone = onlyDigits(phone).slice(0, 11) || null;
  const normalizedCity = normalizeString(city) || null;
  const normalizedDocumentType = normalizeDocumentType(document_type);
  const normalizedDocumentNumber = onlyDigits(document_number) || null;

  if (!normalizedEmail) {
    throw new AppError("Email é obrigatório.", 400);
  }

  if (!normalizedPassword) {
    throw new AppError("Senha é obrigatória.", 400);
  }

  if (normalizedPassword.length < 6) {
    throw new AppError("Senha deve ter no mínimo 6 caracteres.", 400);
  }

  const existing = await pool.query(
    "SELECT id FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalizedEmail]
  );

  if (existing.rows?.length) {
    throw new AppError("Email já cadastrado.", 400);
  }

  const passwordColumn = resolvePasswordColumn(usersColumns);
  const passwordHash = await hashPassword(normalizedPassword);

  const insertColumns = [];
  const insertValues = [];
  const insertPlaceholders = [];

  if (hasColumn(usersColumns, "name")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "name",
      normalizedName
    );
  }

  if (hasColumn(usersColumns, "email")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "email",
      normalizedEmail
    );
  } else {
    throw new AppError('Tabela "users" sem coluna obrigatória "email".', 500);
  }

  appendInsertField(
    insertColumns,
    insertValues,
    insertPlaceholders,
    passwordColumn,
    passwordHash
  );

  if (hasColumn(usersColumns, "email_verified")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "email_verified",
      true
    );
  }

  if (normalizedPhone && hasColumn(usersColumns, "phone")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "phone",
      normalizedPhone
    );
  }

  if (normalizedCity && hasColumn(usersColumns, "city")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "city",
      normalizedCity
    );
  }

  if (normalizedDocumentType && hasColumn(usersColumns, "document_type")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "document_type",
      normalizedDocumentType
    );
  }

  if (normalizedDocumentNumber && hasColumn(usersColumns, "document_number")) {
    appendInsertField(
      insertColumns,
      insertValues,
      insertPlaceholders,
      "document_number",
      normalizedDocumentNumber
    );
  }

  try {
    const result = await pool.query(
      `
        INSERT INTO users (${insertColumns.join(", ")})
        VALUES (${insertPlaceholders.join(", ")})
        RETURNING *
      `,
      insertValues
    );

    const createdUser = result.rows?.[0];

    if (!createdUser) {
      throw new AppError("Erro ao criar usuário.", 500);
    }

    return issueSession(sanitizeUser(createdUser), reqMeta);
  } catch (error) {
    if (error?.code === "23505") {
      throw new AppError("Email já cadastrado.", 400);
    }

    throw error;
  }
}

/* =====================================================
   LOGIN
===================================================== */
export async function login(email, password, reqMeta = {}) {
  const normalizedEmail = normalizeEmail(email);
  const normalizedPassword = normalizeString(password);

  if (!normalizedEmail || !normalizedPassword) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const usersColumns = await getUsersTableColumns();
  const passwordColumn = resolvePasswordColumn(usersColumns);

  const result = await pool.query(
    "SELECT * FROM users WHERE LOWER(email) = $1 LIMIT 1",
    [normalizedEmail]
  );

  const user = result.rows?.[0];

  await validateUserForLogin(user);

  const storedPasswordHash = user?.[passwordColumn];
  const passwordValid = await verifyPassword(
    normalizedPassword,
    storedPasswordHash
  );

  if (!passwordValid) {
    await handleFailedLogin(user);

    await logLoginAttempt({
      userId: user?.id,
      ip: reqMeta.ip,
      userAgent: reqMeta.userAgent,
      success: false,
    });

    throw new AppError("Credenciais inválidas", 401);
  }

  await resetLoginAttempts(user.id);

  await logLoginAttempt({
    userId: user.id,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    success: true,
  });

  return issueSession(sanitizeUser(user), reqMeta);
}

/* =====================================================
   REFRESH (ROTATION)
===================================================== */
export async function refresh(oldRefreshToken, reqMeta = {}) {
  if (!oldRefreshToken) {
    throw new AppError("Refresh token não fornecido", 401);
  }

  try {
    return await rotateRefreshToken(oldRefreshToken, reqMeta);
  } catch (err) {
    if (err?.code === "REFRESH_REUSE") {
      await revokeAllUserRefreshTokens(err.userId);
      throw new AppError("Sessão comprometida. Faça login novamente.", 401);
    }

    throw err;
  }
}

/* =====================================================
   LOGOUT
===================================================== */
export async function logout(refreshToken) {
  if (!refreshToken) {
    return { message: "Logout realizado com sucesso" };
  }

  await revokeRefreshToken(refreshToken);
  return { message: "Logout realizado com sucesso" };
}

export async function logoutAll(userId) {
  if (!userId) {
    throw new AppError("userId obrigatório", 400);
  }

  await revokeAllUserRefreshTokens(userId);
  return { message: "Todas as sessões foram encerradas" };
}

export default {
  register,
  login,
  refresh,
  logout,
  logoutAll,
  hashPassword,
  verifyPassword,
};
