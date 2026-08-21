-- 057_sale_request_offer_selection.sql
-- Fase 4.4 — a ESCOLHA do proprietário.
-- Fase 4.4.1 — o hardening de integridade referencial, aplicado IN-PLACE.
--
-- Uma linha de `sale_request_offer_selections` significa exatamente uma frase:
--
--     "o proprietário desta solicitação escolheu ESTA proposta, desta loja,
--      por este valor, neste instante".
--
-- ============================================================================
-- POR QUE A 4.4.1 EDITOU ESTA MIGRATION EM VEZ DE CRIAR A 058
-- ============================================================================
-- Uma migration é contrato a partir do momento em que sai da branch. Esta não
-- saiu: não está na main, a branch nunca foi pushada, e o único banco que a
-- aplicou é o de teste local, descartável e recriado por `npm run e2e:prepare`.
--
-- Enquanto isso for verdade, editá-la é a operação correta — e uma 058 que
-- consertasse a 057 deixaria as duas para sempre no histórico, obrigando todo
-- leitor futuro a ler a versão errada antes de descobrir a certa.
--
-- Quando esta migration for mergeada, essa janela fecha: qualquer mudança
-- posterior passa a exigir migration nova.
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
-- 2. AS CHAVES CANDIDATAS COMPOSTAS DE `sale_request_offers`
-- ---------------------------------------------------------------------------
-- Elas parecem redundantes — `id` já é PRIMARY KEY, então a unicidade delas é
-- consequência, não conquista. Não é para isso que existem.
--
-- Existem porque o PostgreSQL só aceita como ALVO de uma FK um conjunto de
-- colunas coberto por PK ou UNIQUE **exatamente**: não vale prefixo de índice,
-- não vale subconjunto, não vale "está contido em". Para escrever uma FK que
-- prove PERTENCIMENTO (e não só existência), o alvo precisa ser declarado.
--
-- ────────────────────────────────────────────────────────────────────────────
-- POR QUE DUAS, E NÃO UMA
-- ────────────────────────────────────────────────────────────────────────────
-- São dois referenciadores com formas diferentes, e nenhum dos dois consegue
-- usar a chave do outro:
--
--   `sale_requests`  tem (selected_offer_id, id) — DUAS colunas. Não tem
--                    advertiser, e criar `selected_advertiser_id` só para casar
--                    uma chave seria inventar coluna para satisfazer constraint.
--
--   a TRILHA         tem (offer_id, sale_request_id, advertiser_id) — TRÊS. O
--                    `advertiser_id` dela é desnormalizado (ver o comentário na
--                    tabela), e desnormalização sem constraint é exatamente o
--                    campo que diverge em silêncio.
--
-- Uma UNIQUE tripla não serve de alvo para a FK de duas colunas, e uma UNIQUE
-- dupla não prova o advertiser. Duas chaves é o MENOR modelo que expressa as
-- duas invariantes — não é "mais segurança por precaução".
--
-- ────────────────────────────────────────────────────────────────────────────
-- O CUSTO, MEDIDO E ACEITO
-- ────────────────────────────────────────────────────────────────────────────
-- Dois índices únicos a mais por INSERT em `sale_request_offers`. A tabela é
-- append-only e cresce por LANCE: dezenas de linhas por solicitação, não
-- milhões. O custo de escrita é irrelevante nessa ordem de grandeza, e a
-- alternativa — deixar a prova de pertencimento só no service — é a classe de
-- invariante que este repositório já viu falhar por um call site novo que
-- esqueceu a checagem.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sale_request_offers_id_request_unique'
  ) THEN
    ALTER TABLE sale_request_offers
      ADD CONSTRAINT sale_request_offers_id_request_unique
      UNIQUE (id, sale_request_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offers_id_request_advertiser_unique'
  ) THEN
    ALTER TABLE sale_request_offers
      ADD CONSTRAINT sale_request_offers_id_request_advertiser_unique
      UNIQUE (id, sale_request_id, advertiser_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 3. A FK COMPOSTA — "a oferta existe" NÃO É SUFICIENTE
-- ---------------------------------------------------------------------------
-- A fonte da seleção é a OFERTA EXATA, nunca `advertiser_id + amount` soltos
-- (§6 da 4.4). Guardar o par (loja, valor) responderia "quem e quanto" e
-- perderia "qual lance" — e a mesma loja tem vários lances na mesma
-- solicitação, com valores que podem coincidir depois de uma correção.
--
-- Uma FK SIMPLES `selected_offer_id → sale_request_offers(id)` prova que a
-- oferta EXISTE. Ela não prova que a oferta é DESTA solicitação, e o banco
-- aceitaria sem reclamar:
--
--     sale_requests    id = 100
--     offer            id = 900, sale_request_id = 200
--
--     UPDATE sale_requests
--        SET selected_offer_id = 900, selected_offer_at = NOW(),
--            status = 'offer_selected'
--      WHERE id = 100;                       -- ← aceito pela FK simples
--
-- O service da 4.4 impede isso (a prova de pertencimento está no `WHERE` de
-- `findOfferForSelection`, dentro do lock), e continua impedindo — mas uma
-- invariante desse peso não pode depender de todo caminho futuro lembrar de
-- consultá-la. Um script de manutenção, um SQL manual ou um endpoint novo
-- passariam por baixo.
--
-- A FK composta carrega a PRÓPRIA `sale_requests.id` no lado esquerdo:
--
--     (selected_offer_id, id) → sale_request_offers (id, sale_request_id)
--
-- Ler em voz alta: "a oferta que eu selecionei tem, como solicitação, EU
-- MESMA". O estado inválido deixa de ser proibido e passa a ser inexprimível.
--
-- ────────────────────────────────────────────────────────────────────────────
-- MATCH SIMPLE — E POR QUE `MATCH FULL` QUEBRARIA TUDO
-- ────────────────────────────────────────────────────────────────────────────
-- O padrão do PostgreSQL é MATCH SIMPLE: se QUALQUER coluna da FK for NULL, a
-- constraint é satisfeita sem consultar o alvo. Aqui isso é exatamente o
-- comportamento desejado, e não uma frouxidão tolerada:
--
--   `selected_offer_id` NULL  → linha sem seleção (receiving_offers/cancelled).
--                               Passa sem checagem. `id` nunca é NULL, mas basta
--                               UMA coluna nula para o par ser dispensado.
--
--   `selected_offer_id` cheio → as duas colunas são NOT NULL, e o par INTEIRO é
--                               verificado contra a chave candidata.
--
-- `MATCH FULL` faria o oposto do que se quer: ele exige que TODAS as colunas
-- sejam nulas ou TODAS não-nulas, e como `id` nunca é nulo, toda linha sem
-- seleção seria REJEITADA. A migration falharia na primeira linha de qualquer
-- banco com dados — inclusive o de produção.
--
-- ────────────────────────────────────────────────────────────────────────────
-- SEM `ON DELETE` (NO ACTION) — inalterado desde a 4.4
-- ────────────────────────────────────────────────────────────────────────────
--   CASCADE   apagaria a SOLICITAÇÃO quando a proposta sumisse. O objeto
--             principal desaparecendo por causa de um satélite é o inverso da
--             relação.
--
--   SET NULL  produziria `status = 'offer_selected'` com `selected_offer_id`
--             nulo — estado que o CHECK abaixo proíbe. O `DELETE` falharia
--             assim mesmo, mas com violação de CHECK em vez de FK: o mesmo
--             bloqueio, com diagnóstico pior. (E com FK composta seria pior
--             ainda: `SET NULL` só faz sentido sobre a coluna referenciante, e
--             `id` também está no par.)
--
--   RESTRICT  é o que NO ACTION já faz aqui (não há `DEFERRABLE` em jogo).
--
-- CONSEQUÊNCIA ACEITA E DESEJADA: apagar a linha de `users` ou de `advertisers`
-- de um lojista tentaria apagar as propostas dele por CASCADE — e o banco RECUSA
-- enquanto uma delas estiver selecionada. É a mesma escolha que a 052 fez com
-- `cities`: o efeito desejado é o banco dizer não.
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
      FOREIGN KEY (selected_offer_id, id)
      REFERENCES sale_request_offers (id, sale_request_id);
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 4. O CHECK DE STATUS — DROP/ADD, como a 030 descreve
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
-- 5. O CHECK DE COERÊNCIA — o estado e os campos não podem discordar
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
-- 6. A TRILHA APPEND-ONLY
-- ---------------------------------------------------------------------------
-- ────────────────────────────────────────────────────────────────────────────
-- NENHUMA FK DESTA TABELA USA `ON DELETE CASCADE`
-- ────────────────────────────────────────────────────────────────────────────
-- A primeira versão desta migration usava CASCADE nas quatro, com o argumento de
-- que "um evento sobre uma solicitação apagada não pode ser descrito por tela
-- nenhuma". O argumento é sobre RENDERIZAÇÃO, e esta tabela não existe para ser
-- renderizada: ela existe para responder "o que aconteceu?" quando alguém
-- contesta um negócio.
--
-- CASCADE numa trilha auditável é uma contradição em si. Ele diz: *este registro
-- desaparece, em silêncio, quando outra linha for removida* — e o momento em que
-- uma trilha some sozinha é exatamente o momento em que ela seria consultada.
-- Pior: some sem log, sem erro e sem ninguém saber que existiu.
--
-- Com NO ACTION o banco RECUSA a remoção. A pessoa que apagaria a linha recebe
-- um erro, e a decisão de destruir histórico passa a ser explícita — que é o
-- único jeito de ela ser uma decisão.
--
-- `NO ACTION` e não `RESTRICT`: sem `DEFERRABLE` em jogo os dois se comportam
-- igual, e NO ACTION é o padrão do PostgreSQL — escrever RESTRICT sugeriria que
-- há uma diferença de semântica sendo explorada aqui, e não há.
--
-- CONSEQUÊNCIA ACEITA: apagar a conta de um dono que já selecionou uma proposta
-- passa a FALHAR (o CASCADE de `sale_requests.owner_user_id` esbarra nesta
-- trilha). Isso é o efeito desejado, não um efeito colateral — e nenhum caminho
-- da aplicação apaga `users` hoje.
--
-- LGPD / anonimização, quando existir, é um FLUXO PRÓPRIO que decide o que
-- preservar e o que apagar. Não é um `ON DELETE` acidental herdado de uma FK.
CREATE TABLE IF NOT EXISTS sale_request_offer_selections (
  id BIGSERIAL PRIMARY KEY,

  -- A solicitação cuja disputa terminou.
  sale_request_id BIGINT NOT NULL
    REFERENCES sale_requests(id),

  -- A OFERTA EXATA escolhida. É a fonte da seleção (§6 da 4.4), e não uma
  -- anotação: `advertiser_id` e `amount_snapshot` abaixo derivam dela, e existem
  -- para sobreviver a ela, não para substituí-la.
  --
  -- NÃO tem FK própria: ela é a primeira coluna da FK TRIPLA declarada abaixo,
  -- que prova de uma vez as três coisas (a oferta existe, é DESTA solicitação, e
  -- é DESTA loja). Uma FK simples `offer_id → sale_request_offers(id)` ao lado da
  -- tripla seria estritamente mais fraca e verificaria de novo o que a tripla já
  -- verificou — custo de escrita sem invariante nova.
  offer_id BIGINT NOT NULL,

  -- A LOJA escolhida, desnormalizada de propósito.
  --
  -- Ela é obtível por JOIN em `sale_request_offers`, e mesmo assim está aqui: a
  -- pergunta "quais lojas já foram escolhidas nesta cidade?" é sobre o EVENTO, e
  -- respondê-la por JOIN obrigaria a varrer o histórico inteiro de lances para
  -- chegar a uma coluna que a linha do evento já poderia ter.
  --
  -- Desnormalização é cópia, e cópia diverge. A FK tripla abaixo é o que impede
  -- esta coluna de contar uma história diferente da oferta que ela descreve —
  -- uma trilha dizendo "a loja X ganhou" sobre um lance da loja Y é um erro de
  -- auditoria que ninguém detectaria, porque a auditoria é justamente quem
  -- olharia aqui.
  --
  -- A FK direta para `advertisers` fica também, e não é redundante com a tripla:
  -- a tripla garante COERÊNCIA (bate com a oferta); esta garante EXISTÊNCIA e é
  -- o que bloqueia diretamente o DELETE da loja, com o nome certo no erro.
  advertiser_id BIGINT NOT NULL
    REFERENCES advertisers(id),

  -- QUEM escolheu. É sempre o dono da solicitação nesta fase — a rota é escopada
  -- ao dono e não existe seleção por admin —, e a coluna existe assim mesmo:
  -- quando uma fase futura permitir que outra pessoa decida (um segundo titular,
  -- um operador de suporte), a trilha antiga continuará dizendo quem foi.
  -- Descobrir isso depois é impossível: `sale_requests.owner_user_id` diz quem é
  -- o dono HOJE, não quem apertou o botão naquele dia.
  selected_by_user_id BIGINT NOT NULL
    REFERENCES users(id),

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
  CONSTRAINT sale_request_offer_selections_amount_check CHECK (amount_snapshot > 0),

  -- ──────────────────────────────────────────────────────────────────────────
  -- A FK TRIPLA — três invariantes numa constraint só
  -- ──────────────────────────────────────────────────────────────────────────
  -- Ler em voz alta: "a oferta que registrei existe, é da solicitação que
  -- registrei, e é da loja que registrei".
  --
  -- Sem ela, com FKs separadas por coluna, esta linha seria aceita pelo banco:
  --
  --     selection.sale_request_id = A
  --     selection.offer_id        = <uma oferta da solicitação B>
  --     selection.advertiser_id   = <uma loja qualquer>
  --
  -- Cada FK isolada estaria satisfeita — a solicitação A existe, a oferta
  -- existe, a loja existe — e o registro de auditoria descreveria um negócio que
  -- nunca houve. É o modo de falha clássico de chave estrangeira por coluna:
  -- cada peça é válida, e o conjunto é ficção.
  --
  -- As três colunas são NOT NULL, então não há nuance de MATCH SIMPLE aqui: a
  -- verificação é sempre integral. (A nuance existe e importa na FK de
  -- `sale_requests`, onde `selected_offer_id` é nullable — ver a seção 3.)
  --
  -- Sem `ON DELETE`, como todas as outras desta tabela.
  CONSTRAINT sale_request_offer_selections_offer_request_advertiser_fk
    FOREIGN KEY (offer_id, sale_request_id, advertiser_id)
    REFERENCES sale_request_offers (id, sale_request_id, advertiser_id)
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
  'Fase 4.4 - trilha APPEND-ONLY da escolha preliminar do proprietario. Um evento por solicitacao (UNIQUE), com o valor congelado. Sem UPDATE, sem DELETE, sem status. NENHUMA FK usa ON DELETE CASCADE (4.4.1): uma trilha que some sozinha some justamente quando seria consultada.';

COMMENT ON COLUMN sale_request_offer_selections.offer_id IS
  'A OFERTA EXATA escolhida - a fonte da selecao. advertiser_id e amount_snapshot derivam dela e existem para sobreviver a ela, nao para substitui-la. Sem FK propria: e a primeira coluna da FK TRIPLA (offer_id, sale_request_id, advertiser_id).';

COMMENT ON CONSTRAINT sale_request_offer_selections_offer_request_advertiser_fk
  ON sale_request_offer_selections IS
  'Fase 4.4.1 - prova que a oferta registrada existe, e DESTA solicitacao e e DESTA loja. FKs por coluna aceitariam um evento em que cada peca e valida e o conjunto e ficcao.';

COMMENT ON COLUMN sale_request_offer_selections.amount_snapshot IS
  'Valor congelado no instante da decisao. Hoje sempre igual a offer.amount (a tabela de propostas e append-only); existe para que "por quanto ele escolheu?" nao mude retroativamente.';

COMMENT ON COLUMN sale_request_offer_selections.selected_by_user_id IS
  'Quem apertou o botao. Hoje sempre o dono; a coluna existe para que a trilha antiga continue respondendo quando uma fase futura permitir outro decisor.';

COMMENT ON COLUMN sale_requests.selected_offer_id IS
  'Fase 4.4 - a proposta escolhida, quando status = offer_selected. FK COMPOSTA (selected_offer_id, id) -> sale_request_offers(id, sale_request_id): prova que a oferta e DESTA solicitacao, nao apenas que existe. Sem ON DELETE: o banco RECUSA apagar o lojista de uma proposta selecionada, em vez de deixar a selecao apontar para o vazio.';

COMMENT ON COLUMN sale_requests.selected_offer_at IS
  'Instante da escolha. NULL enquanto ninguem escolheu - sem DEFAULT, para que a data seja sobre a DECISAO e nunca sobre a criacao da linha.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | offer_selected | cancelled. Cada um com writer: o INSERT da publicacao, a transacao de selecao (4.4) e cancelForOwner. Reabertura, aceite final e venda concluida NAO existem - entram com migration propria quando tiverem quem as escreva.';
