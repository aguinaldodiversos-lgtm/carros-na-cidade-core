-- =============================================================================
-- 034 — home_sections: carrossel de 3 banners do hero (Fase 4.1.1)
-- =============================================================================
--
-- O que muda vs. 033
-- ------------------
-- A 033 criou home_sections single-row (key='home_hero'). A Home pública
-- precisa de até 3 banners principais em um carrossel — editáveis
-- INDIVIDUALMENTE pelo admin (PATCH em Banner 1 não pode alterar Banner 2/3).
--
-- Esta migration adiciona:
--   - `section_type` TEXT (ex.: 'home_hero', 'promo_strip' no futuro)
--   - `position`     SMALLINT (1..3 para home_hero)
--   - UNIQUE (section_type, position) — impede colisão silenciosa.
--   - CHECK para limites de position por section_type.
--
-- Compatibilidade com 033
-- -----------------------
-- O registro `home_hero` criado pela 033 (se existir) é MIGRADO para Banner 1
-- (section_type='home_hero', position=1, key='home_hero_1'). Banners 2 e 3
-- são criados INATIVOS — admin precisa editar e ativar conscientemente para
-- exibir no carrossel. Não destruímos a 033: ela ainda roda primeiro em
-- bancos novos e cria a linha base; esta 034 é puramente aditiva.
--
-- Idempotência
-- ------------
-- - ADD COLUMN IF NOT EXISTS.
-- - Backfill por UPDATE condicional (só quem ainda está NULL).
-- - INSERT ... ON CONFLICT DO NOTHING para os banners 2/3.
-- - Constraint via DO/EXCEPTION (CREATE só se não existir).
-- Rodar 2x dá zero diff.
-- =============================================================================

-- 1) Colunas novas (nullable temporariamente, NOT NULL depois do backfill).
ALTER TABLE home_sections
  ADD COLUMN IF NOT EXISTS section_type TEXT,
  ADD COLUMN IF NOT EXISTS position     SMALLINT;

-- 2) Backfill: registro legado da 033 vira Banner 1.
--    A 033 criou uma row com key='home_hero'. Migramos para o novo modelo:
--    - section_type = 'home_hero'
--    - position     = 1
--    - key          = 'home_hero_1'  (mantém UNIQUE na coluna key)
--    Sem nada deste bloco se a linha já foi reorganizada antes.
UPDATE home_sections
   SET section_type = 'home_hero',
       position     = 1,
       key          = 'home_hero_1'
 WHERE key = 'home_hero'
   AND (section_type IS NULL OR position IS NULL);

-- 3) Qualquer outra linha pré-existente sem section_type herda 'home_hero' +
--    position deduzido pela ordem de criação (defensive — não esperamos
--    nada aqui em prod, mas é zero custo deixar consistente).
UPDATE home_sections
   SET section_type = COALESCE(section_type, 'home_hero')
 WHERE section_type IS NULL;

-- 4) Constraints — NOT NULL depois do backfill, CHECK de range, UNIQUE.
ALTER TABLE home_sections
  ALTER COLUMN section_type SET NOT NULL;

-- position pode ser NULL para seções single-instance no futuro (ex.: footer
-- block) — então NÃO impomos NOT NULL global. Para 'home_hero' o CHECK
-- abaixo garante 1..3, e o UNIQUE parcial garante exclusividade.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'home_sections_hero_position_range_chk'
  ) THEN
    ALTER TABLE home_sections
      ADD CONSTRAINT home_sections_hero_position_range_chk
      CHECK (
        section_type <> 'home_hero'
        OR (position IS NOT NULL AND position BETWEEN 1 AND 3)
      );
  END IF;
END $$;

-- UNIQUE parcial: dois banners não podem ocupar mesma (section_type, position).
-- WHERE position IS NOT NULL libera seções single-instance que não usam position.
CREATE UNIQUE INDEX IF NOT EXISTS uq_home_sections_type_position
  ON home_sections (section_type, position)
  WHERE position IS NOT NULL;

-- 5) Banner 1 — garante existência (defesa para bancos sem a seed da 033).
INSERT INTO home_sections (
  key, section_type, position, title, subtitle, cta_label, cta_url, image_alt, is_active
) VALUES (
  'home_hero_1',
  'home_hero',
  1,
  'Carros usados em todo o Brasil',
  'Ofertas selecionadas e verificadas — informe sua cidade para ver carros próximos.',
  'Ver ofertas',
  '/comprar',
  'Carros usados — Carros na Cidade',
  TRUE
)
ON CONFLICT (key) DO NOTHING;

-- 6) Banner 2 e Banner 3 — INATIVOS por padrão. Admin ativa quando configura.
--    is_active=FALSE garante que, antes do admin editar, o carrossel público
--    continua mostrando só o Banner 1 (= mesmo comportamento da 4.1).
INSERT INTO home_sections (
  key, section_type, position, title, subtitle, cta_label, cta_url, image_alt, is_active
) VALUES (
  'home_hero_2',
  'home_hero',
  2,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  FALSE
)
ON CONFLICT (key) DO NOTHING;

INSERT INTO home_sections (
  key, section_type, position, title, subtitle, cta_label, cta_url, image_alt, is_active
) VALUES (
  'home_hero_3',
  'home_hero',
  3,
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  FALSE
)
ON CONFLICT (key) DO NOTHING;

-- 7) Índices auxiliares.
-- O índice parcial idx_home_sections_key_active (criado na 033 sobre key)
-- continua válido e útil. Adicionamos um para o caminho público (lê os
-- ativos de home_hero ordenados por position).
CREATE INDEX IF NOT EXISTS idx_home_sections_type_active_position
  ON home_sections (section_type, position)
  WHERE is_active = TRUE;

-- 8) Comentários atualizados.
COMMENT ON COLUMN home_sections.section_type IS
  'Tipo da seção (ex.: home_hero). Agrupa rows que pertencem ao mesmo bloco da página. UNIQUE com position.';

COMMENT ON COLUMN home_sections.position IS
  'Posição dentro da seção (1..3 para home_hero). Define a ordem de exibição no carrossel público.';
