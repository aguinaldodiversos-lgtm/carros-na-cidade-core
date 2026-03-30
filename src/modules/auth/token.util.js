import jwt from "jsonwebtoken";
import crypto from "crypto";

export function generateAccessToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      email: user.email,
      type: "access",
    },
    process.env.JWT_SECRET,
    { expiresIn: "15m" }
  );
}

export function generateRefreshToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      type: "refresh",
    },
    process.env.JWT_REFRESH_SECRET,
    { expiresIn: "7d" }
  );
}

export function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}
