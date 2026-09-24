-- 071_search_policy_regional_floor_dec28_dec29.sql
--
-- Search Policy Engine — DEC-28 e DEC-29.
--
-- DEC-28: o território-base de descoberta é PISO, não teto. O território de uma
-- busca de produto passa a considerar também o AUTO do PERFIL em jogo, sobre a
-- liquidez já filtrada. Como consequência, os alvos dos perfis de produto
-- específico sobem, mantendo a gradação por especificidade de DEC-17:
--
--   SEARCH_MODEL       12 → 24
--   SEARCH_MODEL_YEAR   8 → 16
--   SEARCH_VERSION      4 → 12
--
-- DEC-29: piso regional recíproco (`regional_floor_km`) e teto de participação
-- por cidade externa (`city_share_cap`). Duas chaves novas no mesmo JSON.
--
-- A versão da política vai a `v2`. Isso NÃO é enfeite: `policy_version` entra na
-- chave de cache e no payload de `search.executed`, então a mudança invalida
-- cache de política e torna a telemetria comparável antes/depois — sem ela,
-- separar o efeito da mudança dependeria de adivinhar pelo horário.
--
-- ADITIVA e idempotente, no mesmo idioma da 067: `jsonb_set` em caminhos
-- específicos, sob WHERE que só age quando o valor ainda é o antigo. Nenhuma
-- outra chave é tocada — ajuste de facetas, relaxação ou TTL feito pelo admin
-- sobrevive. Rodar duas vezes não muda nada na segunda.
--
-- O código já traz estes mesmos valores em SEARCH_POLICY_DEFAULT, então a ordem
-- entre deploy e migration não quebra nada: sem a linha no banco, o fallback do
-- código se comporta pela norma; com ela, a política fica persistida e editável.

UPDATE platform_settings
   SET value = jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(
                         jsonb_set(value, '{profiles,SEARCH_MODEL,target}', '24'::jsonb, true),
                         '{profiles,SEARCH_MODEL_YEAR,target}', '16'::jsonb, true),
                       '{profiles,SEARCH_VERSION,target}', '12'::jsonb, true),
                     '{regional_floor_km}', '25'::jsonb, true),
                   '{city_share_cap}', '0.4'::jsonb, true),
                 '{version}', '"v2"'::jsonb, true),
       updated_at = NOW()
 WHERE key = 'search_policy'
   AND (
        (value#>>'{profiles,SEARCH_MODEL,target}')::numeric      < 24
     OR (value#>>'{profiles,SEARCH_MODEL_YEAR,target}')::numeric < 16
     OR (value#>>'{profiles,SEARCH_VERSION,target}')::numeric    < 12
     OR value->'regional_floor_km' IS NULL
     OR value->'city_share_cap'    IS NULL
     OR value->>'version' <> 'v2'
   );
