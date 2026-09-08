-- 066_search_policy_f2.sql
--
-- Search Policy Engine v2.1 — Fase F2 (§4.8 telemetria + D6 facetas).
--
-- 1. analytics_events.payload JSONB (NULL): o evento `search.executed` carrega
--    ~20 campos (perfil, raio, contagens, old/new do shadow) que não cabem nas
--    colunas fixas da tabela. Coluna ADITIVA; o coletor público continua
--    gravando NULL nela.
--
-- 2. platform_settings.search_policy: acrescenta facets.always_open = ["price"]
--    (decisão D6 — preço abre sempre; open_max inclui as always_open). Só
--    acrescenta se a chave ainda não existir, para não sobrescrever ajuste
--    feito pelo admin depois. O código tem o mesmo default em
--    SEARCH_POLICY_DEFAULT; tests/search-policy/policy-config.test.js prova
--    que 065 + este patch == constante.
--
-- 3. analytics_events.event_type: o CHECK da migration 036 é uma allowlist
--    FECHADA e 'search.executed' não está nela — sem isto o INSERT do evento
--    falha (23514) e a telemetria fica muda. A constraint é recriada como
--    SUPERCONJUNTO da definição atual (valores lidos do catálogo, não de uma
--    lista fixa — nenhum valor que só exista em produção é derrubado), NOT
--    VALID + VALIDATE para não segurar ACCESS EXCLUSIVE durante a varredura.
--    Idempotente: só age se 'search.executed' ainda não estiver na definição.
--    Nunca derruba a constraint sem a nova pronta (RAISE se o parse falhar).

ALTER TABLE analytics_events ADD COLUMN IF NOT EXISTS payload JSONB NULL;

COMMENT ON COLUMN analytics_events.payload IS
  'Campos extras do evento (JSON). Usado por search.executed (Search Policy Engine). NULL para o coletor público.';

UPDATE platform_settings
   SET value = jsonb_set(value, '{facets,always_open}', '["price"]'::jsonb, true),
       updated_at = NOW()
 WHERE key = 'search_policy'
   AND NOT (COALESCE(value->'facets', '{}'::jsonb) ? 'always_open');

DO $$
DECLARE
  current_def TEXT;
  allowed     TEXT[];
  in_list     TEXT;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO current_def
    FROM pg_constraint
   WHERE conname = 'analytics_events_event_type_chk'
     AND conrelid = 'analytics_events'::regclass;

  IF current_def IS NULL THEN
    RETURN; -- este banco não tem a allowlist da 036; nada a estender.
  END IF;

  IF POSITION('''search.executed''' IN current_def) > 0 THEN
    RETURN; -- já estendida.
  END IF;

  SELECT array_agg(m[1]) INTO allowed
    FROM regexp_matches(current_def, '''([^'']+)''::text', 'g') AS m;

  IF allowed IS NULL OR cardinality(allowed) = 0 THEN
    RAISE EXCEPTION '066: não foi possível ler a allowlist atual de analytics_events_event_type_chk (%)', current_def;
  END IF;

  SELECT string_agg(quote_literal(v), ', ') INTO in_list
    FROM unnest(allowed || ARRAY['search.executed']) AS v;

  ALTER TABLE analytics_events DROP CONSTRAINT analytics_events_event_type_chk;
  EXECUTE format(
    'ALTER TABLE analytics_events ADD CONSTRAINT analytics_events_event_type_chk CHECK (event_type IN (%s)) NOT VALID',
    in_list
  );
END $$;

ALTER TABLE analytics_events VALIDATE CONSTRAINT analytics_events_event_type_chk;
