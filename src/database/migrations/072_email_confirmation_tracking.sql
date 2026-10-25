-- Confirmação explícita de posse do e-mail, separada dos flags históricos.
-- Não modificar/retroativamente invalidar contas legadas.
-- Apenas email_verified_at representa clique confirmado no link.
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verified_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS email_verification_last_sent_at TIMESTAMPTZ;
