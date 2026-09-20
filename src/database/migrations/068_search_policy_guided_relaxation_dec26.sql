-- 068_search_policy_guided_relaxation_dec26.sql
--
-- Search Policy Engine — F2.2-B1 (DEC-26, certificada em 2026-09-20 sobre o
-- baseline normativo 6981b73d).
--
-- A 065 gravou a política de relaxação que valia antes da DEC-26: degraus
-- fixos em `steps` (preço +15%, ano −2, quilometragem +25%, raio "next_ring")
-- e um `priority_order` encabeçado por `radius`. A DEC-26 declarou todos
-- superados como política vigente e os substituiu por FRONTEIRAS e QUANTUMS —
-- o degrau passa a vir do estoque (boundary real) e estes números só dizem
-- quanto ele custa:
--
--   preço  PEQUENA até +5%, MEDIA até +10%, GRANDE acima; quantum R$ 1.000
--   ano    PEQUENA 1, MEDIA 2, GRANDE 3+; sem quantum
--   km     PEQUENA até +10.000, MEDIA até +25.000, GRANDE acima; quantum 5.000
--   raio   PEQUENA até +25, MEDIA até +50, GRANDE acima; quantum 5; teto 150
--   câmbio GRANDE por definição qualitativa
--   delta mínimo 1 resultado; no máximo 3 opções
--   priority_order: price, year, mileage, radius, transmission
--
-- O `steps` NÃO é preservado: o bloco inteiro de `relaxations` é substituído.
-- Deixá-lo para trás manteria no banco uma chave que descreve uma política que
-- a decisão normativa revogou, pronta para ser lida de novo por engano.
--
-- ADITIVA quanto ao restante: um único `jsonb_set` no caminho
-- `{relaxations}`. Nada fora dele é tocado — anéis, perfis, targets, TTL,
-- facetas e padrões de cidade explícita seguem como estiverem, inclusive
-- ajustes feitos pelo admin. As migrations 065, 066 e 067 não são alteradas.
--
-- IDEMPOTENTE pelo predicado `IS DISTINCT FROM`: rodar de novo sobre o valor
-- já correto não atualiza linha nenhuma (nem `updated_at`).
--
-- 150 km continua proibido no AUTOMÁTICO (DEC-11/18/23; migration 067). Aqui
-- ele é apenas o TETO da concessão — território que só existe por aceite
-- explícito do usuário, como raio manual.

UPDATE platform_settings
   SET value = jsonb_set(
                 value,
                 '{relaxations}',
                 '{
                    "show_when_total_below_target": true,
                    "max_options": 3,
                    "min_delta_to_offer": 1,
                    "price":        { "quantum": 1000, "small_max_pct": 0.05, "medium_max_pct": 0.10 },
                    "year":         { "small_max_delta": 1, "medium_max_delta": 2 },
                    "mileage":      { "quantum": 5000, "small_max_delta": 10000, "medium_max_delta": 25000 },
                    "radius":       { "quantum": 5, "small_max_delta": 25, "medium_max_delta": 50, "max_km": 150 },
                    "transmission": { "band": "GRANDE" },
                    "priority_order": ["price", "year", "mileage", "radius", "transmission"]
                  }'::jsonb,
                 true),
       updated_at = NOW()
 WHERE key = 'search_policy'
   AND value->'relaxations' IS DISTINCT FROM '{
                    "show_when_total_below_target": true,
                    "max_options": 3,
                    "min_delta_to_offer": 1,
                    "price":        { "quantum": 1000, "small_max_pct": 0.05, "medium_max_pct": 0.10 },
                    "year":         { "small_max_delta": 1, "medium_max_delta": 2 },
                    "mileage":      { "quantum": 5000, "small_max_delta": 10000, "medium_max_delta": 25000 },
                    "radius":       { "quantum": 5, "small_max_delta": 25, "medium_max_delta": 50, "max_km": 150 },
                    "transmission": { "band": "GRANDE" },
                    "priority_order": ["price", "year", "mileage", "radius", "transmission"]
                  }'::jsonb;
