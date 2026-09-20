-- 067_search_policy_auto_cap_75.sql
--
-- Search Policy Engine — F2.2-A1 (v3 certificada, MET-01).
--
-- A v3 fixa o teto da expansão AUTOMÁTICA em 75 km para QUALQUER perfil:
--
--   DEC-11  o degrau de 150 km deixa de ser expansão automática e vira
--           concessão de Guided Relaxation oferecida ao usuário;
--   DEC-18  o território-base de /comprar fica limitado aos anéis 0/25/50/75;
--   DEC-23  nenhum anel automático normal passa de 75;
--   v3 §5   "o teto automático de qualquer perfil é 75 km".
--
-- A 065 gravou `rings_auto` com 150 e `max_auto_radius: 150` em SEARCH_BRAND,
-- SEARCH_MODEL, SEARCH_MODEL_YEAR e SEARCH_VERSION — era o que valia quando a
-- F2 foi escrita (2026-09-08), antes das decisões acima (09 e 10/09). Esta
-- migration alinha o valor persistido ao da v3 e ao `SEARCH_POLICY_DEFAULT`
-- (tests/search-policy/policy-config.test.js prova que os dois coincidem).
--
-- 150 km NÃO é removido de `rings_manual` nem da configuração de relaxação:
-- ele continua sendo destino legítimo por raio manual explícito ou por
-- concessão aceita. O que sai daqui é só a expansão automática.
--
-- ADITIVA e idempotente: `jsonb_set` em quatro caminhos específicos, sob
-- predicado que só age enquanto algum valor antigo ainda estiver lá. Nenhuma
-- outra chave da política é tocada — ajuste feito pelo admin em facetas,
-- relaxações ou TTL sobrevive.

UPDATE platform_settings
   SET value = jsonb_set(
                 jsonb_set(
                   jsonb_set(
                     jsonb_set(
                       jsonb_set(value, '{rings_auto}', '[0, 25, 50, 75]'::jsonb, true),
                       '{profiles,SEARCH_BRAND,max_auto_radius}', '75'::jsonb, true),
                     '{profiles,SEARCH_MODEL,max_auto_radius}', '75'::jsonb, true),
                   '{profiles,SEARCH_MODEL_YEAR,max_auto_radius}', '75'::jsonb, true),
                 '{profiles,SEARCH_VERSION,max_auto_radius}', '75'::jsonb, true),
       updated_at = NOW()
 WHERE key = 'search_policy'
   AND (
        value->'rings_auto' @> '[150]'::jsonb
     OR (value#>>'{profiles,SEARCH_BRAND,max_auto_radius}')::numeric      > 75
     OR (value#>>'{profiles,SEARCH_MODEL,max_auto_radius}')::numeric      > 75
     OR (value#>>'{profiles,SEARCH_MODEL_YEAR,max_auto_radius}')::numeric > 75
     OR (value#>>'{profiles,SEARCH_VERSION,max_auto_radius}')::numeric    > 75
   );
