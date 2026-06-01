-- =============================================================================
-- 032 — ads: colunas de arquivamento + status 'archived' no CHECK (Fase 3.5)
-- =============================================================================
--
-- Por quê
-- -------
-- A Fase 3.5 substituiu "deletar anúncio" como ação operacional comum por
-- "arquivar" — o anúncio sai das áreas públicas (catálogo, sitemap, detalhe)
-- mas continua salvo no histórico do anunciante e na auditoria. Deletar
-- físico ou marcar como deleted quebra histórico, métricas, pagamentos e
-- denúncias associadas.
--
-- Esta migration adiciona:
--   1. Colunas auxiliares para auditoria do arquivamento:
--      - `archived_at`           TIMESTAMPTZ — quando foi arquivado
--      - `archived_by_user_id`   TEXT        — admin que arquivou
--                                              (alinhado com admin_actions.admin_user_id)
--      - `archive_reason`        TEXT        — motivo obrigatório (redundância
--                                              segura: também fica em admin_actions)
--   2. 'archived' no CHECK constraint de status (migration 030 listava 6 valores).
--
-- Diferença semântica
-- -------------------
-- archived  — remoção operacional do catálogo, NÃO é punição. Anúncio preserva
--             histórico para anunciante/auditoria. Status documentado em
--             src/shared/constants/status.js.
-- blocked   — moderação/fraude. Tem `blocked_reason`/`blocked_at` próprios.
-- deleted   — soft-delete (legado/edge case técnico); evitado como ação comum.
-- sold      — vendido (registro positivo de conversão).
-- expired   — automático por inatividade.
--
-- Idempotência
-- ------------
-- IF NOT EXISTS em todas as adições. DROP IF EXISTS + ADD do CHECK (segue o
-- padrão da migration 030). Re-execução segura.
--
-- Rollback
-- --------
-- Se algum registro tiver status fora da lista, ADD CONSTRAINT falha e a
-- transação faz rollback — migration não é marcada como aplicada.

ALTER TABLE ads ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS archived_by_user_id TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS archive_reason TEXT;

COMMENT ON COLUMN ads.archived_at IS
  'Quando o anuncio foi arquivado (movido para historico). NULL para anuncios nao arquivados. Fase 3.5.';
COMMENT ON COLUMN ads.archived_by_user_id IS
  'admin_user_id que executou o arquivamento. NULL quando arquivamento foi automatico ou nao houve. Fase 3.5.';
COMMENT ON COLUMN ads.archive_reason IS
  'Motivo do arquivamento (obrigatorio no service). Redundancia segura: tambem fica em admin_actions.reason. Fase 3.5.';

-- CHECK constraint — adiciona 'archived' ao set canonico (migration 030 listou 6).
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;

ALTER TABLE ads
  ADD CONSTRAINT ads_status_check
  CHECK (status IN (
    'active',
    'pending_review',
    'paused',
    'rejected',
    'blocked',
    'deleted',
    'archived'
  ));

COMMENT ON CONSTRAINT ads_status_check ON ads IS
  'Set canonico 2026-05-31 (Fase 3.5): adiciona archived a migration 030. Mantem deleted (legado/soft-delete). draft/sold/expired ainda fora do CHECK ate ter caminho de escrita real.';
