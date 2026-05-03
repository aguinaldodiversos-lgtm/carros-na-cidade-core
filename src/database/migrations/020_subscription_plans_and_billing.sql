-- 020_subscription_plans_and_billing.sql
--
-- Promove o schema declarativo de billing/subscriptions (frontend/lib/db/schema.sql)
-- para migration oficial e substitui o ensurePaymentsSchema() em runtime do
-- src/modules/payments/payments.service.js. Também dá home ao seed dos 6 planos
-- já hardcoded em DEFAULT_PLANS (src/modules/account/account.service.js) e adiciona
-- users.plan_id como fonte canônica de plano (mantém users.plan legado para
-- compatibilidade — backfill para o vocabulário novo é feito nesta migration).

CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CPF', 'CNPJ')),
  price NUMERIC(12,2) NOT NULL DEFAULT 0,
  ad_limit INTEGER NOT NULL DEFAULT 0,
  is_featured_enabled BOOLEAN NOT NULL DEFAULT false,
  has_store_profile BOOLEAN NOT NULL DEFAULT false,
  priority_level INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  validity_days INTEGER,
  billing_model TEXT NOT NULL DEFAULT 'free' CHECK (billing_model IN ('free', 'one_time', 'monthly')),
  description TEXT NOT NULL DEFAULT '',
  benefits JSONB NOT NULL DEFAULT '[]'::jsonb,
  recommended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'canceled', 'pending')),
  expires_at TIMESTAMPTZ,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id, created_at)
);

CREATE INDEX IF NOT EXISTS user_subscriptions_user_id_idx ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx ON user_subscriptions (status);

CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans(id),
  mercado_pago_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  amount NUMERIC(12,2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('one_time', 'recurring')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);

CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('plan', 'boost')),
  plan_id TEXT REFERENCES subscription_plans(id),
  ad_id TEXT,
  boost_option_id TEXT,
  amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  checkout_resource_id TEXT,
  checkout_resource_type TEXT CHECK (checkout_resource_type IN ('preference', 'preapproval')),
  payment_resource_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_intents_user_id_idx ON payment_intents (user_id);
CREATE INDEX IF NOT EXISTS payment_intents_checkout_resource_id_idx ON payment_intents (checkout_resource_id);

-- Seed dos 6 planos com IDs canônicos espelhando DEFAULT_PLANS em
-- src/modules/account/account.service.js. ON CONFLICT DO NOTHING garante
-- idempotência quando a migration roda em banco onde planos foram criados
-- por mãos via dashboard de admin.
INSERT INTO subscription_plans (
  id, name, type, price, ad_limit, is_featured_enabled, has_store_profile,
  priority_level, is_active, validity_days, billing_model, description, benefits, recommended
) VALUES
  (
    'cpf-free-essential', 'Plano Gratuito (Essencial)', 'CPF', 0.00, 3, false, false,
    0, true, NULL, 'free',
    'Ideal para pessoa fisica que quer anunciar sem mensalidade.',
    '["Ate 3 anuncios ativos por CPF","Contato direto via WhatsApp","Sem comissao por venda"]'::jsonb,
    false
  ),
  (
    'cpf-premium-highlight', 'Plano Destaque Premium', 'CPF', 79.90, 10, true, false,
    50, true, 30, 'one_time',
    'Destaque no topo da busca com mais visibilidade para vender mais rapido.',
    '["Destaque no topo da busca","Badge premium no anuncio","Prioridade de exibicao por 30 dias"]'::jsonb,
    true
  ),
  (
    'cnpj-free-store', 'Plano Gratuito Loja', 'CNPJ', 0.00, 20, false, true,
    5, true, NULL, 'free',
    'Para lojas com CNPJ verificado iniciarem no portal sem mensalidade.',
    '["Ate 20 anuncios ativos","Perfil de loja ativo","Sem comissao nas vendas"]'::jsonb,
    false
  ),
  (
    'cnpj-store-start', 'Plano Loja Start', 'CNPJ', 299.90, 80, true, true,
    60, true, 30, 'monthly',
    'Plano de entrada para escalar anuncios da loja com destaque opcional.',
    '["Ate 80 anuncios","Perfil de loja personalizado","Destaques configuraveis"]'::jsonb,
    false
  ),
  (
    'cnpj-store-pro', 'Plano Loja Pro', 'CNPJ', 599.90, 200, true, true,
    80, true, 30, 'monthly',
    'Mais anuncios, destaque automatico e estatisticas avancadas.',
    '["Ate 200 anuncios","Destaque automatico","Dashboard de performance por cidade"]'::jsonb,
    true
  ),
  (
    'cnpj-evento-premium', 'Plano Evento Premium', 'CNPJ', 999.90, 350, true, true,
    100, true, 30, 'monthly',
    'Impulsionamento regional com banner promocional e campanha especial.',
    '["Banner promocional na home regional","Impulsionamento geolocalizado","Ate 350 anuncios ativos"]'::jsonb,
    false
  )
ON CONFLICT (id) DO NOTHING;

-- Coluna nova de plano canônico em users.
-- A FK exige que o seed acima tenha rodado primeiro (idem ON CONFLICT).
ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id TEXT REFERENCES subscription_plans(id);
CREATE INDEX IF NOT EXISTS users_plan_id_idx ON users (plan_id);

-- Backfill: traduz vocabulário legado (free / start / pro / evento-premium)
-- para os IDs novos. Quem não tem document_type = CNPJ é tratado como CPF.
UPDATE users
SET plan_id = CASE
  WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'free' AND UPPER(COALESCE(document_type, '')) = 'CNPJ'
    THEN 'cnpj-free-store'
  WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'start'
    THEN 'cnpj-store-start'
  WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'pro'
    THEN 'cnpj-store-pro'
  WHEN LOWER(BTRIM(COALESCE(plan, ''))) = 'evento-premium'
    THEN 'cnpj-evento-premium'
  ELSE 'cpf-free-essential'
END
WHERE plan_id IS NULL;
