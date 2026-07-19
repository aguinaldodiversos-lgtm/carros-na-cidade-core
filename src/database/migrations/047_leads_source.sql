-- Registro de "lead enviado" via clique de WhatsApp (versão mínima).
--
-- Objetivo: quando um visitante clica num botão de WhatsApp na página do
-- veículo, gravamos uma linha em `leads` (mesma fonte que o card "Leads
-- recebidos" do painel já conta via account.service.getLeadCountsForOwner)
-- SEM capturar dado pessoal do visitante — só a contagem.
--
-- Duas alterações ADITIVAS e idempotentes sobre a tabela `leads` (migration
-- 043), mesmo padrão DO $$ / IF NOT EXISTS:
--   1. Coluna `source` — discrimina a origem do lead. Default 'form' para que
--      o caminho legado (leads.service.createLead, formulário de contato) seja
--      rotulado sozinho sem precisar de mudança; o clique de WhatsApp grava
--      'whatsapp' explicitamente. O contador do painel IGNORA `source` (conta
--      linhas por seller_id), então isto não altera o número de hoje — só
--      deixa a diferenciação disponível para o futuro.
--   2. `buyer_name` deixa de ser NOT NULL — o lead de WhatsApp não tem nome
--      (não capturamos), então precisa ser um INSERT válido sem essa coluna.
--      DROP NOT NULL é no-op se a coluna já for nullable em produção.
--
-- Idempotente: no-op em ambiente onde a coluna/constraint já estão como aqui.

DO $$
BEGIN
  ALTER TABLE leads ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'form';

  -- Lead de WhatsApp não carrega nome do comprador (sem captura de PII).
  ALTER TABLE leads ALTER COLUMN buyer_name DROP NOT NULL;

  -- Índice leve por origem — útil para relatórios futuros por canal. Não é
  -- usado pelo contador atual (que agrupa por seller_id), mas é barato agora.
  CREATE INDEX IF NOT EXISTS idx_leads_source ON leads (source);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '047_leads_source: ajuste em leads não aplicado (%).', SQLERRM;
END $$;
