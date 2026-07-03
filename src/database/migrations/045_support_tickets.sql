-- Tabela `support_tickets` (chamados de suporte usuário↔admin).
--
-- Um chamado é a "capa" de uma conversa em thread (mensagens em
-- 046_support_ticket_messages). O autor vem SEMPRE da sessão (users.id);
-- nunca é redigitado. Status controlado só pelo admin, com transições
-- automáticas na camada de serviço (aberto → em_andamento → resolvido, e
-- reabertura para aberto quando o usuário responde um chamado resolvido).
--
-- `last_message_at` é desnormalizado para ordenar a fila do admin sem JOIN
-- com a última mensagem (mesma ideia de índice de recência usada em outras
-- listas). É atualizado pela camada de serviço a cada nova mensagem.
--
-- Idempotente: CREATE TABLE IF NOT EXISTS + ADD COLUMN IF NOT EXISTS. Em
-- produção (se a tabela já existir) é no-op; em ambiente novo, cria completa.
-- Segue o padrão de 043_leads / 044_ad_events: BIGSERIAL PK, FK BIGINT,
-- TIMESTAMPTZ DEFAULT NOW(), status como TEXT (sem CHECK — validação na app).

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS support_tickets (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subject TEXT NOT NULL,
    category TEXT,
    status TEXT NOT NULL DEFAULT 'aberto',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    last_message_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Resiliência para eventual tabela legada parcial (colunas nullable no ADD;
  -- os NOT NULL só valem no caminho de criação nova).
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS user_id BIGINT;
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS subject TEXT;
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS category TEXT;
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'aberto';
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();
  ALTER TABLE support_tickets ADD COLUMN IF NOT EXISTS last_message_at TIMESTAMPTZ DEFAULT NOW();

  -- Índices: user_id (lista do próprio usuário), status (fila filtrada do
  -- admin), last_message_at DESC (ordenação por recência da fila do admin).
  CREATE INDEX IF NOT EXISTS idx_support_tickets_user_id ON support_tickets (user_id);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets (status);
  CREATE INDEX IF NOT EXISTS idx_support_tickets_last_message_at
    ON support_tickets (last_message_at DESC);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '045_support_tickets: tabela não criada/ajustada (%).', SQLERRM;
END $$;
