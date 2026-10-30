-- Perfil público da loja: identidade visual e avaliações auditáveis.
-- Nunca armazena fotos em bytes no PostgreSQL; URLs apontam para R2.
ALTER TABLE advertisers
  ADD COLUMN IF NOT EXISTS public_description TEXT,
  ADD COLUMN IF NOT EXISTS public_cover_url TEXT,
  ADD COLUMN IF NOT EXISTS public_logo_url TEXT;

CREATE TABLE IF NOT EXISTS dealer_reviews (
  id BIGSERIAL PRIMARY KEY,
  advertiser_id BIGINT NOT NULL REFERENCES advertisers(id) ON DELETE CASCADE,
  reviewer_user_id TEXT NOT NULL,
  reviewer_name TEXT NOT NULL,
  rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body TEXT NOT NULL CHECK (char_length(body) BETWEEN 15 AND 500),
  status TEXT NOT NULL DEFAULT 'published' CHECK (status IN ('published', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  hidden_at TIMESTAMPTZ,
  hidden_by_user_id TEXT,
  UNIQUE (advertiser_id, reviewer_user_id)
);
CREATE INDEX IF NOT EXISTS dealer_reviews_published_idx
  ON dealer_reviews(advertiser_id, created_at DESC) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS dealer_reviews_advertiser_idx ON dealer_reviews(advertiser_id, created_at DESC);
