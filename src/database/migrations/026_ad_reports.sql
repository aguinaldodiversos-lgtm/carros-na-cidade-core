-- =============================================================================
-- 026 — ad_reports (denúncia pública de anúncio)
-- =============================================================================
--
-- Tabela para registrar denúncias feitas por compradores no detalhe do
-- anúncio. Aceita denúncia ANÔNIMA (sem login) com rate limit + hash de
-- IP, e denúncia LOGADA (reporter_user_id preenchido).
--
-- Não bloqueia o anúncio automaticamente — moderação consulta esta
-- tabela e decide reabrir análise / despublicar. Acúmulo de denúncias
-- pode virar gatilho em futura iteração (ex.: ad_risk_signals).
--
-- Garantias:
--   - CREATE TABLE IF NOT EXISTS — idempotente.
--   - Sem FK rígida em ads.id / users.id (mesmo padrão da baseline,
--     que tem variação de tipo entre BIGINT/UUID em ambientes legados).
--     Integridade no app + ON DELETE CASCADE adicionado quando os
--     tipos forem unificados (ver migrations 008 e similares).
--   - reason CHECK contra os 6 motivos canônicos do produto.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ad_reports (
  id BIGSERIAL PRIMARY KEY,

  -- Anúncio denunciado. Sem FK por compatibilidade com schema legado;
  -- caller valida existência via repository antes de inserir.
  ad_id BIGINT NOT NULL,

  -- NULL quando denúncia é anônima (não logado). Não persistimos
  -- nome/email do denunciante para reduzir surface area de PII.
  reporter_user_id TEXT,

  -- Hash SHA-256 hex do IP de origem. NUNCA o IP cru — auditoria pode
  -- correlacionar denúncias do mesmo IP sem expor o endereço bruto.
  -- 64 chars (sha256 hex). NULL aceito quando não conseguimos resolver
  -- o IP (ex.: testes internos).
  reporter_ip_hash TEXT,

  -- Motivos canônicos exibidos no modal:
  --   suspicious_price       → "Preço suspeito"
  --   incorrect_data         → "Dados incorretos"
  --   vehicle_does_not_exist → "Veículo não existe"
  --   scam_or_advance_pay    → "Golpe ou pedido de pagamento antecipado"
  --   fake_photos            → "Fotos falsas"
  --   other                  → "Outro motivo"
  reason TEXT NOT NULL,

  -- Descrição livre opcional (tamanho controlado no controller).
  description TEXT,

  -- Estado da denúncia para o painel admin futuro:
  --   new       → recém criada, pendente de triagem
  --   in_review → admin abriu para análise
  --   resolved  → ação tomada (anúncio mantido/removido)
  --   dismissed → descartada como falso positivo
  status TEXT NOT NULL DEFAULT 'new',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reason CHECK como ALTER separado para idempotência: se a coluna já
-- existir (deploy parcial), apenas adiciona a constraint sem dropar.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_reports_reason_check'
  ) THEN
    ALTER TABLE ad_reports
      ADD CONSTRAINT ad_reports_reason_check
      CHECK (reason IN (
        'suspicious_price',
        'incorrect_data',
        'vehicle_does_not_exist',
        'scam_or_advance_pay',
        'fake_photos',
        'other'
      ));
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'ad_reports_status_check'
  ) THEN
    ALTER TABLE ad_reports
      ADD CONSTRAINT ad_reports_status_check
      CHECK (status IN ('new', 'in_review', 'resolved', 'dismissed'));
  END IF;
END$$;

-- Índices de leitura admin:
--   - listar denúncias por anúncio (mais comum)
--   - fila por status + idade
--   - rate limit por IP (lookup recente)
CREATE INDEX IF NOT EXISTS idx_ad_reports_ad_id
  ON ad_reports (ad_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_reports_status_created
  ON ad_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ad_reports_ip_hash_recent
  ON ad_reports (reporter_ip_hash, created_at DESC)
  WHERE reporter_ip_hash IS NOT NULL;

COMMENT ON TABLE ad_reports IS
  'Denúncias públicas de anúncios. Aceita anônimo (com hash de IP) ou logado. Status workflow: new → in_review → resolved | dismissed.';
