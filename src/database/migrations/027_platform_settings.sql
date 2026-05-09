-- 027_platform_settings.sql
--
-- Tabela genérica de configurações da plataforma editáveis por admin.
--
-- Por que genérica (key/value JSONB) em vez de uma tabela por config?
-- O projeto até agora não tinha NENHUMA configuração editável em tempo de
-- execução — tudo era env var ou constante. Esta é a primeira (regional
-- radius_km, default 80, range 10–150). Em vez de criar
-- `regional_page_settings` específica, criamos uma tabela genérica que
-- absorve as próximas (Estadual, limites de moderação, etc.) sem
-- migration por config.
--
-- Por que JSONB e não TEXT/INTEGER?
-- - Permite armazenar inteiros, números, strings, objetos e arrays sem
--   uma coluna por tipo.
-- - Aplicação valida o shape no service (admin-regional-settings.service.js)
--   antes de gravar; o banco apenas garante que é JSON válido.
-- - Escala para configs futuras complexas (ex.: { "min": 10, "max": 150 }).
--
-- Convenção de keys:
-- - Namespace por área seguido de ponto + nome: `regional.radius_km`,
--   `regional.max_city_slugs`, `state.enabled`, `moderation.threshold`.
-- - keys são imutáveis; renomear = nova key + migration de dados.

CREATE TABLE IF NOT EXISTS platform_settings (
  key         TEXT        PRIMARY KEY,
  value       JSONB       NOT NULL,
  description TEXT,
  updated_by  BIGINT      REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE platform_settings IS
  'Configurações globais da plataforma editáveis pelo admin via /api/admin/* endpoints. Validação do shape de value pertence à camada de serviço.';

COMMENT ON COLUMN platform_settings.key IS
  'Namespace.nome (ex.: regional.radius_km). Imutável após criação.';

COMMENT ON COLUMN platform_settings.value IS
  'JSONB. Camada de serviço valida tipo/range antes de gravar.';

-- Seed inicial: raio regional padrão = 80 km (range válido 10–150 km,
-- enforce-ado no service admin-regional-settings.service.js).
-- ON CONFLICT DO NOTHING: idempotente — rodar a migration de novo não
-- sobrescreve um valor já editado pelo admin.
INSERT INTO platform_settings (key, value, description)
VALUES (
  'regional.radius_km',
  '80'::jsonb,
  'Raio em km usado para montar a Página Regional a partir da cidade base. Editável pelo admin. Range válido: 10..150.'
)
ON CONFLICT (key) DO NOTHING;
