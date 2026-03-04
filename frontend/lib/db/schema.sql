-- PostgreSQL schema for billing and subscriptions (admin editable)

create table if not exists subscription_plans (
  id text primary key,
  name text not null,
  type text not null check (type in ('CPF', 'CNPJ')),
  price numeric(12,2) not null default 0,
  ad_limit integer not null default 0,
  is_featured_enabled boolean not null default false,
  has_store_profile boolean not null default false,
  priority_level integer not null default 0,
  is_active boolean not null default true,
  validity_days integer,
  billing_model text not null default 'free' check (billing_model in ('free', 'one_time', 'monthly')),
  description text not null default '',
  benefits jsonb not null default '[]'::jsonb,
  recommended boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists user_subscriptions (
  user_id text not null,
  plan_id text not null references subscription_plans(id),
  status text not null check (status in ('active', 'expired', 'canceled', 'pending')),
  expires_at timestamptz,
  payment_id text,
  created_at timestamptz not null default now(),
  primary key (user_id, plan_id, created_at)
);

create table if not exists payments (
  id bigserial primary key,
  user_id text not null,
  plan_id text not null references subscription_plans(id),
  mercado_pago_id text not null unique,
  status text not null check (status in ('pending', 'approved', 'rejected', 'canceled')),
  amount numeric(12,2) not null,
  payment_type text not null check (payment_type in ('one_time', 'recurring')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
