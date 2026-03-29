-- Opcional: integridade referencial advertisers.user_id -> users(id)
-- Em bancos legados (ex.: users.id UUID e advertisers.user_id BIGINT) o ALTER falha;
-- o bloco abaixo registra NOTICE e segue sem abortar a migration.
-- Limpe linhas órfãs antes (advertisers sem user): scripts/report-advertiser-integrity.mjs

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'advertisers_user_id_fkey'
  ) THEN
    RETURN;
  END IF;

  ALTER TABLE advertisers
    ADD CONSTRAINT advertisers_user_id_fkey
    FOREIGN KEY (user_id) REFERENCES users (id)
    ON DELETE RESTRICT;
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '008_advertisers_user_fk: constraint não aplicada (%).', SQLERRM;
END $$;
