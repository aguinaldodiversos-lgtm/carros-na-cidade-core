-- 057_sale_request_offer_selection.sql
-- Fase 4.4 — a ESCOLHA do proprietário.
--
-- Uma linha de `sale_request_offer_selections` significa exatamente uma frase:
--
--     "o proprietário desta solicitação escolheu ESTA proposta, desta loja,
--      por este valor, neste instante".
--
-- ============================================================================
-- O QUE ESTA MIGRATION NÃO CRIA
-- ============================================================================
-- Não existe `completed`, `sold`, `rejected`, `withdrawn`, `expired` nem
-- `reopened`. Não existe coluna de prazo, de aceite final, de pagamento ou de
-- contato. Nenhuma delas tem writer nesta fase, e estado sem writer é o erro que
-- a migration 030 documenta em `ads.status` — `draft`/`sold`/`expired` estão lá
-- há fases sem caminho de escrita e viraram lista morta que todo filtro precisa
-- considerar. A 052 repetiu o argumento por escrito ao deixar `selected` de
-- fora; esta migration cria `offer_selected` porque agora existe o endpoint que
-- o escreve, e SÓ ele.
--
-- ============================================================================
-- POR QUE O ESTADO NÃO BASTA, E POR QUE A TABELA NOVA NÃO BASTA SOZINHA
-- ============================================================================
-- As duas metades desta migration respondem perguntas diferentes:
--
--   `sale_requests.selected_offer_id`  responde "QUAL é a proposta escolhida
--                                      AGORA?" — é estado corrente, lido no
--                                      caminho quente (detalhe do dono, detalhe
--                                      do lojista, recusa de nova proposta).
--
--   `sale_request_offer_selections`    responde "o que ACONTECEU?" — é evento
--                                      datado, append-only, com o valor
--                                      congelado no instante da decisão.
--
-- Guardar só o estado destruiria a resposta da segunda pergunta na primeira vez
-- que uma fase futura permitisse trocar de loja: o `UPDATE` sobrescreveria a
-- escolha anterior e ninguém saberia que ela existiu. Guardar só o evento
-- obrigaria toda leitura de tela a agregar a tabela de histórico para descobrir
-- o estado — a mesma agregação, repetida em cada um dos quatro call sites, com
-- quatro chances de divergir.
--
-- Nesta fase só pode existir UMA seleção por solicitação (§8 da especificação: a
-- transição é única e irreversível). O evento é registrado separadamente mesmo
-- assim, porque a trilha precisa existir ANTES de haver uma segunda linha para
-- registrar — criá-la depois exigiria reconstruir um passado que já não está em
-- lugar nenhum.
--
-- ============================================================================
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
-- ============================================================================
-- Mesma decisão de 049/050/051/052/055: para tabela genuinamente nova, falhar
-- alto é o comportamento certo. O runner (src/database/migrate.js) envolve cada
-- migration em BEGIN/COMMIT e faz ROLLBACK no erro; engolir a exceção marcaria a
-- migration como aplicada com a tabela inexistente — o modo de falha real da 008.
--
-- Os blocos `DO $$` que existem abaixo NÃO engolem erro: eles apenas tornam a
-- migration reexecutável (`IF NOT EXISTS` para constraint, que o PostgreSQL não
-- oferece na sintaxe de `ADD CONSTRAINT`). É o mesmo padrão da 056.

-- ---------------------------------------------------------------------------
-- 1. AS COLUNAS DE SELEÇÃO
-- ---------------------------------------------------------------------------
-- `BIGINT` seguindo o resto do domínio (`sale_request_offers.id` é BIGSERIAL).
-- `TIMESTAMPTZ` como todo instante do projeto.
--
-- SEM DEFAULT, nos dois. Um `DEFAULT NOW()` em `selected_offer_at` faria toda
-- linha nascer com data de seleção — inclusive as que nunca foram selecionadas —
-- e a data passaria a ser sobre a CRIAÇÃO da linha, não sobre a escolha. Para
-- registro existente o valor é NULL, e NULL aqui quer dizer exatamente
-- "ninguém escolheu nada": não há o que inventar.
ALTER TABLE sale_requests
  ADD COLUMN IF NOT EXISTS selected_offer_id BIGINT,
  ADD COLUMN IF NOT EXISTS selected_offer_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------------
-- 2. A FK — E POR QUE ELA NÃO TEM `ON DELETE`
-- ---------------------------------------------------------------------------
-- A fonte da seleção é a OFERTA EXATA, nunca `advertiser_id + amount` soltos
-- (§6). Guardar o par (loja, valor) responderia "quem e quanto" e perderia
-- "qual lance" — e a mesma loja tem vários lances na mesma solicitação, com
-- valores que podem coincidir depois de uma correção. A FK é o que impede a
-- seleção de apontar para uma proposta que não existe.
--
-- Nenhuma cláusula `ON DELETE`, portanto NO ACTION. As três alternativas foram
-- consideradas e as três são piores:
--
--   CASCADE   apagaria a SOLICITAÇÃO quando a proposta sumisse. O objeto
--             principal desaparecendo por causa de um satélite é exatamente o
--             inverso da relação.
--
--   SET NULL  produziria `status = 'offer_selected'` com `selected_offer_id`
--             nulo — estado que o CHECK abaixo proíbe. O `DELETE` falharia
--             assim mesmo, mas com uma violação de CHECK em vez de uma
--             violação de FK: o mesmo bloqueio, com diagnóstico pior.
--
--   RESTRICT  é o que NO ACTION já faz aqui (não há `DEFERRABLE` em jogo).
--
-- CONSEQUÊNCIA ACEITA E DESEJADA: `sale_request_offers` tem CASCADE em
-- `dealer_user_id` e `advertiser_id`, então apagar a linha de `users` ou de
-- `advertisers` de um lojista tentaria apagar as propostas dele — e o banco
-- RECUSA a remoção enquanto uma delas estiver selecionada. É a mesma escolha que
-- a 052 fez com `cities`: o efeito desejado é o banco dizer não.
--
-- Nenhum caminho da aplicação apaga `users` ou `advertisers` (verificado: não
-- existe `DELETE FROM users` nem `DELETE FROM advertisers` em src/). A restrição
-- só alcança remoção manual — que é justamente onde uma seleção apontando para o
-- vazio nasceria sem ninguém perceber.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_selected_offer_fk'
  ) THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_selected_offer_fk
      FOREIGN KEY (selected_offer_id) REFERENCES sale_request_offers(id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. O CHECK DE STATUS — DROP/ADD, como a 030 descreve
-- ---------------------------------------------------------------------------
-- `receiving_offers | offer_selected | cancelled`. Três valores, todos com
-- writer:
--
--   receiving_offers  o INSERT da publicação (052);
--   cancelled         `cancelForOwner` (4.1);
--   offer_selected    a transação de seleção desta fase.
--
-- O nome é `offer_selected` e não `selected` porque a 052 previu `selected` em
-- comentário e o vocabulário mudou por um motivo concreto: "selecionado" sozinho
-- não diz O QUE foi selecionado, e este produto vai selecionar outra coisa
-- depois (a avaliação presencial, na 4.5). Um estado chamado `selected` obrigaria
-- a fase seguinte a inventar `selected_2` ou a renomear o valor em produção.
ALTER TABLE sale_requests
  DROP CONSTRAINT IF EXISTS sale_requests_status_check;

ALTER TABLE sale_requests
  ADD CONSTRAINT sale_requests_status_check
  CHECK (status IN ('receiving_offers', 'offer_selected', 'cancelled'));

-- ---------------------------------------------------------------------------
-- 4. O CHECK DE COERÊNCIA — o estado e os campos não podem discordar
-- ---------------------------------------------------------------------------
-- Uma bi-implicação, escrita como duas metades exclusivas:
--
--   status  = 'offer_selected'  →  os DOIS campos preenchidos;
--   status <> 'offer_selected'  →  os DOIS campos nulos.
--
-- Sem ele, três estados impossíveis seriam expressáveis, e todos apareceriam
-- como bug de tela em vez de erro de banco:
--
--   `offer_selected` sem `selected_offer_id`  — a tela do dono diria "proposta
--                                               selecionada" sem ter o que
--                                               mostrar;
--   `selected_offer_id` com `receiving_offers` — a disputa continuaria aberta
--                                               com uma escolha já gravada;
--   `selected_offer_id` sem `selected_offer_at` — a escolha existiria sem época,
--                                               e o histórico não teria como ser
--                                               ordenado.
--
-- Toda linha ANTERIOR a esta migration satisfaz a segunda metade (status é
-- `receiving_offers` ou `cancelled`, e as duas colunas acabaram de nascer NULL),
-- então a constraint entra sem `NOT VALID` e sem varredura que falhe.
--
-- Não há subconsulta aqui — CHECK com subconsulta é proibido no PostgreSQL, e é
-- por isso que "a oferta pertence a esta solicitação" NÃO pode ser uma
-- constraint: essa prova vive na transação de seleção, dentro do lock.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_selected_offer_coherence_check'
  ) THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_selected_offer_coherence_check
      CHECK (
        (status =  'offer_selected' AND selected_offer_id IS NOT NULL AND selected_offer_at IS NOT NULL)
        OR
        (status <> 'offer_selected' AND selected_offer_id IS     NULL AND selected_offer_at IS     NULL)
      );
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 5. A TRILHA APPEND-ONLY
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sale_request_offer_selections (
  id BIGSERIAL PRIMARY KEY,

  -- A solicitação cuja disputa terminou.
  --
  -- CASCADE pelo mesmo argumento de `sale_request_offers`: cancelar NÃO apaga
  -- nada (cancelamento é mudança de status), e o único caminho que remove uma
  -- linha de `sale_requests` de verdade é o CASCADE de `users` — o dono apagou a
  -- conta. Nesse cenário, manter a seleção produziria um evento sobre um negócio
  -- que já não pode ser descrito, e que nenhuma tela sabe renderizar.
  sale_request_id BIGINT NOT NULL
    REFERENCES sale_requests(id) ON DELETE CASCADE,

  -- A OFERTA EXATA escolhida. É a fonte da seleção (§6), e não uma anotação:
  -- `advertiser_id` e `amount_snapshot` abaixo derivam dela, e existem para
  -- sobreviver a ela, não para substituí-la.
  --
  -- CASCADE aqui, e NO ACTION na coluna homônima de `sale_requests`, e a
  -- divergência é deliberada: aquela guarda o ESTADO — que não pode apontar para
  -- o vazio enquanto valer — e esta guarda o EVENTO, que só faz sentido enquanto
  -- a solicitação existir. As duas somem juntas, pela mesma cascata de
  -- `sale_requests`, e nenhuma das duas fica órfã da outra.
  offer_id BIGINT NOT NULL
    REFERENCES sale_request_offers(id) ON DELETE CASCADE,

  -- A LOJA escolhida, desnormalizada de propósito.
  --
  -- Ela é obtível por JOIN em `sale_request_offers`, e mesmo assim está aqui: a
  -- pergunta "quais lojas já foram escolhidas nesta cidade?" é sobre o EVENTO, e
  -- respondê-la por JOIN obrigaria a varrer o histórico inteiro de lances para
  -- chegar a uma coluna que a linha do evento já poderia ter.
  advertiser_id BIGINT NOT NULL
    REFERENCES advertisers(id) ON DELETE CASCADE,

  -- QUEM escolheu. É sempre o dono da solicitação nesta fase — a rota é escopada
  -- ao dono e não existe seleção por admin —, e a coluna existe assim mesmo:
  -- quando uma fase futura permitir que outra pessoa decida (um segundo titular,
  -- um operador de suporte), a trilha antiga continuará dizendo quem foi.
  -- Descobrir isso depois é impossível: `sale_requests.owner_user_id` diz quem é
  -- o dono HOJE, não quem apertou o botão naquele dia.
  selected_by_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- O valor CONGELADO no instante da decisão.
  --
  -- `sale_request_offers` é append-only e nenhum caminho a atualiza, então hoje
  -- este número é sempre igual a `offer.amount`. Ele existe mesmo assim porque a
  -- trilha precisa descrever a decisão SEM DEPENDER de outra tabela continuar
  -- igual: é o mesmo argumento do snapshot FIPE da 052. Uma correção
  -- administrativa futura em `amount` mudaria a resposta de "por quanto ele
  -- escolheu?" retroativamente — e é exatamente essa pergunta que a auditoria
  -- faz.
  --
  -- `NUMERIC(14,2)`, a convenção monetária do projeto. NUNCA float.
  amount_snapshot NUMERIC(14, 2) NOT NULL,

  selected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Mesma razão do CHECK de `sale_request_offers.amount`: valor não-positivo
  -- aqui seria um dado errado disfarçado de dado, e a trilha é justamente onde
  -- ninguém iria conferir.
  CONSTRAINT sale_request_offer_selections_amount_check CHECK (amount_snapshot > 0)
);

-- ---------------------------------------------------------------------------
-- SEM `updated_at`, SEM `status`, SEM `cancelled_at`
-- ---------------------------------------------------------------------------
-- A tabela é append-only: nenhum caminho da aplicação executa UPDATE ou DELETE
-- nela (§7). Uma coluna `updated_at` sugeriria o contrário para quem lesse o
-- schema e ficaria eternamente igual a `selected_at` — um campo que só pode
-- mentir. É a mesma decisão, pela mesma razão, de `sale_request_offers`.
--
-- Um `cancelled_at` seria pior ainda: descreveria uma reversão que esta fase
-- decidiu não ter (§8), e a coluna vazia convidaria a próxima pessoa a
-- implementá-la sem passar pela decisão de produto.

-- ---------------------------------------------------------------------------
-- O UNIQUE — "uma seleção por solicitação" escrito no BANCO
-- ---------------------------------------------------------------------------
-- Esta é a metade estrutural do §12 (seleção × seleção). A outra metade é o
-- `SELECT ... FOR UPDATE` na solicitação, e as duas fazem coisas diferentes:
--
--   o LOCK    serializa as duas transações, para que a segunda LEIA o estado que
--             a primeira gravou e possa recusar com a mensagem certa (409, com
--             código estável) em vez de estourar um erro de banco;
--
--   o UNIQUE  garante o invariante mesmo que alguém, um dia, remova o lock ou
--             abra um segundo caminho de escrita. Sem ele, o teste por mutação
--             do lock passaria a gravar duas seleções em vez de falhar.
--
-- Um dos dois sozinho não basta: só o lock deixa o invariante dependendo de todo
-- call site futuro lembrar de travar; só o UNIQUE transforma uma corrida normal
-- em erro 500 de constraint.
--
-- É UNIQUE por `sale_request_id`, e não por `(sale_request_id, offer_id)`: a
-- regra é "uma escolha", não "uma escolha por proposta". A segunda forma
-- permitiria selecionar a Loja A e depois a Loja B, que é justamente o que o §8
-- proíbe.
--
-- Quando (e SE) uma fase futura permitir trocar de loja, este índice é o lugar
-- onde essa decisão precisa passar — e é bom que precise.
CREATE UNIQUE INDEX IF NOT EXISTS sale_request_offer_selections_request_uidx
  ON sale_request_offer_selections (sale_request_id);

-- "Quais oportunidades esta loja venceu", em ordem cronológica. Alimenta a
-- leitura da área do lojista e qualquer relatório comercial futuro. Sem ele,
-- contar as vitórias de uma loja varreria as seleções de todas.
CREATE INDEX IF NOT EXISTS sale_request_offer_selections_advertiser_idx
  ON sale_request_offer_selections (advertiser_id, selected_at DESC, id DESC);

COMMENT ON TABLE sale_request_offer_selections IS
  'Fase 4.4 - trilha APPEND-ONLY da escolha preliminar do proprietario. Um evento por solicitacao (UNIQUE), com o valor congelado. Sem UPDATE, sem DELETE, sem status.';

COMMENT ON COLUMN sale_request_offer_selections.offer_id IS
  'A OFERTA EXATA escolhida - a fonte da selecao. advertiser_id e amount_snapshot derivam dela e existem para sobreviver a ela, nao para substitui-la.';

COMMENT ON COLUMN sale_request_offer_selections.amount_snapshot IS
  'Valor congelado no instante da decisao. Hoje sempre igual a offer.amount (a tabela de propostas e append-only); existe para que "por quanto ele escolheu?" nao mude retroativamente.';

COMMENT ON COLUMN sale_request_offer_selections.selected_by_user_id IS
  'Quem apertou o botao. Hoje sempre o dono; a coluna existe para que a trilha antiga continue respondendo quando uma fase futura permitir outro decisor.';

COMMENT ON COLUMN sale_requests.selected_offer_id IS
  'Fase 4.4 - a proposta escolhida, quando status = offer_selected. FK sem ON DELETE: o banco RECUSA apagar o lojista de uma proposta selecionada, em vez de deixar a selecao apontar para o vazio.';

COMMENT ON COLUMN sale_requests.selected_offer_at IS
  'Instante da escolha. NULL enquanto ninguem escolheu - sem DEFAULT, para que a data seja sobre a DECISAO e nunca sobre a criacao da linha.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | offer_selected | cancelled. Cada um com writer: o INSERT da publicacao, a transacao de selecao (4.4) e cancelForOwner. Reabertura, aceite final e venda concluida NAO existem - entram com migration propria quando tiverem quem as escreva.';
