-- 069_search_policy_relaxation_compat.sql
--
-- Search Policy Engine — F2.2-B1R-FIX.
--
-- Repara bancos que já executaram a versão ORIGINAL da 068 — a que removia
-- `steps` e `max_items` do bloco `relaxations`.
--
-- Por que uma migration nova, e não só a correção da 068: o runner
-- (`src/database/migrate.js`) rastreia migrations por NOME DE ARQUIVO, sem
-- checksum. Um banco que já registrou `068_search_policy_guided_relaxation_dec26`
-- em `schema_migrations` nunca mais lê aquele arquivo, por mais que o conteúdo
-- mude. A correção da 068 resolve instalações novas; só uma migration com
-- nome novo alcança as que já passaram por lá.
--
-- O que esta migration faz: devolve ao bloco `relaxations` as duas chaves
-- legadas, com os valores históricos da 065, sem tocar em nenhum campo DEC-26.
--
--   legacy compatibility only — ignored by DEC-26 engine
--
-- Elas existem para que o código anterior à B1 continue funcional durante um
-- deploy rolling ou um rollback de imagem: aquele código lê
-- `policy.relaxations?.steps || {}` e, sem a chave, produz zero concessões em
-- silêncio. O motor DEC-26 ignora as duas integralmente.
--
-- ADITIVA no sentido operacional, não apenas no SQL: dois `jsonb_set` em
-- caminhos NOVOS dentro de `{relaxations}`. Nenhum campo DEC-26 é
-- sobrescrito, nenhuma chave fora de `relaxations` é lida ou escrita, e um
-- ajuste de admin em qualquer outro lugar da política sobrevive.
--
-- IDEMPOTENTE: o predicado só encontra linha enquanto uma das duas chaves
-- estiver ausente. Reaplicar sobre o estado já correto não atualiza linha
-- nenhuma, nem `updated_at`. Num banco que instalou a 068 já corrigida, esta
-- migration é um no-op desde a primeira execução.
--
-- NÃO reativa a política revogada: `steps` e `max_items` não são lidos por
-- nada no código atual. A remoção definitiva fica para uma fase posterior,
-- quando o rollback para o código anterior não for mais necessário.

UPDATE platform_settings
   SET value = jsonb_set(
                 jsonb_set(
                   value,
                   '{relaxations,max_items}',
                   '3'::jsonb,
                   true),
                 '{relaxations,steps}',
                 '{
                    "radius":        "next_ring",
                    "year_from":     -2,
                    "price_max":     0.15,
                    "mileage_max":   0.25,
                    "transmission":  "remove",
                    "fuel":          "remove",
                    "body_type":     "remove",
                    "seller_kind":   "remove"
                  }'::jsonb,
                 true),
       updated_at = NOW()
 WHERE key = 'search_policy'
   AND value->'relaxations' IS NOT NULL
   AND (
        value->'relaxations'->'steps' IS NULL
     OR value->'relaxations'->'max_items' IS NULL
   );
