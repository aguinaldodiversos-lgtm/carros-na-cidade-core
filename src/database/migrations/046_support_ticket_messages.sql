-- Tabela `support_ticket_messages` (mensagens da thread de um chamado).
--
-- Cada linha é uma fala no vai-e-volta entre usuário e admin.
--   author_id   → users.id de quem escreveu. NULLABLE de propósito: se a
--                 conta for removida (ON DELETE SET NULL), a mensagem
--                 sobrevive no histórico do chamado.
--   author_role → snapshot 'user' | 'admin' no momento do envio, para saber
--                 quem falou mesmo que a conta suma (author_id vire NULL).
--
-- O ticket_id tem ON DELETE CASCADE: apagar o chamado apaga a thread inteira.
--
-- Idempotente no padrão de 043_leads / 044_ad_events. status/roles como TEXT
-- (validação na app). Índice (ticket_id, created_at) serve a leitura da
-- thread em ordem cronológica.

DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS support_ticket_messages (
    id BIGSERIAL PRIMARY KEY,
    ticket_id BIGINT NOT NULL REFERENCES support_tickets(id) ON DELETE CASCADE,
    author_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
    author_role TEXT NOT NULL,
    body TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS ticket_id BIGINT;
  ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS author_id BIGINT;
  ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS author_role TEXT;
  ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS body TEXT;
  ALTER TABLE support_ticket_messages ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

  -- Leitura da thread em ordem: filtra por ticket_id e ordena por created_at.
  CREATE INDEX IF NOT EXISTS idx_support_ticket_messages_ticket_created
    ON support_ticket_messages (ticket_id, created_at);
EXCEPTION
  WHEN OTHERS THEN
    RAISE NOTICE '046_support_ticket_messages: tabela não criada/ajustada (%).', SQLERRM;
END $$;
