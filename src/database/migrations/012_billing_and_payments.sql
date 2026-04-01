-- Migration 012: billing, subscriptions, payment_intents
-- Idempotente: CREATE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS
-- Remove necessidade de CREATE TABLE inline em payments.service.js

-- ─── subscription_plans ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subscription_plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('CPF', 'CNPJ')),
  price NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ad_limit INTEGER NOT NULL DEFAULT 0,
  is_featured_enabled BOOLEAN NOT NULL DEFAULT false,
  has_store_profile BOOLEAN NOT NULL DEFAULT false,
  priority_level INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT true,
  validity_days INTEGER,
  billing_model TEXT NOT NULL DEFAULT 'free' CHECK (billing_model IN ('free', 'one_time', 'monthly')),
  description TEXT NOT NULL DEFAULT '',
  benefits JSONB NOT NULL DEFAULT '[]'::JSONB,
  recommended BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE subscription_plans IS 'Planos de assinatura disponíveis; populado via seed ou admin.';

-- ─── user_subscriptions ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_subscriptions (
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans (id),
  status TEXT NOT NULL CHECK (status IN ('active', 'expired', 'canceled', 'pending')),
  expires_at TIMESTAMPTZ,
  payment_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, plan_id, created_at)
);

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_user_id ON user_subscriptions (user_id);
CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status ON user_subscriptions (user_id, status);

COMMENT ON TABLE user_subscriptions IS 'Assinaturas ativas/históricas de cada usuário.';

-- ─── payments ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  plan_id TEXT NOT NULL REFERENCES subscription_plans (id),
  mercado_pago_id TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  amount NUMERIC(12, 2) NOT NULL,
  payment_type TEXT NOT NULL CHECK (payment_type IN ('one_time', 'recurring')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE payments IS 'Registros de pagamento via MercadoPago.';

-- ─── payment_intents ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_intents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('plan', 'boost')),
  plan_id TEXT REFERENCES subscription_plans (id),
  ad_id TEXT,
  boost_option_id TEXT,
  amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  checkout_resource_id TEXT,
  checkout_resource_type TEXT CHECK (checkout_resource_type IN ('preference', 'preapproval')),
  payment_resource_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'canceled')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payment_intents_user_id ON payment_intents (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_intents_status ON payment_intents (status);
CREATE INDEX IF NOT EXISTS idx_payment_intents_context ON payment_intents (context);

COMMENT ON TABLE payment_intents IS 'Intenções de pagamento MercadoPago; contexto: plan | boost.';
