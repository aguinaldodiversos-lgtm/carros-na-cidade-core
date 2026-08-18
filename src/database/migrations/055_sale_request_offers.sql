-- 055_sale_request_offers.sql
-- Fase 4.3 — propostas preliminares dos lojistas.
--
-- Uma linha aqui significa exatamente uma frase:
--
--     "a loja X, pelas mãos do usuário Y, propôs R$ Z por ESTA solicitação,
--      neste instante".
--
-- ============================================================================
-- APPEND-ONLY: HISTÓRICO DE LANCES, NÃO "A PROPOSTA ATUAL"
-- ============================================================================
-- Havia duas formas possíveis, e elas não são equivalentes:
--
--   (a) UMA linha por (solicitação, loja), atualizada a cada aumento — o
--       modelo "proposta atual";
--   (b) uma linha por LANCE, nunca atualizada — o modelo escolhido aqui.
--
-- A (a) é mais enxuta e responde "quanto esta loja está oferecendo?" com um
-- SELECT direto. Ela paga esse conforto destruindo o passado: cada `UPDATE`
-- apaga o valor anterior, e a pergunta "esta loja subiu de 48 para 52 depois que
-- alguém cobriu?" deixa de ter resposta no banco.
--
-- A disputa incremental é o CENTRO deste produto — não um efeito colateral dele.
-- Quando a Fase 4.4 permitir à pessoa física ESCOLHER uma proposta, a sequência
-- de lances vira o registro do negócio: quem entrou primeiro, quem cobriu quem,
-- em quanto tempo. E se um lojista contestar ("eu tinha coberto aquele valor"),
-- só o histórico responde. Reconstruí-lo depois é impossível — o dado que a (a)
-- sobrescreve não volta.
--
-- O custo da (b) é uma linha por lance em vez de uma por loja, e uma agregação
-- (`MAX(amount)`) em vez de uma leitura direta. Com o índice
-- `(sale_request_id, amount DESC)` essa agregação é uma varredura de um item no
-- topo do índice.
--
-- CONSEQUÊNCIA DE VOCABULÁRIO: não existe coluna `status` aqui. Um lance é um
-- FATO datado, não um objeto com ciclo de vida. "Vencedora" é uma propriedade
-- DERIVADA (o maior valor no momento da leitura), e gravá-la exigiria reescrever
-- a linha perdedora a cada novo lance — o `UPDATE` que a (b) existe para evitar.
-- Aceite, recusa e retirada pertencem às fases 4.4/4.5 e entram com migration
-- própria, quando tiverem quem as escreva. Estado sem writer é o erro que a
-- migration 030 documenta e que a 052 repetiu por escrito.
--
-- ============================================================================
-- POR QUE `offers`, E NÃO `bids`
-- ============================================================================
-- O projeto já tem `purchase_intent_offers` (Fase 3) para "o lojista ofereceu
-- algo a um comprador", e a interface inteira deste produto diz "proposta". Um
-- segundo substantivo para o mesmo ato obrigaria todo leitor futuro a saber qual
-- tabela usa qual palavra — e a tradução mental erra em algum momento.
--
-- `bid` seria mais preciso sobre a MECÂNICA (é um lance ascendente), mas o
-- ganho de precisão não paga a divergência de vocabulário.
--
-- ============================================================================
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
-- ============================================================================
-- Mesma decisão de 049/050/051/052: para tabela genuinamente nova, falhar alto é
-- o comportamento certo. O runner (src/database/migrate.js) envolve cada
-- migration em BEGIN/COMMIT e faz ROLLBACK no erro; engolir a exceção marcaria a
-- migration como aplicada com a tabela inexistente — o modo de falha real da 008.
--
-- ============================================================================
-- TIPOS
-- ============================================================================
-- `BIGINT` nas FKs seguindo 049/050/051/052: em produção `users.id` e
-- `advertisers.id` são `integer` (divergência conhecida, registrada em
-- reports/fase-0-1-fundacao-oportunidades-2026-08-10.md §P3-2), e a FK
-- BIGINT → integer já funciona lá há fases.
--
-- `NUMERIC(14,2)` em `amount` é a convenção monetária do projeto — a mesma de
-- `ads.price`, `purchase_intents.max_price`, `sale_requests.fipe_reference_value`
-- e dos valores da ficha da 054. NUNCA float: dinheiro em ponto flutuante
-- binário acumula erro de arredondamento na primeira soma, e aqui o número é a
-- própria coisa negociada.

CREATE TABLE IF NOT EXISTS sale_request_offers (
  id BIGSERIAL PRIMARY KEY,

  -- A solicitação disputada.
  --
  -- CASCADE, e a escolha merece explicação porque parece contradizer o
  -- histórico: cancelar uma solicitação NÃO apaga nada — cancelamento é mudança
  -- de `status`, e a 052 é explícita sobre isso. As propostas de uma solicitação
  -- cancelada permanecem inteiras.
  --
  -- O CASCADE só age quando a LINHA de `sale_requests` é REMOVIDA de verdade, e
  -- o único caminho que faz isso hoje é o CASCADE de `users` (o dono apagou a
  -- conta). Nesse cenário, manter as propostas produziria linhas apontando para
  -- uma solicitação inexistente — histórico de um negócio que não pode mais ser
  -- descrito, e que nenhuma tela sabe renderizar. É a mesma escolha de
  -- `sale_request_images`.
  sale_request_id BIGINT NOT NULL
    REFERENCES sale_requests(id) ON DELETE CASCADE,

  -- ==========================================================================
  -- OS DOIS ATORES — E POR QUE OS DOIS
  -- ==========================================================================
  -- `dealer_user_id` é a PESSOA que apertou o botão; `advertiser_id` é a LOJA
  -- que a proposta representa. Guardar só um dos dois perde informação que não
  -- se recupera depois:
  --
  --   Só a conta: `advertisers.user_id` não tem UNIQUE (verificado na Fase 0.1),
  --   então uma conta pode ter mais de uma loja. Descobrir DEPOIS qual loja fez
  --   a proposta exigiria adivinhar.
  --
  --   Só a loja: uma loja pode ter mais de um operador no futuro, e a auditoria
  --   ("quem ofereceu R$ 62 mil naquele carro?") perde o nome.
  --
  -- A `purchase_intent_offers` (Fase 3) guarda SÓ a conta, e a decisão está
  -- documentada lá: o limite de 3 veículos é por LOJISTA, e gravar
  -- `advertiser_id` faria o teto ser contado por linha de loja. Aqui não existe
  -- teto por ator — existe DINHEIRO e disputa entre lojas —, então a loja é
  -- parte do fato, não um detalhe de implementação.
  --
  -- Nenhum dos dois vem do corpo da requisição: ambos são derivados da sessão e
  -- de `resolveDealerStore`.
  dealer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  advertiser_id BIGINT NOT NULL
    REFERENCES advertisers(id) ON DELETE CASCADE,

  -- O valor proposto.
  --
  -- Sem DEFAULT: um lance sem valor não é um lance, e um default aqui
  -- transformaria um bug de call site num número real dentro de uma disputa.
  amount NUMERIC(14, 2) NOT NULL,

  -- Observação OPCIONAL da proposta.
  --
  -- Limitada pela aplicação; sem CHECK de tamanho aqui, pela mesma razão de
  -- `sale_requests.known_issues`: o limite é mensagem de formulário, e um CHECK
  -- devolveria erro de banco no lugar de erro de campo.
  --
  -- NÃO é canal de conversa. Não existe coluna de resposta, não existe
  -- `read_at`, não existe thread — e a ausência é deliberada: as três, juntas,
  -- seriam um chat, e esta fase decidiu que o portal controla o fluxo.
  note TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Zero e negativo não são propostas. O piso vive no banco além da aplicação
  -- porque um valor não-positivo aqui contaminaria o `MAX(amount)` que decide a
  -- liderança — e a origem do dado errado seria invisível na leitura.
  CONSTRAINT sale_request_offers_amount_check CHECK (amount > 0)
);

-- ---------------------------------------------------------------------------
-- SEM `updated_at`
-- ---------------------------------------------------------------------------
-- A tabela é append-only: nenhum caminho da aplicação executa `UPDATE` nela.
-- Uma coluna `updated_at` sugeriria o contrário para quem lesse o schema, e
-- ficaria eternamente igual a `created_at` — um campo que só pode mentir.

-- ---------------------------------------------------------------------------
-- ÍNDICES — três, cada um com uma leitura real
-- ---------------------------------------------------------------------------

-- 1) A MAIOR PROPOSTA de uma solicitação.
--
-- É a leitura mais quente do produto: aparece no detalhe de todo lojista e é
-- consultada DENTRO da transação de cada novo lance, com a solicitação já
-- travada. O `amount DESC` faz o `MAX` virar leitura do primeiro item do índice
-- em vez de agregação sobre todas as propostas.
--
-- `id DESC` fecha o desempate para que dois lances de MESMO valor (possíveis:
-- nada impede duas lojas de proporem 50.000 em solicitações... e, no futuro, se
-- a regra de superar o líder mudar) tenham ordem estável entre leituras.
CREATE INDEX IF NOT EXISTS sale_request_offers_request_amount_idx
  ON sale_request_offers (sale_request_id, amount DESC, id DESC);

-- 2) "QUAL É A MINHA PROPOSTA nesta solicitação?"
--
-- Escopo por LOJA (e não por conta), porque é a loja que disputa: dois
-- operadores da mesma loja precisam ver a mesma proposta corrente. `created_at
-- DESC, id DESC` porque a proposta vigente da loja é o ÚLTIMO lance dela, e não
-- o maior — se uma regra futura permitir lance menor, "a minha proposta"
-- continua sendo a mais recente.
CREATE INDEX IF NOT EXISTS sale_request_offers_advertiser_request_idx
  ON sale_request_offers (advertiser_id, sale_request_id, created_at DESC, id DESC);

-- 3) "As propostas que ESTA LOJA enviou", em ordem cronológica.
--
-- Alimenta a métrica "minhas propostas enviadas" do cabeçalho do feed e a
-- listagem futura do histórico da loja. Sem ele, contar as propostas de uma loja
-- varreria as propostas de todas.
CREATE INDEX IF NOT EXISTS sale_request_offers_advertiser_created_idx
  ON sale_request_offers (advertiser_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- SEM UNIQUE — e por que a ausência é correta AQUI
-- ---------------------------------------------------------------------------
-- `purchase_intent_offers` tem `UNIQUE (purchase_intent_id, ad_id)` porque lá o
-- mesmo anúncio enviado duas vezes para a mesma procura é uma DUPLICATA: o fato
-- é o mesmo fato.
--
-- Aqui o oposto é verdade. A mesma loja propondo de novo é o comportamento
-- CENTRAL do produto — é a disputa acontecendo. Um `UNIQUE (sale_request_id,
-- advertiser_id)` tornaria o aumento impossível sem `UPDATE`, ou seja,
-- reintroduziria o modelo (a) por outro caminho.
--
-- O que protege contra clique duplo NÃO é uma chave única, e não poderia ser:
-- dois cliques enviam o MESMO valor, e a regra de negócio já recusa o segundo
-- ("a nova proposta precisa superar a maior atual"). Essa recusa é avaliada
-- dentro da transação que trava a solicitação — ver o lock em
-- `sale-requests.offers.repository.js`. É o lock que serializa, não o índice.

COMMENT ON TABLE sale_request_offers IS
  'Fase 4.3 - historico APPEND-ONLY de propostas preliminares dos lojistas. Uma linha por LANCE; a maior proposta e MAX(amount), nunca uma coluna. Sem UPDATE, sem status.';

COMMENT ON COLUMN sale_request_offers.dealer_user_id IS
  'Conta que enviou (users.id). Guardada JUNTO de advertiser_id: uma conta pode ter mais de uma loja (advertisers.user_id nao tem UNIQUE).';

COMMENT ON COLUMN sale_request_offers.advertiser_id IS
  'Loja representada pela proposta. Resolvida no servidor por resolveDealerStore - nunca vem do corpo da requisicao.';

COMMENT ON COLUMN sale_request_offers.amount IS
  'Valor proposto, NUMERIC(14,2) como todo dinheiro do projeto. CHECK > 0: valor nao-positivo contaminaria o MAX que decide a lideranca.';

COMMENT ON COLUMN sale_request_offers.note IS
  'Observacao opcional da proposta. NAO e canal de conversa: sem resposta, sem read_at, sem thread. Nao e exposta ao vendedor nesta fase.';
