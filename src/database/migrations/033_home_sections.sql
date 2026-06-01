-- =============================================================================
-- 033 — home_sections: gestão de conteúdo da Home (Fase 4.1)
-- =============================================================================
--
-- Por quê
-- -------
-- O admin precisa trocar título, subtítulo, CTA e imagens do banner principal
-- da Home sem depender de deploy. Hoje o hero é um asset estático em
-- frontend/public/images + texto hardcoded em HomeHero.tsx — qualquer mudança
-- (campanha, data sazonal, comunicação institucional) exige PR.
--
-- Por que tabela dedicada (e não platform_settings)?
-- ---------------------------------------------------
-- `platform_settings` é generic key/value JSONB, ótimo para configurações
-- escalares (radius_km, limites). Para conteúdo visual estruturado com
-- upload de imagem, versionamento e múltiplas seções futuras (promo strip,
-- highlights, banners sazonais) seria pesado e impreciso. `home_sections`
-- com `key` único + colunas tipadas é mais correto e auditável.
--
-- Por que `key` no lugar de só `id`?
-- ----------------------------------
-- Single-row por seção: o backend lê SEMPRE por key ('home_hero'). Adicionar
-- uma 2ª seção (ex.: 'home_promo_strip') é só inserir outra linha. Sem joins,
-- sem proliferação de tabelas. `id` existe para FK em futuras tabelas de
-- histórico/agendamento (fase 4.2+) sem depender da key como chave externa.
--
-- Versionamento (`version`)
-- -------------------------
-- Inteiro incrementado a cada UPDATE pelo service. Não é otimistic-lock (não
-- usamos `WHERE version = $X`); é apenas para auditoria fácil e para o
-- frontend exibir "última versão publicada".
--
-- Trilha de auditoria
-- -------------------
-- O service grava em `admin_actions` (target_type='home_content',
-- target_id='home_hero') com old_value/new_value/reason. Esta tabela só
-- guarda o estado atual; histórico fica em admin_actions.
-- =============================================================================

CREATE TABLE IF NOT EXISTS home_sections (
  id                   BIGSERIAL    PRIMARY KEY,
  key                  TEXT         NOT NULL UNIQUE,
  title                TEXT,
  subtitle             TEXT,
  cta_label            TEXT,
  cta_url              TEXT,
  image_desktop_url    TEXT,
  image_mobile_url     TEXT,
  image_alt            TEXT,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  version              INTEGER      NOT NULL DEFAULT 1,
  created_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_by_admin_id  TEXT
);

COMMENT ON TABLE home_sections IS
  'Seções editáveis da Home (e demais páginas institucionais futuras). Uma linha por seção, identificada pela key. Editada pelo painel admin via /api/admin/home/*.';

COMMENT ON COLUMN home_sections.key IS
  'Identificador estável da seção (ex.: home_hero, home_promo_strip). Imutável após criação.';

COMMENT ON COLUMN home_sections.cta_url IS
  'URL do CTA do banner. Service valida: caminho interno (começa com /) tem prioridade; http/https externo aceito; demais schemes rejeitados (javascript:, data:, etc.).';

COMMENT ON COLUMN home_sections.image_desktop_url IS
  'URL pública (R2/CDN) da imagem desktop do hero. Pipeline de upload converte para WebP, EXIF strip, gera key estável em site/home-hero/desktop/<yyyy>/<mm>/<uuid>.webp.';

COMMENT ON COLUMN home_sections.image_mobile_url IS
  'URL pública opcional da imagem mobile (vertical/quadrada). Se nula, frontend usa image_desktop_url com object-cover.';

COMMENT ON COLUMN home_sections.is_active IS
  'Quando false, frontend público ignora esta seção e cai no fallback hardcoded. Permite desativar uma campanha sem perder o conteúdo.';

COMMENT ON COLUMN home_sections.version IS
  'Inteiro incrementado a cada UPDATE bem-sucedido (gerenciado pelo service). Não é optimistic-lock.';

-- Índice por key não é estritamente necessário (já é UNIQUE), mas explicita
-- a intenção: todas as leituras são por key.
CREATE INDEX IF NOT EXISTS idx_home_sections_key_active
  ON home_sections (key)
  WHERE is_active = TRUE;

-- Seed inicial do hero — usa os textos atuais hardcoded em HomeHero.tsx
-- como ponto de partida. Imagens deixadas em NULL para que, na primeira
-- leitura pública, o frontend caia no fallback estático
-- (/images/home-hero-banner.jpg) até o admin fazer upload.
INSERT INTO home_sections (
  key, title, subtitle, cta_label, cta_url, image_alt, is_active
)
VALUES (
  'home_hero',
  'Carros usados em todo o Brasil',
  'Ofertas selecionadas e verificadas — informe sua cidade para ver carros próximos.',
  'Ver ofertas',
  '/comprar',
  'Carros usados — Carros na Cidade',
  TRUE
)
ON CONFLICT (key) DO NOTHING;
