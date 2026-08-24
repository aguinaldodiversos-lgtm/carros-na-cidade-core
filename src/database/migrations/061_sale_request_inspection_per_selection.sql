-- 061_sale_request_inspection_per_selection.sql
-- Fase 4.9A — A AGENDA PASSA A PERTENCER À SELEÇÃO, E NÃO À SOLICITAÇÃO.
--
-- ============================================================================
-- O QUE ESTAVA ERRADO
-- ============================================================================
-- A migration 058 declarou:
--
--     CREATE UNIQUE INDEX sale_request_inspections_request_uidx
--       ON sale_request_inspections (sale_request_id);
--
-- "UMA inspeção por solicitação." Estava certo no mundo da 4.5, onde a escolha
-- do proprietário era definitiva: uma solicitação tinha no máximo uma loja
-- escolhida, para sempre, e portanto no máximo uma avaliação a agendar.
--
-- A Fase 4.7 acabou com isso. Hoje a mesma solicitação pode ter várias
-- seleções ao longo da vida:
--
--     Loja A aceita → não houve acordo → Loja B aceita
--     Loja A aceita → não houve acordo → nova rodada → Loja A aceita DE NOVO
--
-- Com o índice acima, a segunda agenda simplesmente não entra: o INSERT viola a
-- unicidade. Não é um risco de vazamento — é a funcionalidade que não acontece.
--
-- E há o caso pior, que filtrar por `advertiser_id` na leitura NÃO resolve: se a
-- mesma loja é aceita duas vezes, a linha antiga casa pelo par
-- (sale_request_id, advertiser_id) e é lida como a agenda do match NOVO — com
-- um horário marcado para um negócio que já morreu.
--
-- A Fase 4.7 também REMOVEU a FK que amarrava a inspeção à loja selecionada
-- (`sale_request_inspections_selected_store_fk`), porque a UNIQUE de que ela
-- dependia teve de sair. Desde então, nada no banco prova que o advertiser da
-- inspeção é o match atual.
--
-- ============================================================================
-- O QUE ESTA MIGRATION FAZ
-- ============================================================================
-- Troca o dono da agenda. Ela deixa de pertencer à SOLICITAÇÃO e passa a
-- pertencer à SELEÇÃO — a linha de `sale_request_offer_selections` que registra
-- "esta loja, por este valor, nesta rodada, nesta data".
--
--     UNIQUE (sale_request_id)  →  UNIQUE (selection_id)
--
-- Uma agenda por match. Duas seleções, duas agendas, independentes. A agenda da
-- Loja A é inalcançável a partir do match da Loja B porque a leitura parte de
-- `selected_offer_id` → seleção atual → agenda daquela seleção.
--
-- ============================================================================
-- O QUE ESTA MIGRATION NÃO FAZ
-- ============================================================================
-- Não apaga tabela, não apaga coluna, não apaga linha e não reescreve dado.
-- Não toca em `sale_request_inspection_slots`, em rounds, em handoff, em
-- `no_agreement`, nem em nada da 4.7.
--
-- NÃO reativa a ficha de avaliação nem a proposta final. As colunas
-- `observed_*`, `sale_request_post_inspection_decisions` e
-- `sale_request_owner_final_decisions` continuam exatamente como estavam, e os
-- writers que as alimentavam continuam recusando com 409.
--
-- Não cria plano, cobrança, comissão nem crédito.

-- ============================================================================
-- 1. A COLUNA
-- ============================================================================
-- Nasce NULL para que o backfill possa rodar. Vira NOT NULL no passo 5, depois
-- que toda linha existente tiver dono.
ALTER TABLE sale_request_inspections
  ADD COLUMN IF NOT EXISTS selection_id BIGINT;

-- ============================================================================
-- 2. A CHAVE CANDIDATA QUE A FK PRECISA
-- ============================================================================
-- A FK do passo 4 tem TRÊS colunas, e não duas.
--
-- Com (selection_id, sale_request_id) o banco provaria que a seleção é da mesma
-- solicitação — mas não que é da mesma LOJA. Uma inspeção poderia declarar
-- `advertiser_id = A` apontando para a seleção da loja B, e nada reclamaria. A
-- terceira coluna fecha isso sem trigger e sem código.
--
-- `(id, ...)` é trivialmente único porque `id` é PK: esta constraint não pode
-- falhar, e existe só para ser ALVO da FK. É o mesmo padrão que a própria 058
-- usou em `sale_request_inspections_id_request_advertiser_unique`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_id_request_advertiser_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_id_request_advertiser_unique
      UNIQUE (id, sale_request_id, advertiser_id);
  END IF;
END $$;

-- ============================================================================
-- 3. O BACKFILL — E A RECUSA DE ADIVINHAR
-- ============================================================================
-- Toda inspeção existente é anterior à 4.7: os três writers da agenda estão em
-- 409 desde então, então nenhuma linha nova entrou depois. E antes da 4.7 a
-- tabela de seleções tinha UNIQUE (sale_request_id, advertiser_id) — uma
-- seleção por loja por solicitação.
--
-- Logo, o par (sale_request_id, advertiser_id) da inspeção identifica UMA
-- seleção. Isso é uma afirmação sobre os dados, e afirmação sobre dados se
-- verifica: o bloco abaixo CONTA os candidatos e ABORTA a migration se algum
-- não for exatamente 1.
--
-- Abortar é o comportamento certo. Uma inspeção sem seleção (0 candidatos) ou
-- com duas (2+) é um dado que ninguém previu, e escolher uma delas por
-- `min(id)` transformaria um caso desconhecido numa agenda atribuída ao match
-- errado — silenciosamente, e para sempre.
DO $$
DECLARE
  ambiguas INTEGER;
  detalhe  TEXT;
BEGIN
  SELECT count(*), string_agg(t.linha, '; ')
    INTO ambiguas, detalhe
  FROM (
    SELECT format(
             'inspection %s (sale_request %s, advertiser %s) -> %s seleções',
             i.id, i.sale_request_id, i.advertiser_id, count(s.id)
           ) AS linha
    FROM sale_request_inspections i
    LEFT JOIN sale_request_offer_selections s
      ON s.sale_request_id = i.sale_request_id
     AND s.advertiser_id   = i.advertiser_id
    GROUP BY i.id, i.sale_request_id, i.advertiser_id
    HAVING count(s.id) <> 1
  ) t;

  IF ambiguas > 0 THEN
    RAISE EXCEPTION
      'migration 061 abortada: % inspeção(ões) sem seleção única. %',
      ambiguas, detalhe
      USING HINT = 'Resolva manualmente antes de reaplicar. Nao adivinhe a selecao.';
  END IF;
END $$;

UPDATE sale_request_inspections i
   SET selection_id = s.id
  FROM sale_request_offer_selections s
 WHERE s.sale_request_id = i.sale_request_id
   AND s.advertiser_id   = i.advertiser_id
   AND i.selection_id IS NULL;

-- ============================================================================
-- 4. A FK COMPOSTA
-- ============================================================================
-- Prova, sem trigger, que a agenda pertence a uma seleção DESTA solicitação e
-- DESTA loja. As três colunas viajam juntas: mudar uma sozinha não casa mais.
--
-- Sem ON DELETE: seleção não é apagada (a trilha é append-only desde a 4.4), e
-- declarar CASCADE aqui removeria justamente a agenda que alguém consultaria
-- para entender o que aconteceu.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_inspections_selection_fk'
  ) THEN
    ALTER TABLE sale_request_inspections
      ADD CONSTRAINT sale_request_inspections_selection_fk
      FOREIGN KEY (selection_id, sale_request_id, advertiser_id)
      REFERENCES sale_request_offer_selections (id, sale_request_id, advertiser_id);
  END IF;
END $$;

-- ============================================================================
-- 5. A TROCA DE UNICIDADE
-- ============================================================================
-- A ordem importa: o índice novo entra ANTES de o antigo sair, para que a
-- tabela nunca fique sem garantia de unicidade nenhuma — nem por um comando.
CREATE UNIQUE INDEX IF NOT EXISTS sale_request_inspections_selection_uidx
  ON sale_request_inspections (selection_id);

-- E só agora "uma por solicitação" deixa de valer. Este é o único comando
-- destrutivo da migration, e o que ele destrói é uma REGRA, não um dado.
DROP INDEX IF EXISTS sale_request_inspections_request_uidx;

-- ============================================================================
-- 6. NOT NULL
-- ============================================================================
-- Depois do backfill e da FK: agenda órfã de seleção deixa de ser representável.
ALTER TABLE sale_request_inspections
  ALTER COLUMN selection_id SET NOT NULL;

-- ============================================================================
-- 7. LEITURA POR SELEÇÃO
-- ============================================================================
-- O caminho quente passa a ser "a agenda desta seleção". O índice único do
-- passo 5 já serve essa busca; este aqui serve a de baixo, por solicitação,
-- que continua existindo para as telas de histórico.
CREATE INDEX IF NOT EXISTS sale_request_inspections_request_idx
  ON sale_request_inspections (sale_request_id, id DESC);
