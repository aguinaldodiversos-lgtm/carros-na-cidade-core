-- =============================================================================
-- 016 — Seed admin user from ADMIN_SEED_EMAIL environment variable
-- =============================================================================
-- If ADMIN_SEED_EMAIL is set, promotes that user to admin (idempotent).
-- Does nothing if the env var is not set or user does not exist.
-- Safe to run in any environment — no hardcoded credentials.

DO $$
DECLARE
  v_email TEXT;
BEGIN
  v_email := current_setting('app.admin_seed_email', true);

  IF v_email IS NULL OR v_email = '' THEN
    RAISE NOTICE '016: ADMIN_SEED_EMAIL not set — skipping admin seed.';
    RETURN;
  END IF;

  UPDATE users SET role = 'admin' WHERE LOWER(email) = LOWER(v_email) AND role != 'admin';

  IF FOUND THEN
    RAISE NOTICE '016: User % promoted to admin.', v_email;
  ELSE
    RAISE NOTICE '016: User % not found or already admin — no changes.', v_email;
  END IF;
END$$;
