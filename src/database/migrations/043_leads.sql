-- Tabela `leads` (contatos de compradores).
--
-- Existe em produção (fluxo leads.service.createLead + account.service
-- getLeadCountsForOwner), mas NÃO tinha migration — mesmo risco de
-- irreprodutibilidade que a `payments` já causou. Esta migration reflete o
-- schema REAL usado pelo código:
--   INSERT INTO leads (ad_id, seller_id, city_id, buyer_name, buyer_phone)
--   SELECT ad_id, COUNT(*) FROM leads WHERE seller_id = $1 GROUP BY ad_id
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. Em
-- produção (tabela já existe) é no-op; em ambiente novo, cria completa.
-- NÃO confundir com `dealer_leads` (aquisição de lojistas, migration 005).

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS leads (
    id BIGSERIAL PRIMARY KEY,
    ad_id BIGINT REFERENCES ads(id) ON DELETE CASCADE,
    seller_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    city_id BIGINT REFERENCES cities(id) ON DELETE SET NULL,
    buyer_name TEXT NOT NULL,
    buyer_phone TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Resiliência para eventual tabela legada parcial (colunas nullable no ADD;
  -- o NOT NULL de buyer_name só vale no caminho de criação nova).
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS ad_id BIGINT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS seller_id BIGINT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS city_id BIGINT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS buyer_name TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS buyer_phone TEXT;
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

  -- Índices: seller_id (getLeadCountsForOwner), ad_id (contagem por anúncio),
  -- created_at (janelas temporais futuras).
  CREATE INDEX IF NOT EXISTS idx_leads_seller_id ON leads (seller_id);
  CREATE INDEX IF NOT EXISTS idx_leads_ad_id ON leads (ad_id);
  CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads (created_at);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '043_leads: tabela leads não criada/ajustada (%).', SQLERRM;
END $$;
