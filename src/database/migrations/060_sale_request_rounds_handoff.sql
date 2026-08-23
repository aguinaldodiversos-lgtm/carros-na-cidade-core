-- 060_sale_request_rounds_handoff.sql
-- Fase 4.7 — RODADAS DE OFERTAS, RESSELEÇÃO e HANDOFF DIRETO.
--
-- ============================================================================
-- A DECISÃO DE PRODUTO QUE ESTA MIGRATION SERVE
-- ============================================================================
-- O Carros na Cidade deixa de tentar reconstruir no sistema o que acontece
-- presencialmente. O papel da plataforma termina no MATCH:
--
--   proprietário publica → lojistas ofertam → proprietário ACEITA uma oferta →
--   o portal libera os dados comerciais da loja → as duas partes combinam a
--   avaliação direto, fora daqui.
--
-- Avaliação presencial, laudo, agenda, proposta final, aceite da proposta final,
-- pagamento, transferência e arbitragem NÃO são mais experiência ativa. As
-- estruturas das Fases 4.5 e 4.6 viram LEGADO: nada é apagado, nada é
-- reescrito, e as linhas que existem continuam legíveis.
--
-- Se a negociação presencial não prosperar, o proprietário informa apenas
-- "NÃO HOUVE ACORDO" — sem motivo, sem valor, sem culpa — e ganha duas saídas:
-- aceitar OUTRA oferta que já recebeu, ou abrir uma NOVA RODADA com outro valor
-- mínimo.
--
-- ============================================================================
-- POR QUE RODADAS, E NÃO `status = 'receiving_offers'` DE NOVO
-- ============================================================================
-- Reabrir a disputa apenas devolvendo o status misturaria propostas feitas sob
-- condições comerciais DIFERENTES. Uma oferta de R$ 62.500 feita quando o piso
-- era R$ 62.500 não significa a mesma coisa depois que o piso caiu para
-- R$ 58.000 — e as duas apareceriam lado a lado como se fossem contemporâneas.
--
-- A oferta passa a PERTENCER a uma rodada. O piso passa a pertencer à rodada, e
-- não à solicitação: é ele que define o que aquela disputa significava.
--
-- ============================================================================
-- O QUE ESTA MIGRATION NÃO FAZ
-- ============================================================================
-- Não apaga tabela, não apaga coluna, não apaga migration, não remove nenhum
-- status existente e não destrói dado nenhum. `sold`, `sale_completed` e
-- `deal_closed` continuam não existindo: o portal não sabe se houve venda, e um
-- estado sem writer é o erro que a migration 030 documenta em `ads.status`.
--
-- Não cria assinatura, plano, cobrança, comissão nem crédito.

-- ============================================================================
-- 1. AS RODADAS
-- ============================================================================
-- `minimum_accepted_price` mora AQUI, e não mais só em `sale_requests`. A
-- coluna da solicitação continua existindo e continua sendo o piso da rodada 1
-- (o backfill abaixo a copia) — ela não é apagada porque isso destruiria o
-- histórico de quem publicou antes desta fase, e porque o código de leitura
-- legado ainda a consulta.
--
-- Nullable pelo mesmo motivo que a 056 a fez nullable: solicitações anteriores à
-- Fase 4.3.3 têm `NULL`, e `NULL` significa "publicada antes da regra" — jamais
-- "sem piso" e jamais zero.

-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE A RODADA CASCATEIA — E A TRILHA NÃO
-- ────────────────────────────────────────────────────────────────────────────
-- Parece contradizer a 4.4.1, que tirou o CASCADE de tudo. Não contradiz: a
-- regra de lá é sobre TRILHA AUDITÁVEL — o registro de uma decisão que alguém
-- tomou, e que precisa sobreviver para poder ser contestada.
--
-- Uma rodada não é decisão de ninguém: é o CONTÊINER das ofertas, e as ofertas
-- já cascateiam desde a 055. Sem o CASCADE aqui, apagar uma solicitação SEM
-- seleção — caminho legítimo, e o que os scripts de reset usam — passaria a
-- falhar com 23503 por causa de uma linha que não guarda decisão nenhuma.
--
-- O que continua BLOQUEANDO o DELETE é `sale_request_offer_selections` e
-- `sale_request_handoff_outcomes`: essas guardam decisões, e a 4.4.1 decidiu —
-- com razão — que destruir histórico tem de ser declaração explícita.
CREATE TABLE IF NOT EXISTS sale_request_rounds (
  id BIGSERIAL PRIMARY KEY,
  sale_request_id BIGINT NOT NULL REFERENCES sale_requests (id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  minimum_accepted_price NUMERIC(14, 2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_rounds_number_check CHECK (round_number >= 1),
  CONSTRAINT sale_request_rounds_minimum_check
    CHECK (minimum_accepted_price IS NULL OR minimum_accepted_price > 0),

  -- A invariante do §43: DUAS rodadas 2 na mesma solicitação são impossíveis,
  -- mesmo que dois cliques simultâneos escapem do lock.
  CONSTRAINT sale_request_rounds_request_number_unique
    UNIQUE (sale_request_id, round_number)
);

-- Alvo das FKs compostas de `offers` e `selections`. `id` já é PK; esta UNIQUE
-- existe para PROVAR, no banco, que a rodada apontada é DESTA solicitação —
-- exatamente o padrão de `sale_request_offers_id_request_unique` (057).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_request_rounds_id_request_unique'
  ) THEN
    ALTER TABLE sale_request_rounds
      ADD CONSTRAINT sale_request_rounds_id_request_unique
      UNIQUE (id, sale_request_id);
  END IF;
END $$;

-- ============================================================================
-- 2. BACKFILL — A RODADA 1 DE TODO MUNDO
-- ============================================================================
-- Toda solicitação que já existe passa a ter a rodada 1, com o piso que ela
-- declarou. Isto roda ANTES de qualquer NOT NULL, e é o que impede a janela em
-- que dados existentes violariam as constraints novas.
--
-- `ON CONFLICT DO NOTHING` torna a migration reexecutável sem duplicar.

INSERT INTO sale_request_rounds (sale_request_id, round_number, minimum_accepted_price, created_at)
SELECT sr.id, 1, sr.minimum_accepted_price, sr.created_at
FROM sale_requests sr
ON CONFLICT (sale_request_id, round_number) DO NOTHING;

-- ============================================================================
-- 3. A RODADA CORRENTE
-- ============================================================================
-- Um INTEIRO, e não um ponteiro para `rounds.id`.
--
-- A alternativa (`current_round_id BIGINT REFERENCES rounds(id)`) tem um
-- problema de ordem que não se resolve sem `DEFERRABLE`: a solicitação nasce
-- ANTES da rodada dela, então um `NOT NULL` com FK falharia no próprio INSERT
-- de criação. Um número resolve isso sem constraint diferida — o par
-- (sale_request_id, current_round_number) casa a UNIQUE das rodadas, e o
-- `DEFAULT 1` faz toda solicitação nova nascer na rodada 1 sem que o código de
-- criação precise lembrar.
--
-- Não há FK sobre o par, e a razão é a mesma: ela seria violada no instante
-- entre o INSERT da solicitação e o INSERT da rodada. O que segura a coerência é
-- a transação de criação (que grava os dois juntos) e o fato de que TODA oferta
-- e TODA seleção carregam `round_id` provado por FK composta — se o ponteiro
-- apontasse para uma rodada inexistente, nada conseguiria ser gravado nela.

ALTER TABLE sale_requests
  ADD COLUMN IF NOT EXISTS current_round_number INTEGER NOT NULL DEFAULT 1;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_current_round_check'
  ) THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_current_round_check CHECK (current_round_number >= 1);
  END IF;
END $$;

-- ============================================================================
-- 4. A OFERTA PERTENCE A UMA RODADA
-- ============================================================================

ALTER TABLE sale_request_offers
  ADD COLUMN IF NOT EXISTS round_id BIGINT;

-- Backfill: toda oferta existente é da rodada 1 da própria solicitação.
UPDATE sale_request_offers o
   SET round_id = r.id
  FROM sale_request_rounds r
 WHERE r.sale_request_id = o.sale_request_id
   AND r.round_number = 1
   AND o.round_id IS NULL;

ALTER TABLE sale_request_offers
  ALTER COLUMN round_id SET NOT NULL;

DO $$
BEGIN
  -- A FK COMPOSTA. Prova que a rodada da oferta é uma rodada DESTA solicitação —
  -- uma FK simples `round_id -> rounds(id)` aceitaria a rodada 2 de OUTRO
  -- veículo, que é o conjunto impossível que o §50 exige recusar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_request_offers_round_request_fk'
  ) THEN
    -- `ON DELETE CASCADE` para acompanhar a rodada. A oferta já cascateia por
    -- `sale_request_id` desde a 055; sem o mesmo comportamento por este caminho,
    -- apagar a solicitação tentaria remover a rodada com ofertas ainda
    -- apontando para ela, e o DELETE morreria numa ordem de cascata que o
    -- PostgreSQL escolhe sozinho.
    ALTER TABLE sale_request_offers
      ADD CONSTRAINT sale_request_offers_round_request_fk
      FOREIGN KEY (round_id, sale_request_id)
      REFERENCES sale_request_rounds (id, sale_request_id)
      ON DELETE CASCADE;
  END IF;

  -- Alvo da FK de 4 colunas da seleção (seção 5). Estende a UNIQUE tripla da
  -- 057 com a rodada: é o que permite provar, no banco, que a oferta escolhida
  -- pertence à rodada declarada pela seleção.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offers_id_request_advertiser_round_unique'
  ) THEN
    ALTER TABLE sale_request_offers
      ADD CONSTRAINT sale_request_offers_id_request_advertiser_round_unique
      UNIQUE (id, sale_request_id, advertiser_id, round_id);
  END IF;
END $$;

-- "A proposta atual da loja" passa a ser por (solicitação, rodada, loja). O
-- índice acompanha a query nova; o da 055, por (advertiser_id, sale_request_id),
-- continua servindo às leituras que não são por rodada.
CREATE INDEX IF NOT EXISTS sale_request_offers_round_advertiser_idx
  ON sale_request_offers (round_id, advertiser_id, created_at DESC, id DESC);

-- ============================================================================
-- 5. A SELEÇÃO PERTENCE A UMA RODADA — E DEIXA DE SER ÚNICA
-- ============================================================================
-- Esta é a mudança mais delicada da migration, e merece ser lida inteira.
--
-- A 4.4 criou `UNIQUE (sale_request_id)`: UMA seleção por solicitação, para
-- sempre. Estava certo naquele produto — a escolha era irreversível.
--
-- Agora não é mais suficiente. Depois de "não houve acordo", o proprietário pode
-- aceitar OUTRA oferta, e a seleção anterior precisa PERMANECER: ela é a prova
-- de que houve um match com a Loja A, por aquele valor, naquela data.
--
-- A UNIQUE antiga é substituída por `UNIQUE (sale_request_id, offer_id)`, que
-- expressa a invariante que continua verdadeira: **a mesma oferta é aceita no
-- máximo uma vez**. Aceitar de novo a oferta que já falhou não é uma segunda
-- decisão — é um retry, e o banco o transforma em `rowCount = 0` em vez de numa
-- linha duplicada. É a mesma rede de segurança de sempre, só que na chave certa.
--
-- E "no máximo UM match ATUAL"? Essa invariante não vive aqui: vive em
-- `sale_requests.selected_offer_id`, que é UMA coluna e portanto
-- estruturalmente única. A tabela de seleções é HISTÓRICO; o ponteiro é ESTADO.
-- Tentar espremer as duas responsabilidades na mesma constraint foi o que
-- tornou a UNIQUE antiga insuficiente.

ALTER TABLE sale_request_offer_selections
  ADD COLUMN IF NOT EXISTS round_id BIGINT;

UPDATE sale_request_offer_selections s
   SET round_id = r.id
  FROM sale_request_rounds r
 WHERE r.sale_request_id = s.sale_request_id
   AND r.round_number = 1
   AND s.round_id IS NULL;

ALTER TABLE sale_request_offer_selections
  ALTER COLUMN round_id SET NOT NULL;

DO $$
BEGIN
  -- A FK de 4 colunas. Prova, de uma vez: a oferta existe, é DESTA solicitação,
  -- é DESTA loja e é DA RODADA que a seleção declara. Substitui a FK tripla da
  -- 4.4.1 acrescentando a rodada — sem ela, uma seleção poderia declarar rodada
  -- 2 apontando para uma oferta da rodada 1, que é exatamente o conjunto que o
  -- §50 exige recusar.
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_offer_round_fk'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_offer_round_fk
      FOREIGN KEY (offer_id, sale_request_id, advertiser_id, round_id)
      REFERENCES sale_request_offers (id, sale_request_id, advertiser_id, round_id);
  END IF;

  -- Alvo da FK da trilha de desfecho (seção 8).
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_id_request_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_id_request_unique
      UNIQUE (id, sale_request_id);
  END IF;
END $$;

-- A UNIQUE de UMA seleção por solicitação sai. É um índice (a 057 o criou com
-- CREATE UNIQUE INDEX), não uma constraint — por isso DROP INDEX.
DROP INDEX IF EXISTS sale_request_offer_selections_request_uidx;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_request_offer_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_request_offer_unique
      UNIQUE (sale_request_id, offer_id);
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────────────────────
-- A RELAXAÇÃO DELIBERADA: a UNIQUE (sale_request_id, advertiser_id) da 058
-- ────────────────────────────────────────────────────────────────────────────
-- A 058 criou `sale_request_offer_selections_request_advertiser_unique` como
-- ALVO da FK `sale_request_inspections_selected_store_fk`, que provava "esta
-- inspeção é da loja SELECIONADA".
--
-- Com histórico de seleções essa UNIQUE passa a PROIBIR um caminho legítimo: a
-- Loja A oferta na rodada 1, é aceita, não há acordo; na rodada 2 ela oferta de
-- novo e é aceita de novo. Duas seleções da mesma loja na mesma solicitação —
-- correto pelo produto, e recusado pela constraint com um 23505 ilegível.
--
-- A UNIQUE é então substituída por (sale_request_id, advertiser_id, round_id):
-- a mesma loja pode ser escolhida em rodadas diferentes, e continua não podendo
-- ser escolhida duas vezes DENTRO da mesma rodada.
--
-- Consequência: a FK da inspeção precisa sair, porque o alvo dela deixou de
-- existir. Isso NÃO é perda gratuita de integridade — é o reconhecimento de que
-- a proposição "a loja da inspeção é A loja selecionada" deixou de ser bem
-- definida quando passou a existir mais de uma seleção. `sale_request_inspections`
-- não tem rodada (é tabela do fluxo aposentado) e não vai ganhar uma.
--
-- O que a inspeção MANTÉM: FK para `sale_requests`, FK para `advertisers`, a FK
-- do horário confirmado e toda a cadeia da decisão pós-inspeção. Nenhuma linha é
-- apagada e nenhum dado histórico muda.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_request_inspections_selected_store_fk'
  ) THEN
    ALTER TABLE sale_request_inspections
      DROP CONSTRAINT sale_request_inspections_selected_store_fk;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_request_advertiser_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      DROP CONSTRAINT sale_request_offer_selections_request_advertiser_unique;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_request_advertiser_round_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_request_advertiser_round_unique
      UNIQUE (sale_request_id, advertiser_id, round_id);
  END IF;
END $$;

-- ============================================================================
-- 6. O ESTADO NOVO
-- ============================================================================
-- `handoff_failed` significa UMA coisa: houve um match, e o proprietário
-- informou que a negociação direta não prosseguiu.
--
-- NÃO significa lojista culpado, vendedor culpado, fraude, oferta inválida nem
-- veículo com defeito. O portal não sabe nada disso, não pergunta e não arbitra.
--
-- Todos os estados anteriores — inclusive os seis das Fases 4.5 e 4.6 —
-- permanecem no CHECK. Linhas legadas continuam válidas e legíveis; o que muda é
-- que nenhuma solicitação NOVA entra naquela máquina (o guard está no service).

ALTER TABLE sale_requests
  DROP CONSTRAINT IF EXISTS sale_requests_status_check;

ALTER TABLE sale_requests
  ADD CONSTRAINT sale_requests_status_check
  CHECK (status IN (
    'receiving_offers',
    'offer_selected',
    'handoff_failed',
    -- Legado das Fases 4.5 e 4.6. Mantidos para que as linhas existentes
    -- continuem válidas. Nenhum writer novo os alcança.
    'inspection_scheduled',
    'inspection_completed',
    'final_offer_submitted',
    'final_offer_declined',
    'final_offer_accepted',
    'final_offer_rejected',
    'cancelled'
  ));

-- ============================================================================
-- 7. COERÊNCIA DA SELEÇÃO — A PARTIÇÃO CONTINUA EXPLÍCITA
-- ============================================================================
-- `handoff_failed` entra do lado COM seleção: o ponteiro continua apontando para
-- a oferta que falhou, porque é ela que a tela mostra ("Não houve acordo com a
-- Loja A") enquanto o proprietário decide o que fazer.
--
-- Abrir uma NOVA RODADA devolve a solicitação a `receiving_offers` e por isso
-- LIMPA `selected_offer_id` e `selected_offer_at` — a partição exige. Isso não
-- destrói histórico nenhum: a trilha `sale_request_offer_selections` guarda
-- todas as seleções, com valor e data, e é ela que responde "o que aconteceu".
-- O ponteiro responde apenas "o que está valendo agora".
--
-- Duas listas enumeradas, nunca `status <> 'algo'` — o defeito que a 057
-- cometeu e a 058 teve de consertar.

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
          'handoff_failed',
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
-- 8. A TRILHA DO DESFECHO
-- ============================================================================
-- APPEND-ONLY, um evento por seleção.
--
-- `outcome` tem CHECK de UM valor só. Não é excesso de zelo: é a recusa
-- explícita de criar vocabulário sem writer. `agreed`, `cancelled_by_dealer` e
-- `vehicle_sold_elsewhere` não existem porque o portal não tem como saber
-- nenhum deles — e o §31 é explícito de que o sucesso NÃO precisa ser informado.
--
-- Sem coluna de motivo, sem valor renegociado, sem culpa. O Carros na Cidade não
-- arbitra a negociação, e um campo de texto livre aqui viraria o depoimento de
-- uma das partes sobre a outra, guardado para sempre e sem contraditório.

CREATE TABLE IF NOT EXISTS sale_request_handoff_outcomes (
  id BIGSERIAL PRIMARY KEY,
  sale_request_id BIGINT NOT NULL REFERENCES sale_requests (id),
  selection_id BIGINT NOT NULL,
  outcome TEXT NOT NULL,
  recorded_by_user_id BIGINT NOT NULL REFERENCES users (id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_handoff_outcomes_outcome_check
    CHECK (outcome = 'no_agreement'),

  -- Uma seleção é encerrada no máximo UMA vez. É a rede que torna o retry de
  -- "não houve acordo" idempotente mesmo sem o lock (§44).
  CONSTRAINT sale_request_handoff_outcomes_selection_unique UNIQUE (selection_id),

  -- FK COMPOSTA: prova que a seleção encerrada é DESTA solicitação. Uma FK
  -- simples aceitaria encerrar a seleção de outro negócio.
  CONSTRAINT sale_request_handoff_outcomes_selection_request_fk
    FOREIGN KEY (selection_id, sale_request_id)
    REFERENCES sale_request_offer_selections (id, sale_request_id)
);

-- Nenhum índice além dos implícitos. A leitura é sempre por solicitação, e o
-- UNIQUE de `selection_id` já cobre o acesso por seleção.

-- ============================================================================
-- COMENTÁRIOS
-- ============================================================================

COMMENT ON TABLE sale_request_rounds IS
  'Fase 4.7 - as rodadas de ofertas. O piso (minimum_accepted_price) pertence a RODADA, e nao mais so a solicitacao: e ele que define o que aquela disputa significava. Toda solicitacao comeca na rodada 1; uma rodada nova nasce quando o proprietario informa que nao houve acordo e escolhe receber novas ofertas.';

COMMENT ON COLUMN sale_request_rounds.minimum_accepted_price IS
  'Piso daquela rodada. NULL = solicitacao anterior a Fase 4.3.3, jamais "sem piso" nem zero. A coluna homonima em sale_requests continua existindo e guarda o piso da rodada 1.';

COMMENT ON COLUMN sale_requests.current_round_number IS
  'Fase 4.7 - qual rodada esta aberta. INTEIRO e nao ponteiro: a solicitacao nasce antes da rodada dela, e um NOT NULL com FK falharia no proprio INSERT de criacao sem DEFERRABLE. O par (id, current_round_number) casa a UNIQUE de sale_request_rounds.';

COMMENT ON COLUMN sale_request_offers.round_id IS
  'Fase 4.7 - a rodada em que a oferta foi feita. FK COMPOSTA com sale_request_id: prova que a rodada e DESTA solicitacao. Uma oferta da rodada 1 NUNCA e proposta atual da rodada 2.';

COMMENT ON COLUMN sale_request_offer_selections.round_id IS
  'Fase 4.7 - a rodada da seleção. A FK de 4 colunas prova que a oferta escolhida pertence a esta rodada.';

COMMENT ON TABLE sale_request_offer_selections IS
  'Fase 4.4, evoluida na 4.7 - trilha APPEND-ONLY dos aceites do proprietario. DEIXOU de ser uma por solicitacao: depois de "nao houve acordo" o proprietario pode aceitar outra oferta, e a selecao anterior PERMANECE como prova do match que houve. A invariante que sobra e UNIQUE(sale_request_id, offer_id): a mesma oferta e aceita no maximo uma vez. "No maximo um match ATUAL" vive em sale_requests.selected_offer_id, que e uma coluna e portanto estruturalmente unica. Sem UPDATE, sem DELETE, sem CASCADE.';

COMMENT ON TABLE sale_request_handoff_outcomes IS
  'Fase 4.7 - o desfecho informado pelo proprietario depois do handoff. APPEND-ONLY, um por selecao. Unico valor: no_agreement. NAO registra motivo, valor renegociado nem culpa - o portal nao arbitra a negociacao. O SUCESSO nao e registrado: a plataforma nao precisa saber, e nao pergunta.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | offer_selected | handoff_failed | cancelled sao a maquina ATIVA da Fase 4.7. inspection_scheduled, inspection_completed, final_offer_submitted, final_offer_declined, final_offer_accepted e final_offer_rejected sao LEGADO das Fases 4.5/4.6: continuam validos para as linhas que ja estao neles, e nenhum writer novo os alcanca. handoff_failed significa que houve match e o proprietario informou que a negociacao direta nao prosseguiu - nao significa culpa de ninguem. sold/sale_completed/deal_closed continuam nao existindo: o portal nao sabe se houve venda.';
