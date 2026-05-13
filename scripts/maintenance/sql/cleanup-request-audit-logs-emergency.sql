-- =============================================================================
-- EMERGENCY CLEANUP — public.request_audit_logs
-- =============================================================================
--
-- Incidente: 2026-05-13
-- Storage do Postgres do Render estourou (15 GB; banco suspenso).
-- public.request_audit_logs atingiu:
--   - 53.617.764 linhas
--   - 12 GB de heap + 3.2 GB de índices/toast = ~15 GB
--   - idx_request_audit_logs_created_at: 2.0 GB
--   - request_audit_logs_pkey: 1.1 GB
--
-- Causa raiz: middleware HTTP gravava 100% das requests (incluindo health,
-- assets, /api/vehicle-images, /uploads) sem amostragem nem retenção.
-- Fix aplicado em src/shared/middlewares/httpLogger.middleware.js
-- (default OFF + ignore paths + sampling + truncamento + retention job).
--
-- ESTE SCRIPT É IRREVERSÍVEL. Use só após:
--   1) Confirmar deploy do middleware corrigido (flag default OFF).
--   2) Salvar amostra de 10k linhas em CSV (instrução abaixo) caso
--      precise reprocessar algo no pós-mortem.
--   3) Coordenar com o time (logs de request param de existir até o
--      próximo deploy reativar a flag conscientemente).
--
-- =============================================================================
-- PASSO 1 (opcional, recomendado) — snapshot mínimo p/ pós-mortem
-- =============================================================================
-- Execute ANTES do TRUNCATE. Salva ~10k linhas mais recentes em CSV local.
-- Rodar via psql (não dentro do Render shell, pois Render restringe \copy):
--
--   \copy (
--     SELECT id, request_id, method, path, status_code, duration_ms,
--            ip_address, user_agent, created_at
--     FROM public.request_audit_logs
--     ORDER BY created_at DESC
--     LIMIT 10000
--   ) TO 'request_audit_logs_snapshot_2026-05-13.csv' CSV HEADER;
--
-- =============================================================================
-- PASSO 2 — TRUNCATE
-- =============================================================================
-- TRUNCATE é >100x mais rápido que DELETE para tabelas grandes:
--   - Não escreve cada linha no WAL como tombstone.
--   - Libera o storage IMEDIATAMENTE (sem precisar de VACUUM FULL).
--   - Reseta os índices (libera os 3 GB de índice).
--
-- RESTART IDENTITY: zera a sequence do `id` (id BIGSERIAL). Como esta tabela
-- é puramente observacional e não tem FKs apontando pra ela, é seguro.
-- Se houver dúvida, remova RESTART IDENTITY.

BEGIN;

-- Sanity check: confirme que NENHUMA outra tabela tem FK pra request_audit_logs.
-- (Esperamos 0 linhas.)
SELECT conname, conrelid::regclass AS referencing_table
FROM pg_constraint
WHERE contype = 'f'
  AND confrelid = 'public.request_audit_logs'::regclass;

-- Tamanho ANTES (pra registrar no postmortem).
SELECT
  pg_size_pretty(pg_total_relation_size('public.request_audit_logs')) AS total_before,
  pg_size_pretty(pg_relation_size('public.request_audit_logs'))       AS heap_before,
  pg_size_pretty(pg_indexes_size('public.request_audit_logs'))        AS indexes_before,
  (SELECT reltuples::bigint FROM pg_class
    WHERE oid = 'public.request_audit_logs'::regclass)                 AS rows_estimate_before;

TRUNCATE TABLE public.request_audit_logs RESTART IDENTITY;

-- Tamanho DEPOIS (deve ser ~0).
SELECT
  pg_size_pretty(pg_total_relation_size('public.request_audit_logs')) AS total_after;

COMMIT;

-- =============================================================================
-- PASSO 3 — Liberar storage de volta pro filesystem
-- =============================================================================
-- TRUNCATE já libera o storage (diferente de DELETE). Mas se quiser ter certeza
-- absoluta de que o filesystem mostra o espaço livre (Render mede storage no
-- disco, não no Postgres):
--
--   VACUUM (VERBOSE, ANALYZE) public.request_audit_logs;
--
-- VACUUM FULL não é necessário após TRUNCATE.
--
-- =============================================================================
-- ROLLBACK
-- =============================================================================
-- TRUNCATE é IRREVERSÍVEL fora da transação. O BEGIN/COMMIT acima permite
-- ROLLBACK manual ANTES do COMMIT — basta substituir COMMIT por ROLLBACK
-- se algo no sanity check vier inesperado.
--
-- Pós-COMMIT não há rollback. Plano de recuperação:
--   1) Restore parcial do snapshot CSV do PASSO 1 (se feito).
--   2) Restore do backup automático do Render (se disponível) para uma
--      base secundária, e re-importar request_audit_logs via \copy.
--
-- Como esta tabela é puramente observacional, "perda total" é aceitável.
-- =============================================================================
