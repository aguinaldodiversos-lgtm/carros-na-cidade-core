-- 049_user_notifications.sql
--
-- Caixa postal INTERNA de cada usuário (Fase 1 do Motor de Oportunidades).
--
-- ============================================================================
-- POR QUE UM DOMÍNIO NOVO, E NÃO `notification_queue`
-- ============================================================================
-- Existe no repositório um `src/workers/notification.worker.js` que lê uma
-- tabela `notification_queue`. Essa tabela NÃO é criada por nenhuma migration
-- (auditoria da Fase 0: é fantasma), o worker é CommonJS num backend ESM, não
-- está registrado em `WORKERS_REGISTRY` e faz `JOIN ads a ON a.id = q.ad_id`
-- — INNER JOIN, ou seja, qualquer notificação sem anúncio desaparece
-- silenciosamente da fila.
--
-- Os eventos que virão (oferta recebida, lance superado, visita agendada) não
-- têm anúncio no centro. Adaptar aquele desenho seria reescrevê-lo. Este
-- domínio nasce independente: NÃO referencia ads, advertisers, plans, payments
-- nem leads. A dependência é sempre `Produtos → Notificações`, nunca o inverso.
--
-- ============================================================================
-- TIPO DE `recipient_user_id` — decidido por evidência, não por dedução
-- ============================================================================
-- `users.id` é `integer` em produção, embora `002_baseline_users.sql` o declare
-- BIGSERIAL (divergência schema-real x migrations registrada na Fase 0.1).
--
-- Escolhemos BIGINT porque é exatamente o que `support_tickets.user_id` já faz
-- em produção — `bigint` com FK funcional para um `users.id` integer. O
-- PostgreSQL aceita a referência entre larguras diferentes, e essa combinação
-- está provada em produção há fases. Copiar o precedente é mais seguro do que
-- inventar um tipo "mais correto" que nunca foi exercitado neste banco.
--
-- ON DELETE CASCADE pelo mesmo motivo: é o que `support_tickets.user_id` usa, e
-- é o comportamento certo aqui — uma notificação interna sem destinatário não
-- tem utilidade independente nem valor de auditoria (diferente de
-- `support_ticket_messages.author_id`, que é SET NULL para preservar a thread).
--
-- ============================================================================
-- POR QUE ESTA MIGRATION NÃO ENGOLE ERRO
-- ============================================================================
-- As migrations 043–046 envolvem o DDL em `DO $$ ... EXCEPTION WHEN OTHERS THEN
-- RAISE NOTICE`. Aquilo era correto NAQUELE contexto: eram migrations
-- RETROATIVAS, escritas para tabelas que já existiam em produção, onde falhar
-- seria pior que não fazer nada.
--
-- Aqui é uma tabela genuinamente nova, e engolir a exceção significaria marcar
-- a migration como aplicada com a tabela inexistente — o app subiria e só
-- quebraria em runtime com "relation user_notifications does not exist". É
-- exatamente o modo de falha que a Fase 0.1 encontrou na migration 008 (guard
-- que a transformava em no-op silencioso). DDL idempotente (IF NOT EXISTS) sim;
-- erro silencioso não.

CREATE TABLE IF NOT EXISTS user_notifications (
  id BIGSERIAL PRIMARY KEY,

  -- Destinatário. SEMPRE users.id — PF, CNPJ e pending são todos usuários.
  -- NUNCA advertisers.id: a loja pode ser referenciada em entity_*/payload,
  -- mas quem "tem" a notificação é a conta que faz login.
  recipient_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Vocabulário de evento em TEXT livre, sem ENUM: adicionar
  -- `sale_request.outbid` no futuro não pode exigir migration. A allowlist,
  -- quando existir, vive na aplicação (notifications.constants.js).
  event_type TEXT NOT NULL,

  title TEXT NOT NULL,
  body TEXT NOT NULL,

  -- Contexto da notificação. Opcionais e SEM FK: polimórfico de propósito
  -- (mesma escolha de `analytics_events`) — apagar a entidade de origem não
  -- pode quebrar o histórico da caixa postal.
  entity_type TEXT,
  entity_id TEXT,

  -- Destino ao clicar. Só caminho interno; validado na aplicação
  -- (notifications.validation.js) contra open redirect.
  action_path TEXT,

  -- Dados auxiliares de exibição. NÃO é depósito de PII.
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Chave lógica do evento que gerou esta notificação. Obrigatória: toda
  -- notificação nasce de código interno, e todo código interno consegue
  -- descrever seu evento de forma estável.
  idempotency_key TEXT NOT NULL,

  -- Estado de leitura em UMA coluna só. Nada de `is_read` + `read_at` em
  -- paralelo: dois campos para um fato é convite para divergirem.
  read_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- IDEMPOTÊNCIA — no banco, não na aplicação
-- ============================================================================
-- Escopada por destinatário: o MESMO evento lógico gera uma notificação para
-- cada usuário envolvido (ex.: `sale_request:12:bid:34` notifica o proprietário
-- E o lojista superado). Um UNIQUE global em idempotency_key faria a segunda
-- inserção legítima falhar.
--
-- É constraint, e não `SELECT ... if (!exists) INSERT`, porque aquele padrão
-- tem janela de corrida: dois processos leem "não existe" e ambos inserem. Com
-- o índice único, o banco arbitra e o `ON CONFLICT DO NOTHING` do repositório
-- transforma a colisão em "já existia" — nunca em erro 500.
CREATE UNIQUE INDEX IF NOT EXISTS user_notifications_recipient_idempotency_uidx
  ON user_notifications (recipient_user_id, idempotency_key);

-- Listagem paginada do sino: filtra por destinatário e ordena por recência.
-- `id DESC` acompanha `created_at DESC` porque o cursor precisa de desempate
-- estável — sem ele, duas notificações com o mesmo timestamp podem ser
-- repetidas ou puladas entre páginas.
CREATE INDEX IF NOT EXISTS user_notifications_recipient_created_idx
  ON user_notifications (recipient_user_id, created_at DESC, id DESC);

-- Contador de não lidas. Índice PARCIAL: só as linhas com read_at IS NULL
-- entram, o que o mantém pequeno mesmo quando o histórico crescer — a maioria
-- das notificações antigas está lida e não ocupa espaço aqui.
CREATE INDEX IF NOT EXISTS user_notifications_recipient_unread_idx
  ON user_notifications (recipient_user_id)
  WHERE read_at IS NULL;

COMMENT ON TABLE user_notifications IS
  'Caixa postal interna por usuario (sino do painel). Independente de ads/planos/pagamentos; idempotencia por (recipient_user_id, idempotency_key).';

COMMENT ON COLUMN user_notifications.idempotency_key IS
  'Chave logica do evento de origem, escopada ao destinatario. Reprocessar o mesmo evento nao duplica.';

COMMENT ON COLUMN user_notifications.action_path IS
  'Caminho INTERNO de destino ao clicar. Validado na aplicacao (sem host, sem esquema) contra open redirect.';

COMMENT ON COLUMN user_notifications.read_at IS
  'NULL = nao lida. Timestamp = lida. Unica fonte do estado de leitura.';
