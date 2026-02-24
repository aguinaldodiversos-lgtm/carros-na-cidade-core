/* =====================================================
   LOGIN (REFATORADO E ORGANIZADO)
===================================================== */

export async function login(email, password, reqMeta = {}) {
  if (!email || !password) {
    throw new AppError("Credenciais inválidas", 401);
  }

  const normalizedEmail = normalizeEmail(email);

  const user = await findUserByEmail(normalizedEmail);

  await validateUserForLogin(user);

  const passwordValid = await bcrypt.compare(password, user.password);

  if (!passwordValid) {
    await handleFailedLogin(user, reqMeta);
    throw new AppError("Credenciais inválidas", 401);
  }

  await handleSuccessfulLogin(user, reqMeta);

  const tokens = await createSessionTokens(user);

  return tokens;
}

/* =====================================================
   FUNÇÕES INTERNAS ORGANIZADAS
===================================================== */

async function findUserByEmail(email) {
  const result = await pool.query(
    "SELECT * FROM users WHERE email = $1",
    [email]
  );

  const user = result.rows[0];

  if (!user) {
    throw new AppError("Credenciais inválidas", 401);
  }

  return user;
}

async function validateUserForLogin(user) {
  if (!user.email_verified) {
    throw new AppError("E-mail ainda não verificado", 403);
  }

  if (user.locked_until && new Date(user.locked_until) > new Date()) {
    throw new AppError(
      "Conta temporariamente bloqueada. Tente novamente mais tarde.",
      403
    );
  }
}

async function handleFailedLogin(user, reqMeta) {
  const attempts = (user.failed_attempts || 0) + 1;

  let lockTime = null;

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    lockTime = new Date(Date.now() + LOCK_TIME_MINUTES * 60 * 1000);
  }

  await pool.query(
    `
    UPDATE users
    SET failed_attempts = $1,
        locked_until = $2
    WHERE id = $3
    `,
    [attempts, lockTime, user.id]
  );

  await logLoginAttempt({
    userId: user.id,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    success: false,
  });
}

async function handleSuccessfulLogin(user, reqMeta) {
  await pool.query(
    `
    UPDATE users
    SET failed_attempts = 0,
        locked_until = NULL
    WHERE id = $1
    `,
    [user.id]
  );

  await logLoginAttempt({
    userId: user.id,
    ip: reqMeta.ip,
    userAgent: reqMeta.userAgent,
    success: true,
  });
}

async function createSessionTokens(user) {
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
