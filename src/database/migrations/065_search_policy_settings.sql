-- 065_search_policy_settings.sql
--
-- Search Policy Engine v2.1 — Fase F1 (§3.3 e §3.4).
--
-- 1. `platform_settings.search_policy`: parâmetros de política do motor
--    (§2 do prompt, JSON exato). O código lê esta chave com fallback para a
--    constante `SEARCH_POLICY_DEFAULT` em
--    src/modules/ads/search-policy/policy-config.js — o teste
--    tests/search-policy/policy-config.test.js prova que os dois JSON são
--    idênticos. `regional.radius_km` deixa de ser lida pelo código novo (não é
--    removida: consumidores legados continuam lendo).
--
-- 2. `subscription_plans` (D7): `cpf-premium-highlight` e `cnpj-evento-premium`
--    com weight = 1.00. A camada 4 vem exclusivamente de `ads.highlight_until`;
--    nome de plano não é peso.
--
-- Ambos idempotentes: ON CONFLICT DO NOTHING e UPDATE com predicado.

INSERT INTO platform_settings (key, value, description)
VALUES (
  'search_policy',
  '{
    "version": "v1",
    "rings_auto": [0, 25, 50, 75, 150],
    "rings_manual": [0, 25, 50, 75],
    "profiles": {
      "BROWSE_CITY":        { "target": 20, "max_auto_radius": 75 },
      "BROWSE_CATEGORY":    { "target": 16, "max_auto_radius": 75 },
      "SEARCH_BRAND":       { "target": 16, "max_auto_radius": 150 },
      "SEARCH_MODEL":       { "target": 12, "max_auto_radius": 150 },
      "SEARCH_MODEL_YEAR":  { "target": 8,  "max_auto_radius": 150 },
      "SEARCH_VERSION":     { "target": 4,  "max_auto_radius": 150 }
    },
    "liquidity_cache_ttl_seconds": 900,
    "facets": {
      "open_max": 3,
      "min_options_to_render": 2,
      "price_buckets": [40000, 60000, 80000, 100000, 150000, 200000, 300000],
      "always_available_in_more_filters": ["brand","commercial_model","price","year","mileage","transmission","fuel","body_type","seller_kind"]
    },
    "relaxations": {
      "show_when_total_below_target": true,
      "max_items": 3,
      "steps": {
        "radius":        "next_ring",
        "year_from":     -2,
        "price_max":     0.15,
        "mileage_max":   0.25,
        "transmission":  "remove",
        "fuel":          "remove",
        "body_type":     "remove",
        "seller_kind":   "remove"
      },
      "priority_order": ["radius","transmission","price_max","year_from","mileage_max","fuel","body_type","seller_kind"]
    },
    "explicit_query_patterns": ["\\bem\\s+", "\\bde\\s+", "\\bperto\\s+de\\s+", "\\bna\\s+cidade\\s+de\\s+"]
  }'::jsonb,
  'Search Policy Engine v2.1 — anéis, perfis/targets, facetas, relaxações e padrões de cidade explícita. Fallback em código: SEARCH_POLICY_DEFAULT.'
)
ON CONFLICT (key) DO NOTHING;

UPDATE subscription_plans
SET weight = 1.00
WHERE id IN ('cpf-premium-highlight', 'cnpj-evento-premium')
  AND weight IS DISTINCT FROM 1.00;
