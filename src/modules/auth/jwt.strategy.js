import jwt from "jsonwebtoken";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  getJwtConfig,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "./token/token.signer.js";

const ALGORITHM = "HS256";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

export function generateAccessToken(payload) {
  return signAccessToken(payload);
}

export function generateRefreshToken(payload) {
  return signRefreshToken(payload);
}

export function verifyAccessToken(token) {
  const config = getJwtConfig();
  const normalizedToken = normalizeString(token);

  if (!normalizedToken) {
    throw new AppError("Access token inválido ou expirado", 401);
  }

  try {
    const decoded = jwt.verify(normalizedToken, config.jwtSecret, {
      issuer: config.issuer,
      audience: config.audience,
      algorithms: [ALGORITHM],
    });

    const tokenType = decoded?.type ?? decoded?.typ;
    if (tokenType !== "access") {
      throw new Error("Token inválido");
    }

    const userId = decoded?.id ?? decoded?.sub;
    if (!userId) {
      throw new Error("Token inválido");
    }

    return {
      ...decoded,
      id: String(userId),
    };
  } catch {
    throw new AppError("Access token inválido ou expirado", 401);
  }
}

export { verifyRefreshToken };
