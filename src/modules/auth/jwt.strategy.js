// src/modules/auth/token/token.signer.js
import jwt from "jsonwebtoken";
import crypto from "crypto";
import { AppError } from "../../../shared/middlewares/error.middleware.js";

const ALGORITHM = "HS256";

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;

const JWT_ISSUER = process.env.JWT_ISSUER || "carros-na-cidade";
const JWT_AUDIENCE = process.env.JWT_AUDIENCE || "carros-na-cidade-users";

const parsedAccessTtl = Number(process.env.ACCESS_TOKEN_TTL_MIN || 15);
const parsedRefreshTtl = Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30);

const ACCESS_TTL_MIN =
  Number.isFinite(parsedAccessTtl) && parsedAccessTtl > 0 ? parsedAccessTtl : 15;

const REFRESH_TTL_DAYS =
  Number.isFinite(parsedRefreshTtl) && parsedRefreshTtl > 0 ? parsedRefreshTtl : 30;

function assertSecrets() {
  if (!JWT_SECRET) {
    throw new AppError("JWT_SECRET não definido no ambiente", 500);
  }

  if (!JWT_REFRESH_SECRET) {
    throw new AppError("JWT_REFRESH_SECRET não definido no ambiente", 500);
  }
}

function normalizeUserId(userId) {
  if (userId === undefined || userId === null || userId === "") {
    throw new AppError("Usuário inválido", 400);
  }

  return String(userId);
}

export function signAccessToken(user) {
  assertSecrets();

  const userId = normalizeUserId(user?.id);
  const email =
    typeof user?.email === "string" ? user.email.trim().toLowerCase() : "";

  return jwt.sign(
    {
      id: userId,
      email,
      type: "access",
    },
    JWT_SECRET,
    {
      algorithm: ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: `${ACCESS_TTL_MIN}m`,
    }
  );
}

export function signRefreshToken(payload) {
  assertSecrets();

  const userId = normalizeUserId(payload?.userId);
  const familyId =
    typeof payload?.familyId === "string" && payload.familyId.trim()
      ? payload.familyId.trim()
      : crypto.randomUUID();

  const jti =
    typeof payload?.jti === "string" && payload.jti.trim()
      ? payload.jti.trim()
      : crypto.randomUUID();

  return jwt.sign(
    {
      id: userId,
      userId,
      familyId,
      jti,
      type: "refresh",
    },
    JWT_REFRESH_SECRET,
    {
      algorithm: ALGORITHM,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      expiresIn: `${REFRESH_TTL_DAYS}d`,
    }
  );
}

export function verifyRefreshToken(refreshToken) {
  assertSecrets();

  try {
    const decoded = jwt.verify(refreshToken, JWT_REFRESH_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [ALGORITHM],
    });

    if (decoded?.type !== "refresh") {
      throw new Error("Token inválido");
    }

    return decoded;
  } catch {
    throw new AppError("Refresh token inválido", 401);
  }
}

export function newJti() {
  return crypto.randomUUID();
}
