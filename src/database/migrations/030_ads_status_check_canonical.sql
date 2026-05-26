-- =============================================================================
-- 030 — Reconcile ads.status CHECK with canonical AD_STATUS (set actually used)
-- =============================================================================
-- Background:
--   Uma constraint CHECK chamada "ads_status_check" foi encontrada em
--   produção durante o smoke da Fase 0 (2026-05-25), rejeitando o valor
--   canônico 'paused' com:
--     new row for relation "ads" violates check constraint "ads_status_check"
--   Definição prévia em prod (não rastreada por nenhuma migration deste repo):
--     CHECK (status = ANY (ARRAY['active','reserved','sold']))
--   As migrations 004_baseline_ads e 025_ads_antifraud_moderation
--   explicitamente NÃO incluem CHECK em ads.status. Esta migration
--   reconcilia o schema com a lista CANÔNICA que o código de fato escreve.
--
-- Lista canônica (6 valores) — auditada em 2026-05-25:
--   active         INSERT na publicação (ads.create.pipeline), UPDATE em
--                  account "activate" e em admin moderation approve.
--   pending_review INSERT na publicação quando o ad é retido por risco
--                  antifraude (ads.create.pipeline) + backfill da
--                  migration 025.
--   paused         UPDATE pelo dono via account "pause"; UPDATE pelo
--                  admin via PATCH /api/admin/ads/:id/status.
--   rejected       UPDATE pelo admin via admin-moderation reject.
--   blocked        UPDATE pelo admin via PATCH /api/admin/ads/:id/status.
--   deleted        Soft delete em ads.repository (anunciante e admin).
--
-- Status NÃO incluídos e por quê (auditoria de caminhos de escrita):
--   draft     Definido em AD_STATUS e citado em listas semânticas, mas sem
--             caminho de escrita em produção. Reservado para fluxo futuro
--             "admin solicita correção sem rejeitar". Ao implementar:
--             nova migration (031_*) adicionando 'draft' ao CHECK + código.
--   sold      Definido em AD_STATUS, aparece em filtros de leitura
--             (account.service.js, ads.panel.service.js) e em testes de
--             naming, mas nenhum endpoint/worker escreve esse valor.
--             Reservado para futuro botão "marcar como vendido".
--   expired   Definido em AD_STATUS, aparece em filtros de leitura, mas
--             sem job de expiração implementado. Reservado para futuro
--             worker de expiração automática.
--   reserved  Estava na constraint antiga em produção
--             (CHECK status IN ('active','reserved','sold')), MAS não
--             existe em AD_STATUS nem em nenhum caminho de leitura/escrita
--             do código atual. SELECT em prod confirmou zero linhas com
--             esse valor. Removido sem substituto.
--
-- Comportamento da migration:
--   1) DROP CONSTRAINT IF EXISTS ads_status_check — idempotente.
--   2) ADD CONSTRAINT ads_status_check CHECK (status IN <6 valores>).
--
-- Risco / rollback:
--   - Se algum registro em ads tiver status fora desses 6, o ADD CONSTRAINT
--     falha e a transação inteira faz rollback — migration não marcada como
--     aplicada, schema permanece intacto.
--   - SELECT em prod (2026-05-25) confirmou: total 17 ads, todos 'active'.
--     Sem lixo legado.
--
-- Como ajustar no futuro:
--   1) Atualize src/shared/constants/status.js#AD_STATUS se for novo valor.
--   2) Implemente o caminho de escrita real no service correspondente.
--   3) Crie nova migration (ex.: 031_ads_status_check_add_<nome>.sql) com o
--      mesmo padrão DROP/ADD — NÃO edite esta migration, já aplicada.

ALTER TABLE ads DROP CONSTRAINT IF EXISTS ads_status_check;

ALTER TABLE ads
  ADD CONSTRAINT ads_status_check
  CHECK (status IN (
    'active',
    'pending_review',
    'paused',
    'rejected',
    'blocked',
    'deleted'
  ));

COMMENT ON CONSTRAINT ads_status_check ON ads IS
  'Conjunto canonico minimo (6) auditado em 2026-05-25: status escritos efetivamente em producao. draft/sold/expired estao em AD_STATUS mas sem caminho de escrita - incluir via nova migration quando implementados.';
