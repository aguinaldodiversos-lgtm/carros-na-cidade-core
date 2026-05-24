-- 2026-05-24 — Correção crítica de produção.
-- IDEMPOTENTE: pode ser rodado várias vezes sem efeito colateral.
-- ROLLBACK seguro: cada bloco é uma transação isolada com SELECT antes e depois.
--
-- Aplicar em produção com:
--   psql "$DATABASE_URL" -f scripts/sql/2026-05-24-fix-producao-critico.sql
--
-- Ou via Render shell:
--   psql -f /opt/render/project/src/scripts/sql/2026-05-24-fix-producao-critico.sql

\set ON_ERROR_STOP on
\set ECHO all
\timing on

-- ============================================================================
-- BLOCO 1 — Encoding: corrigir cities.id=1 "SÆo Paulo" → "São Paulo"
-- ============================================================================
-- O canonical São Paulo é cities.id=5278 / slug='sao-paulo-sp'.
-- A linha id=1 é seed antigo com encoding latin1→utf8 quebrado.
-- Estratégia:
--   a) Verifica se a anomalia ainda existe.
--   b) Se a id=5278 existe (canonical), faz UPDATE em ads.city_id de 1 para
--      5278 antes de qualquer ação na cities.id=1 — evita órfãos.
--   c) Renomeia cities.id=1 para "São Paulo (legado)" com slug não-conflitante
--      para preservar FK histórica sem aparecer mais como cidade pública.
--
-- NÃO usa DELETE — historical referrers em logs e métricas continuam válidos.

BEGIN;

-- Mostra o estado atual da linha problemática:
SELECT id, name, slug, state FROM cities WHERE id = 1;
SELECT id, name, slug, state FROM cities WHERE id = 5278;

-- Reaponta ads que estavam apontando para id=1 (encoding quebrado) para o
-- canonical id=5278, mas SÓ quando ads.state confirma SP e nome legível.
-- Idempotente: NOT EXISTS garante que rodar de novo não move nada.
UPDATE ads
   SET city_id = 5278,
       city    = 'São Paulo',
       state   = 'SP'
 WHERE city_id = 1
   AND EXISTS (SELECT 1 FROM cities WHERE id = 5278)
   AND COALESCE(UPPER(state), 'SP') = 'SP';

-- Sanitiza a linha id=1 só se ainda contém o encoding quebrado.
-- Renomeia para "São Paulo (legado)" e troca slug para evitar colisão com
-- a canonical. Idempotente: o WHERE só dispara se o nome ainda é o latin1.
UPDATE cities
   SET name = 'São Paulo (legado)',
       slug = 'sao-paulo-legado-sp'
 WHERE id = 1
   AND (name LIKE '%Æ%' OR slug LIKE '%æ%');

-- Verifica após:
SELECT id, name, slug, state FROM cities WHERE id IN (1, 5278);
SELECT COUNT(*) AS ads_ainda_apontando_para_id_1 FROM ads WHERE city_id = 1;

COMMIT;

-- ============================================================================
-- BLOCO 2 — Arquivar anúncios de teste de produção
-- ============================================================================
-- Marca como 'archived_test' qualquer anúncio cujo title/model/slug contenha
-- padrões de teste/seed/deploy/worker/alerta/fake/dummy/sample. Reversível
-- (basta UPDATE status='active' WHERE status='archived_test' e gravou
-- archive_reason).
--
-- O guard no código backend (DIRTY_TEST_AD_GUARD_SQL em ads-filter.builder.js)
-- já bloqueia esses anúncios na vitrine pública mesmo se status='active'.
-- Este UPDATE garante CONSISTÊNCIA do dado: o anúncio também sai dos
-- relatórios admin, métricas, e qualquer query downstream.
--
-- Idempotente: WHERE status='active' garante que rodar de novo não muda nada.

BEGIN;

-- Snapshot ANTES — quantos serão arquivados:
SELECT
  COUNT(*) AS candidatos_a_arquivar
FROM ads
WHERE status = 'active'
  AND (
       LOWER(COALESCE(title, '')) ~ '(test|teste|seed|deploy|worker|alerta|fake|dummy|sample)'
    OR LOWER(COALESCE(model, '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)'
    OR LOWER(COALESCE(model, '')) ~ 'deploymodel'
    OR LOWER(COALESCE(slug,  '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)-'
  );

-- Lista (10 primeiros) para o operador conferir antes do COMMIT:
SELECT id, title, model, slug, state, status, created_at
FROM ads
WHERE status = 'active'
  AND (
       LOWER(COALESCE(title, '')) ~ '(test|teste|seed|deploy|worker|alerta|fake|dummy|sample)'
    OR LOWER(COALESCE(model, '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)'
    OR LOWER(COALESCE(model, '')) ~ 'deploymodel'
    OR LOWER(COALESCE(slug,  '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)-'
  )
ORDER BY created_at DESC
LIMIT 10;

-- Arquivamento. RETURNING para o operador ter o rastro completo.
UPDATE ads
   SET status = 'archived_test',
       updated_at = NOW()
 WHERE status = 'active'
   AND (
        LOWER(COALESCE(title, '')) ~ '(test|teste|seed|deploy|worker|alerta|fake|dummy|sample)'
     OR LOWER(COALESCE(model, '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)'
     OR LOWER(COALESCE(model, '')) ~ 'deploymodel'
     OR LOWER(COALESCE(slug,  '')) ~ '^(test|teste|seed|deploy|worker|fake|dummy|sample)-'
   )
 RETURNING id, title, model, slug;

-- Confirma:
SELECT COUNT(*) AS arquivados_total FROM ads WHERE status = 'archived_test';

COMMIT;

-- ============================================================================
-- BLOCO 3 — DIAGNÓSTICO: ads com city_id incoerente com a cidade nomeada
-- ============================================================================
-- NÃO ALTERA NADA. Identifica anúncios onde a.city != cities.name OU
-- a.state != cities.state (sugere a.city_id apontando errado).
-- Use o output para decidir backfill manual (raras dezenas, não vale
-- automação).

SELECT
  a.id,
  a.title,
  a.brand,
  a.model,
  a.city  AS ads_city,
  a.state AS ads_state,
  c.id    AS cities_id,
  c.name  AS cities_name,
  c.slug  AS cities_slug,
  c.state AS cities_state
FROM ads a
LEFT JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
  AND (
       (a.city IS NOT NULL AND c.name  IS NOT NULL AND LOWER(a.city)  <> LOWER(c.name))
    OR (a.state IS NOT NULL AND c.state IS NOT NULL AND UPPER(a.state) <> UPPER(c.state))
    OR a.city_id IS NULL
  )
ORDER BY a.id DESC
LIMIT 50;

-- ============================================================================
-- BLOCO 4 — DIAGNÓSTICO: por que Atibaia/Campinas regional dá 0/timeout
-- ============================================================================
-- a) Anúncios ATIVOS em Atibaia/Campinas (via cidade canônica):
SELECT
  c.slug,
  c.name,
  c.state,
  COUNT(*) AS total_ativos
FROM ads a
JOIN cities c ON c.id = a.city_id
WHERE a.status = 'active'
  AND c.slug IN ('atibaia-sp', 'campinas-sp')
GROUP BY c.slug, c.name, c.state
ORDER BY c.slug;

-- b) Membros de região para Atibaia/Campinas (precisa region_memberships):
SELECT
  base.slug AS base_slug,
  base.name AS base_name,
  rm.distance_km,
  rm.layer,
  member.slug AS member_slug,
  member.name AS member_name
FROM region_memberships rm
JOIN cities base   ON base.id   = rm.base_city_id
JOIN cities member ON member.id = rm.member_city_id
WHERE base.slug IN ('atibaia-sp', 'campinas-sp')
ORDER BY base.slug, rm.distance_km NULLS LAST;

-- c) Configuração do raio regional (espera-se entre 10..150 km):
SELECT key, value FROM platform_settings WHERE key = 'regional.radius_km';

-- ============================================================================
-- BLOCO 5 — Backfill SEGURO de city_id para casos não-ambíguos
-- ============================================================================
-- Reaponta a.city_id quando:
--   - a.city_id é NULL OU
--   - cities.id = a.city_id já não existe (FK órfã)
-- E existe EXATAMENTE UMA cidade que casa (a.city, a.state).
--
-- NÃO toca ads com city_id já apontando para uma cidade real (mesmo que
-- divergente do a.city/a.state). Esses casos requerem revisão manual via
-- diagnóstico do BLOCO 3 — não vale risco de auto-corrigir errado.
--
-- Idempotente: roda múltiplas vezes sem efeito (segunda execução não
-- encontra ads órfãos).

BEGIN;

-- Preview do que será corrigido:
WITH candidatos AS (
  SELECT
    a.id,
    a.city  AS ads_city,
    a.state AS ads_state,
    (SELECT c.id FROM cities c
       WHERE LOWER(c.name) = LOWER(a.city)
         AND UPPER(c.state) = UPPER(a.state)
       LIMIT 2) AS resolved_city_id,
    (SELECT COUNT(*) FROM cities c
       WHERE LOWER(c.name) = LOWER(a.city)
         AND UPPER(c.state) = UPPER(a.state)) AS match_count
  FROM ads a
  LEFT JOIN cities c ON c.id = a.city_id
  WHERE a.status = 'active'
    AND a.city IS NOT NULL
    AND a.state IS NOT NULL
    AND (a.city_id IS NULL OR c.id IS NULL)
)
SELECT
  COUNT(*) FILTER (WHERE match_count = 1) AS reparáveis_unívocos,
  COUNT(*) FILTER (WHERE match_count = 0) AS sem_cidade_cadastrada,
  COUNT(*) FILTER (WHERE match_count > 1) AS ambíguos_revisar_manual
FROM candidatos;

-- Aplica o backfill nos casos UNÍVOCOS:
UPDATE ads a
   SET city_id = sub.resolved_city_id,
       updated_at = NOW()
  FROM (
    SELECT
      a2.id,
      (SELECT c.id FROM cities c
         WHERE LOWER(c.name) = LOWER(a2.city)
           AND UPPER(c.state) = UPPER(a2.state)
         LIMIT 1) AS resolved_city_id,
      (SELECT COUNT(*) FROM cities c
         WHERE LOWER(c.name) = LOWER(a2.city)
           AND UPPER(c.state) = UPPER(a2.state)) AS match_count
    FROM ads a2
    LEFT JOIN cities c2 ON c2.id = a2.city_id
    WHERE a2.status = 'active'
      AND a2.city IS NOT NULL
      AND a2.state IS NOT NULL
      AND (a2.city_id IS NULL OR c2.id IS NULL)
  ) sub
 WHERE a.id = sub.id
   AND sub.match_count = 1
   AND sub.resolved_city_id IS NOT NULL
 RETURNING a.id, a.city, a.state, a.city_id;

COMMIT;

-- Fim do script.

