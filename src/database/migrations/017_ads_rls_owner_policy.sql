-- Migration 017: Row Level Security na tabela ads
-- Segunda camada de defesa contra vazamento de dados entre usuários.
--
-- SELECT: sem restrição — listagens públicas do marketplace continuam funcionando.
--
-- INSERT / UPDATE / DELETE: verificação de dono via JOIN com advertisers.
--   • Se app.current_user_id NÃO estiver definido (conexão sem contexto de usuário),
--     a política é permissiva — compatibilidade retroativa com código legado.
--   • Se app.current_user_id ESTIVER definido (via withUserTransaction), o banco
--     bloqueia qualquer escrita cujo advertiser não pertença ao usuário informado.
--
-- Integração no app: db.withUserTransaction(userId, callback) define o setting
-- via `SELECT set_config('app.current_user_id', $1, true)` antes de cada operação
-- de escrita autenticada em ads (updateOwnedAdStatus, deleteOwnedAd).

ALTER TABLE ads ENABLE ROW LEVEL SECURITY;

-- SELECT: sem restrição (listagens públicas, admin, workers)
DROP POLICY IF EXISTS ads_select_open ON ads;
CREATE POLICY ads_select_open ON ads
  FOR SELECT
  USING (true);

-- ALL (INSERT/UPDATE/DELETE + SELECT fallback): owner only quando o setting está definido.
-- A cláusula IS NULL / = '' torna a política permissiva quando o app não informou o
-- user_id — garante que código legado continue funcionando sem alteração imediata.
DROP POLICY IF EXISTS ads_write_owner ON ads;
CREATE POLICY ads_write_owner ON ads
  AS PERMISSIVE
  FOR ALL
  USING (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR EXISTS (
      SELECT 1
      FROM advertisers adv
      WHERE adv.id = ads.advertiser_id
        AND adv.user_id::text = current_setting('app.current_user_id', true)
    )
  )
  WITH CHECK (
    current_setting('app.current_user_id', true) IS NULL
    OR current_setting('app.current_user_id', true) = ''
    OR EXISTS (
      SELECT 1
      FROM advertisers adv
      WHERE adv.id = ads.advertiser_id
        AND adv.user_id::text = current_setting('app.current_user_id', true)
    )
  );
