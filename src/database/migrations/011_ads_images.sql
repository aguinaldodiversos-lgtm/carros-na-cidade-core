-- Galeria de fotos do anúncio (URLs públicas relativas ou absolutas).
ALTER TABLE ads ADD COLUMN IF NOT EXISTS images JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN ads.images IS 'Array JSON de URLs de imagem (capa = primeiro elemento).';
