-- Compatibilidade entre colunas legada/atual de verificação de e-mail.
-- Se uma coluna já afirmar verificação, a outra não deve manter falso conflitante.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = current_schema()
      AND table_name = 'users'
  ) THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
        AND column_name = 'email_verified'
    ) AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'users'
        AND column_name = 'is_email_verified'
    ) THEN
      UPDATE users
      SET email_verified = true
      WHERE is_email_verified = true
        AND COALESCE(email_verified, false) = false;

      UPDATE users
      SET is_email_verified = true
      WHERE email_verified = true
        AND COALESCE(is_email_verified, false) = false;
    END IF;
  END IF;
END $$;
