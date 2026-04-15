-- Dados coletados uma unica vez no primeiro anuncio.
ALTER TABLE users ADD COLUMN IF NOT EXISTS address TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT;

ALTER TABLE advertisers ADD COLUMN IF NOT EXISTS address TEXT;
