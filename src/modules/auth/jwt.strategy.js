// src/modules/auth/jwt.strategy.js

import jwt from "jsonwebtoken";
import crypto from "crypto";

/* =====================================================
   CONFIGURAÇÕES
===================================================== */

const {
  JWT_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ISSUER = "carros-na-cidade",
  JWT_AUDIENCE = "carros-na-cidade-users",
} = process.env;

if (!JWT_SECRET) {
  throw new Error("JWT_SECRET não definido no .env");
}

if (!JWT_REFRESH_SECRET) {
  throw new Error("JWT_REFRESH_SECRET não definido no .env");
}

const ACCESS_EXPIRES = "15m";
const REFRESH_EXPIRES = "7d";
const ALGORITHM = "HS256";

/* =====================================================
   GERAR ACCESS TOKEN
===================================================== */

export function generateAccessToken(payload) {
  return jwt.sign(
    {
      ...payload,
      jti: crypto.randomUUID(), // anti replay
      type: "access",
    },
    JWT_SECRET,
    {
      expiresIn: ACCESS_EXPIRES,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: ALGORITHM,
    }
  );
}

/* =====================================================
   GERAR REFRESH TOKEN
===================================================== */

export function generateRefreshToken(payload) {
  return jwt.sign(
    {
      ...payload,
      jti: crypto.randomUUID(),
      type: "refresh",
    },
    JWT_REFRESH_SECRET,
    {
      expiresIn: REFRESH_EXPIRES,
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithm: ALGORITHM,
    }
  );
}

/* =====================================================
   VERIFY ACCESS TOKEN
===================================================== */

export function verifyAccessToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [ALGORITHM],
    });

    if (decoded.type !== "access") {
      throw new Error("Token inválido");
    }

    return decoded;
  } catch (err) {
    throw new Error("Access token inválido ou expirado");
  }
}

/* =====================================================
   VERIFY REFRESH TOKEN
===================================================== */

export function verifyRefreshToken(token) {
  try {
    const decoded = jwt.verify(token, JWT_REFRESH_SECRET, {
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
      algorithms: [ALGORITHM],
    });

    if (decoded.type !== "refresh") {
      throw new Error("Token inválido");
    }

    return decoded;
  } catch (err) {
    throw new Error("Refresh token inválido ou expirado");
  }
}
