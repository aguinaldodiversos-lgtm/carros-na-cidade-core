-- 059_sale_request_owner_final_decision.sql
-- Fase 4.6 — a DECISÃO DO PROPRIETÁRIO sobre a proposta final.
--
-- A 4.5 terminou com a solicitação em `final_offer_submitted`: a loja
-- selecionada viu o carro, registrou a inspeção e apresentou um valor final. A
-- bola voltou para a pessoa que está vendendo, e ela ainda não respondeu.
--
-- Esta migration cria a resposta — e SÓ ela.
--
-- ============================================================================
-- O QUE `final_offer_accepted` SIGNIFICA, E O QUE ELE NÃO SIGNIFICA
-- ============================================================================
-- Significa exatamente uma coisa: **o proprietário aceitou a proposta comercial
-- final apresentada pela loja**.
--
-- NÃO significa veículo vendido, pagamento realizado, transferência concluída,
-- contrato assinado nem negócio liquidado. Nenhuma dessas coisas existe neste
-- produto, e nenhuma delas tem writer.
--
-- O aviso não é retórico. O estado se chama `final_offer_accepted` — e não
-- `sold`, `completed` ou `deal_closed` — porque o NOME é a primeira coisa que
-- alguém lê ao escrever a próxima fase, e um nome que promete conclusão faria a
-- fase seguinte herdar uma promessa que o produto nunca fez. Os rótulos de tela
-- carregam a mesma disciplina, e há teste travando as frases proibidas.
--
-- ============================================================================
-- POR QUE A RECUSA NÃO REABRE A DISPUTA
-- ============================================================================
-- `final_offer_rejected` é TERMINAL neste fluxo. Ele não volta para
-- `receiving_offers`, e essa é uma decisão de produto — não um esquecimento.
--
-- A 4.4 criou uma seleção preliminar auditável e ÚNICA
-- (`sale_request_offer_selections` tem UNIQUE por solicitação). A 4.5 criou uma
-- inspeção única e uma decisão pós-inspeção única, ambas amarradas por FK
-- composta à loja selecionada. Um simples `UPDATE ... SET status =
-- 'receiving_offers'` deixaria seis perguntas sem resposta no banco:
--
--   1. a seleção antiga ainda vale?
--   2. os lances antigos voltam a valer?
--   3. uma loja NOVA pode ser selecionada, com o UNIQUE de seleção já ocupado?
--   4. a inspeção anterior pertence a qual rodada?
--   5. a proposta final anterior pertence a qual ciclo?
--   6. a decisão do proprietário que acabou de ser gravada some, ou fica?
--
-- Nenhuma delas se resolve com um status. Todas se resolvem com um conceito de
-- RODADA, que é uma fase inteira — e inventá-la aqui, por omissão, produziria
-- exatamente o tipo de estado ambíguo que as migrations 057 e 058 tiveram de
-- consertar depois.
--
-- Então: reabertura não existe, e não acontece por acidente.
--
-- ============================================================================
-- O QUE ESTA MIGRATION NÃO CRIA
-- ============================================================================
-- Pagamento, PIX, sinal, escrow, comissão, contrato, assinatura eletrônica,
-- transferência, ATPV-e, entrega, avaliação/reputação, chat, contato direto,
-- contraproposta, nova proposta, edição da proposta final, reabertura, troca da
-- loja selecionada, nova inspeção, reagendamento, no-show, cronômetro e prazo.
--
-- Nenhum deles tem writer nesta fase.

-- ============================================================================
-- 1. OS DOIS ESTADOS NOVOS
-- ============================================================================
-- Dois, e cada um com um writer real: a transação de `decideFinalOffer`, no
-- ramo `accepted` e no ramo `rejected`.
--
-- `completed`, `sold`, `deal_closed`, `payment_pending`, `awaiting_payment` e
-- `documentation_pending` continuam NÃO existindo — pelo motivo que a migration
-- 030 documenta em `ads.status`: um valor criado antes do caminho que o grava
-- vira lista morta que todo filtro precisa considerar para sempre.

ALTER TABLE sale_requests
  DROP CONSTRAINT IF EXISTS sale_requests_status_check;

ALTER TABLE sale_requests
  ADD CONSTRAINT sale_requests_status_check
  CHECK (status IN (
    'receiving_offers',
    'offer_selected',
    'inspection_scheduled',
    'inspection_completed',
    'final_offer_submitted',
    'final_offer_declined',
    'final_offer_accepted',
    'final_offer_rejected',
    'cancelled'
  ));

-- ============================================================================
-- 2. A COERÊNCIA DA SELEÇÃO, COM A PARTIÇÃO EXPLÍCITA
-- ============================================================================
-- Os dois estados novos são POSTERIORES à seleção: chegar a `final_offer_accepted`
-- exige ter passado por `offer_selected`, `inspection_*` e `final_offer_submitted`.
-- Eles carregam `selected_offer_id` e `selected_offer_at` como todos os outros.
--
-- A forma continua sendo DUAS LISTAS ENUMERADAS, e nunca `status <> 'algo'`.
--
-- Isso não é preferência de estilo: a 057 escreveu
--
--     (status <> 'offer_selected' AND selected_offer_id IS NULL AND ...)
--
-- e o resultado foi que TODO estado criado depois caiu automaticamente do lado
-- "sem seleção" — a 058 não conseguiria mover uma linha sequer sem reescrever
-- este CHECK. Com as duas listas, um estado novo não pertence a nenhuma delas e
-- a migration que o criar falha na hora, em vez de silenciosamente colocá-lo do
-- lado errado.
--
-- O custo é ter de vir aqui a cada estado novo. Esse custo é o ponto.

DO $$
BEGIN
  ALTER TABLE sale_requests
    DROP CONSTRAINT IF EXISTS sale_requests_selected_offer_coherence_check;

  ALTER TABLE sale_requests
    ADD CONSTRAINT sale_requests_selected_offer_coherence_check
    CHECK (
      (
        status IN (
          'offer_selected',
          'inspection_scheduled',
          'inspection_completed',
          'final_offer_submitted',
          'final_offer_declined',
          'final_offer_accepted',
          'final_offer_rejected'
        )
        AND selected_offer_id IS NOT NULL
        AND selected_offer_at IS NOT NULL
      )
      OR
      (
        status IN ('receiving_offers', 'cancelled')
        AND selected_offer_id IS NULL
        AND selected_offer_at IS NULL
      )
    );
END $$;

-- ============================================================================
-- 3. O UNIQUE QUE CARREGA A PROVA
-- ============================================================================
-- Aqui está a decisão estrutural desta migration, e ela merece ser lida inteira.
--
-- A decisão do proprietário só pode existir sobre uma decisão pós-inspeção que
-- seja, ao mesmo tempo:
--
--   a) da MESMA solicitação;
--   b) da MESMA loja selecionada;
--   c) do tipo `final_offer` (e não `no_offer`);
--   d) com o valor final que a trilha vai fotografar.
--
-- (a) e (b) qualquer FK composta prova. (c) e (d) são o problema: uma FK não
-- compara coluna com CONSTANTE, então "aponte apenas para linhas cujo
-- `decision_type` seja `final_offer`" parece exigir trigger.
--
-- Não exige. A técnica é REDUNDÂNCIA CONTROLADA: a tabela filha guarda as
-- próprias cópias de `decision_type` e do valor, com um CHECK fixando a cópia do
-- tipo em `'final_offer'`, e a FK composta obriga essas cópias a CASAREM com a
-- linha-pai. O resultado é que o PostgreSQL — e não uma promessa do service —
-- garante que:
--
--   * apontar para uma decisão `no_offer` é impossível (o CHECK fixa
--     'final_offer' e a FK exige igualdade com o pai);
--   * `final_amount_snapshot` é EXATAMENTE o `final_amount` persistido pela
--     loja. Não "o service copiou direito": o banco recusa qualquer outro
--     número, inclusive um que viesse do navegador.
--
-- E `final_amount > 0` vem de graça: o CHECK
-- `sale_request_post_inspection_decisions_amount_check` já garante que toda
-- linha `final_offer` tem valor positivo, e agora só linhas `final_offer` são
-- alcançáveis.
--
-- `id` já é PRIMARY KEY, então este UNIQUE não restringe nada de novo na tabela
-- pai — ele existe para ser ALVO da FK, exatamente como
-- `sale_request_inspections_id_request_advertiser_unique` da 058. O alvo de uma
-- FK composta precisa ser um UNIQUE sobre EXATAMENTE aquelas colunas, nessa
-- ordem; um UNIQUE "parecido" não serve, e o erro é
-- "there is no unique constraint matching given keys".
--
-- `final_amount` é NULL nas linhas `no_offer`. Isso é inofensivo aqui: NULLs são
-- distintos num índice único, e como TODA coluna do lado filho é NOT NULL, o
-- MATCH SIMPLE (o default) enforça a FK integralmente — a válvula de escape do
-- MATCH SIMPLE só se abre quando alguma coluna FILHA é NULL, e nenhuma é.
--
-- MATCH FULL seria pior, não melhor: ele é sobre nulos no filho, e aqui não há
-- nulo nenhum no filho para ele governar.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_post_inspection_decisions_offer_identity_unique'
  ) THEN
    ALTER TABLE sale_request_post_inspection_decisions
      ADD CONSTRAINT sale_request_post_inspection_decisions_offer_identity_unique
      UNIQUE (id, sale_request_id, advertiser_id, decision_type, final_amount);
  END IF;
END $$;

-- ============================================================================
-- 4. A TRILHA DA DECISÃO DO PROPRIETÁRIO
-- ============================================================================
-- UMA linha por solicitação, APPEND-ONLY.
--
-- Sem `updated_at`, sem `deleted_at`, sem `status`. A decisão é um EVENTO
-- imutável: "em tal instante, tal pessoa aceitou/recusou tal valor". Um
-- `updated_at` aqui convidaria a corrigir uma decisão já tomada, e o valor de
-- uma trilha é justamente não poder ser corrigida.
--
-- Não há coluna de motivo. O §15 da especificação é explícito: recusar não exige
-- justificativa, e um campo obrigatório aqui criaria fricção numa saída que a
-- pessoa tem todo o direito de tomar em silêncio. Um campo OPCIONAL seria pior
-- ainda nesta fase — viraria o canal de texto livre que o produto decidiu não
-- ter, e a primeira pessoa a escrever um telefone nele entregaria o contato que
-- todo o desenho evita.

CREATE TABLE IF NOT EXISTS sale_request_owner_final_decisions (
  id BIGSERIAL PRIMARY KEY,

  sale_request_id BIGINT NOT NULL,
  post_inspection_decision_id BIGINT NOT NULL,
  advertiser_id BIGINT NOT NULL,

  -- A cópia do tipo da decisão da LOJA, fixada em 'final_offer' pelo CHECK
  -- abaixo e amarrada ao pai pela FK composta. É metade do mecanismo da seção 3.
  post_inspection_decision_type TEXT NOT NULL,

  -- A decisão da PESSOA: aceitou ou recusou.
  decision_type TEXT NOT NULL,

  -- A fotografia do valor. Igual, por construção do banco, ao `final_amount` da
  -- proposta final. NUNCA vem do cliente — ver a seção 3.
  final_amount_snapshot NUMERIC(14, 2) NOT NULL,

  -- AUTORIA, e nunca permissão. Quem pode decidir é o `owner_user_id` da
  -- solicitação, provado no WHERE do lock; esta coluna registra quem de fato
  -- clicou, para auditoria. As duas coisas não podem ser confundidas.
  decided_by_user_id BIGINT NOT NULL REFERENCES users(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_owner_final_decisions_type_check
    CHECK (decision_type IN ('accepted', 'rejected')),

  -- O CHECK que torna `no_offer` inalcançável. Sem ele a FK composta apenas
  -- exigiria "o mesmo tipo que o pai" — e aceitaria uma cópia 'no_offer'.
  CONSTRAINT sale_request_owner_final_decisions_source_type_check
    CHECK (post_inspection_decision_type = 'final_offer'),

  CONSTRAINT sale_request_owner_final_decisions_amount_check
    CHECK (final_amount_snapshot > 0),

  -- A FK de 5 colunas descrita na seção 3. Prova pertencimento (solicitação,
  -- loja), tipo (`final_offer`) e VALOR numa única constraint.
  CONSTRAINT sale_request_owner_final_decisions_source_fk
    FOREIGN KEY (
      post_inspection_decision_id,
      sale_request_id,
      advertiser_id,
      post_inspection_decision_type,
      final_amount_snapshot
    )
    REFERENCES sale_request_post_inspection_decisions (
      id, sale_request_id, advertiser_id, decision_type, final_amount
    ),

  -- FKs simples para as duas pontas. Redundantes em relação à composta acima no
  -- que diz respeito a ESTA linha, e mantidas pelo mesmo motivo que a 058 as
  -- manteve: elas são o que o `pg_constraint` mostra a quem for ler o schema
  -- procurando "quem aponta para sale_requests", e o custo é um índice de
  -- verificação que o PostgreSQL já teria.
  CONSTRAINT sale_request_owner_final_decisions_request_fk
    FOREIGN KEY (sale_request_id) REFERENCES sale_requests (id),
  CONSTRAINT sale_request_owner_final_decisions_advertiser_fk
    FOREIGN KEY (advertiser_id) REFERENCES advertisers (id)
);

-- UMA decisão por solicitação. É a rede que torna a corrida do §17 impossível
-- mesmo se o lock desaparecer: `accepted` e `rejected` simultâneos não podem
-- virar duas linhas, e o perdedor recebe 409 em vez de gravar a segunda.
CREATE UNIQUE INDEX IF NOT EXISTS sale_request_owner_final_decisions_request_uidx
  ON sale_request_owner_final_decisions (sale_request_id);

-- Nenhum outro índice. `advertiser_id` ganharia um "por segurança" que nenhuma
-- query desta fase usa: a leitura do lojista chega pelo `sale_request_id` (o
-- detalhe de UMA oportunidade), nunca por varredura da loja inteira. Índice sem
-- consumidor é custo de escrita permanente em troca de nada.

COMMENT ON TABLE sale_request_owner_final_decisions IS
  'Fase 4.6 - a decisao do proprietario sobre a proposta final: accepted ou rejected. UMA por solicitacao, APPEND-ONLY, sem updated_at e sem motivo. "accepted" significa que a proposta comercial foi aceita - NAO significa veiculo vendido, pagamento, transferencia nem contrato.';

COMMENT ON COLUMN sale_request_owner_final_decisions.final_amount_snapshot IS
  'Copia do final_amount da proposta final. A FK composta de 5 colunas obriga a igualdade NO BANCO: um valor enviado pelo navegador nao passa, mesmo que o service tentasse usa-lo.';

COMMENT ON COLUMN sale_request_owner_final_decisions.post_inspection_decision_type IS
  'Copia redundante do decision_type do pai, fixada em final_offer por CHECK. E o que permite a FK provar - sem trigger - que a decisao do proprietario nunca recai sobre um no_offer.';

COMMENT ON COLUMN sale_request_owner_final_decisions.decided_by_user_id IS
  'AUTORIA, nunca permissao. Quem pode decidir e o owner_user_id da solicitacao, provado no WHERE do lock.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | offer_selected | inspection_scheduled | inspection_completed | final_offer_submitted | final_offer_declined | final_offer_accepted | final_offer_rejected | cancelled. Cada um com writer real. final_offer_accepted e ACEITE DA PROPOSTA COMERCIAL - nao e venda concluida, pagamento nem transferencia. final_offer_rejected e final_offer_declined sao TERMINAIS: reabertura da disputa nao existe e nao acontece por omissao.';
