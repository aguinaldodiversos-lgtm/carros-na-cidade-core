// src/modules/auth/auth.session.service.js

import { pool } from "../../infrastructure/database/db.js";
import {
  generateAccessToken,
  generateRefreshToken,
} from "./jwt.strategy.js";

const REFRESH_TOKEN_DAYS = 7;
const MAX_ACTIVE_SESSIONS = 5;

function addDays(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

export async function createSession(user) {
  const payload = {
    id: user.id,
    email: user.email,
    role: user.role || "user",
    plan: user.plan || "free",
  };

  const accessToken = generateAccessToken(payload);
  const refreshToken = generateRefreshToken(payload);

  await enforceSessionLimit(user.id);

  await pool.query(
    `
    INSERT INTO refresh_tokens (user_id, token, expires_at)
    VALUES ($1,$2,$3)
    `,
    [user.id, refreshToken, addDays(REFRESH_TOKEN_DAYS)]
  );

  return { accessToken, refreshToken };
}

async function enforceSessionLimit(userId) {
  const activeSessions = await pool.query(
    `
    SELECT COUNT(*) 
    FROM refresh_tokens
    WHERE user_id = $1
      AND revoked = false
    `,
    [userId]
  );

  if (Number(activeSessions.rows[0].count) >= MAX_ACTIVE_SESSIONS) {
    await pool.query(
      `
      DELETE FROM refresh_tokens
      WHERE user_id = $1
      AND id IN (
        SELECT id FROM refresh_tokens
        WHERE user_id = $1
        ORDER BY created_at ASC
        LIMIT 1
      )
      `,
      [userId]
    );
  }
}
