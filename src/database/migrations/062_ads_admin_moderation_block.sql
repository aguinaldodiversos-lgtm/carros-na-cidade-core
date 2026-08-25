-- =============================================================================
-- 062 — Moderação administrativa de anúncios (Fase 4.10A)
-- =============================================================================
--
-- CONTEXTO
--   O status 'blocked' já existe desde a migration 014 (colunas blocked_reason
--   / blocked_at) e entrou no CHECK canônico em 030 (+ 'archived' em 032).
--   A camada pública inteira filtra `status = 'active'` (AD_STATUS_PUBLIC),
--   então bloquear já remove o anúncio de todas as superfícies.
--
--   O que faltava para o bloqueio ser uma capacidade administrativa COMPLETA:
--
--   1. MOTIVO ESTÁVEL — `blocked_reason` é texto livre. Um código de domínio
--      permite rótulos pt-BR na UI sem persistir tradução como chave, e
--      permite mostrar ao anunciante um rótulo mais brando que o interno.
--
--   2. ESTADO ANTERIOR — hoje "desbloquear" força status='active'. Um anúncio
--      que estava 'paused' (ou 'pending_review') ao ser bloqueado voltaria
--      PÚBLICO na reativação — o admin burlaria, sem querer, a pausa do dono e
--      a fila de moderação. Guardar o estado anterior torna a reativação uma
--      RESTAURAÇÃO, não um "forçar active".
--
--   3. AUTORIA — quem bloqueou. Uso EXCLUSIVAMENTE interno (admin/auditoria);
--      nunca entra em DTO do anunciante nem em resposta pública.
--
-- COLUNAS (todas aditivas, nullable, sem default destrutivo)
--   blocked_reason_code      TEXT  código estável (ver ad-block-reasons.js)
--   blocked_previous_status  TEXT  status imediatamente anterior ao bloqueio
--   blocked_by_user_id       TEXT  admin que bloqueou (interno)
--
--   `blocked_reason` (014) permanece como a OBSERVAÇÃO administrativa livre
--   (nota interna). `blocked_at` (014) permanece como o carimbo de tempo.
--
-- BACKFILL
--   Linhas já em status='blocked' (bloqueadas pelo caminho antigo, sem código)
--   recebem 'other' + previous_status='active'. 'active' é a escolha correta
--   para o legado: o caminho antigo só oferecia "Desbloquear → active", então
--   restaurar para 'active' preserva exatamente o comportamento que essas
--   linhas já teriam. Não inventa um estado que elas nunca tiveram.
--
-- CHECK
--   `ads_blocked_requires_reason_code` — status='blocked' exige reason_code.
--   Adicionado como NOT VALID de propósito: valida toda linha NOVA ou
--   ATUALIZADA sem varrer a tabela existente (deploy-safe em tabela grande) e
--   sem falhar caso um legado escape do backfill acima. Promover a VALID numa
--   migration futura depois de confirmar zero violações em produção.
--
-- REVERSÍVEL
--   Nenhum DROP, nenhum DELETE, nenhum UPDATE de status. Só adiciona colunas
--   e preenche as novas em linhas que já estavam bloqueadas.
-- =============================================================================

ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_reason_code     TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_previous_status TEXT;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS blocked_by_user_id      TEXT;

COMMENT ON COLUMN ads.blocked_reason_code IS
  'Codigo estavel do motivo do bloqueio administrativo (src/shared/moderation/ad-block-reasons.js). Rotulos pt-BR vivem na UI; nunca persistir traducao como chave.';
COMMENT ON COLUMN ads.blocked_previous_status IS
  'Status imediatamente anterior ao bloqueio. A reativacao RESTAURA este valor em vez de forcar active - impede que um ad pausado/em analise volte publico.';
COMMENT ON COLUMN ads.blocked_by_user_id IS
  'Admin que aplicou o bloqueio. Uso interno (auditoria/admin); NUNCA exposto ao anunciante nem ao publico.';
COMMENT ON COLUMN ads.blocked_reason IS
  'Observacao administrativa livre do bloqueio (nota interna). O motivo de dominio e blocked_reason_code.';

-- ---------------------------------------------------------------------------
-- Backfill do legado (idempotente: so toca linha bloqueada sem codigo)
-- ---------------------------------------------------------------------------
UPDATE ads
   SET blocked_reason_code     = COALESCE(blocked_reason_code, 'other'),
       blocked_previous_status = COALESCE(blocked_previous_status, 'active')
 WHERE status = 'blocked'
   AND (blocked_reason_code IS NULL OR blocked_previous_status IS NULL);

-- ---------------------------------------------------------------------------
-- Integridade: bloqueado sem motivo e estado impossivel
-- ---------------------------------------------------------------------------
ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_blocked_requires_reason_code;

ALTER TABLE ads
  ADD CONSTRAINT ads_blocked_requires_reason_code
  CHECK (status <> 'blocked' OR blocked_reason_code IS NOT NULL)
  NOT VALID;

COMMENT ON CONSTRAINT ads_blocked_requires_reason_code ON ads IS
  'Fase 4.10A: bloqueio administrativo exige motivo. NOT VALID = valida linhas novas/atualizadas sem varrer o legado; promover a VALID apos confirmar zero violacoes.';

-- ---------------------------------------------------------------------------
-- Indice parcial: fila de bloqueados no admin (poucas linhas)
-- ---------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_ads_blocked_at
  ON ads (blocked_at DESC)
  WHERE status = 'blocked';
