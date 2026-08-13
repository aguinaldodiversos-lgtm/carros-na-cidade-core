-- 051_purchase_intent_offers.sql
-- Fase 3 — Envio de veículos do estoque ao comprador.
--
-- A ponte que a 050 deliberadamente NÃO criou:
--
--     purchase_intents → purchase_intent_offers → ads
--
-- Uma linha aqui significa exatamente uma frase, e nada além dela:
--
--     "o lojista X enviou o anúncio Y para a procura Z".
--
-- O QUE ESTA TABELA NÃO GUARDA (e por quê)
--
-- Não existe `price`, `brand`, `model`, `year`, `mileage`, `images`,
-- `dealer_name` nem `title`. O anúncio continua sendo a ÚNICA fonte de verdade
-- do veículo: se o lojista baixar o preço de R$ 98.900 para R$ 96.900, o
-- comprador vê R$ 96.900 no próximo carregamento, sem job de sincronização e
-- sem duas versões do mesmo carro discordando entre si. Copiar o preço aqui
-- criaria uma cópia que envelhece — e a pergunta "qual das duas está certa?"
-- não tem resposta boa.
--
-- POR QUE NÃO EXISTE COLUNA DE STATUS
--
-- Nada de 'active' | 'withdrawn' | 'accepted' | 'rejected'. A DISPONIBILIDADE
-- do veículo é lida do anúncio no momento da consulta (`ads.status = 'active'`
-- + advertiser operacional), nunca daqui. Um status próprio precisaria de
-- alguém para escrevê-lo quando o anúncio fosse vendido ou pausado — ou seja,
-- do job que esta fase decidiu não ter — e o sintoma da falta seria um card
-- "disponível" apontando para um carro já vendido.
--
-- Retirada pelo lojista, aceite pelo comprador e recusa são transições que o
-- produto ainda não tem. Quando tiver, entram numa migration própria com a
-- regra escrita junto.
--
-- TIPOS
--
-- `BIGINT` nas três FKs, seguindo a 049/050. Em produção `users.id` é
-- `integer` (divergência conhecida, registrada em
-- reports/fase-0-1-fundacao-oportunidades-2026-08-10.md §P3-2) e a FK
-- BIGINT → integer já funciona lá. `ads.id` é `BIGSERIAL` desde a baseline
-- (004_baseline_ads.sql), então a referência é do mesmo tipo.
--
-- SOBRE A FK PARA `ads`
--
-- A 004 declara `ads.advertiser_id` SEM FK, por compatibilidade com schemas
-- legados. Isso vale para uma coluna que APONTA para fora; aqui é o inverso:
-- referenciamos `ads(id)`, que é PRIMARY KEY desde a baseline e existe em
-- qualquer banco onde a aplicação roda (todo JOIN do projeto depende dele).
-- Não há caso legado em que `ads.id` não seja único.
--
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
--
-- Mesma decisão da 049 e da 050: para tabela genuinamente nova, falhar alto é
-- o comportamento certo. O runner (src/database/migrate.js) envolve cada
-- migration em BEGIN/COMMIT e faz ROLLBACK no erro; engolir a exceção marcaria
-- a migration como aplicada com a tabela inexistente — o modo de falha real da
-- 008.

CREATE TABLE IF NOT EXISTS purchase_intent_offers (
  id BIGSERIAL PRIMARY KEY,

  -- A procura que recebeu o veículo. CASCADE: sem a procura, a oferta não
  -- descreve mais nada — é a mesma escolha de `purchase_intents.buyer_user_id`.
  purchase_intent_id BIGINT NOT NULL
    REFERENCES purchase_intents(id) ON DELETE CASCADE,

  -- QUEM enviou, guardado como CONTA e não como advertiser.
  --
  -- `advertisers.user_id` não tem UNIQUE (verificado na Fase 0.1): o mesmo
  -- lojista pode ter mais de uma linha em `advertisers`. Gravar `advertiser_id`
  -- faria o limite de 3 veículos ser contado por linha de loja em vez de por
  -- lojista, e um lojista com duas linhas enviaria 6. A conta é a identidade
  -- estável — a mesma que `req.user.id` carrega.
  --
  -- O advertiser continua acessível quando necessário, pelo próprio anúncio
  -- (ads.advertiser_id → advertisers.id).
  dealer_user_id BIGINT NOT NULL
    REFERENCES users(id) ON DELETE CASCADE,

  -- O anúncio enviado. FONTE DE VERDADE do veículo — ver o cabeçalho.
  --
  -- CASCADE porque o projeto REALMENTE apaga linhas de `ads` em manutenção
  -- (scripts/cleanup-orphan-test-ads.mjs e scripts/e2e-seed.mjs). Com NO ACTION
  -- esses scripts passariam a falhar com violação de FK, e a alternativa
  -- (SET NULL) deixaria uma oferta que não aponta para veículo nenhum — uma
  -- linha que nenhuma tela sabe renderizar.
  --
  -- Isto NÃO é o caso do anúncio vendido/pausado/bloqueado: esses não apagam
  -- linha, mudam `ads.status`, e a oferta permanece no histórico do comprador
  -- marcada como indisponível.
  ad_id BIGINT NOT NULL
    REFERENCES ads(id) ON DELETE CASCADE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- O MESMO anúncio não pode ser enviado duas vezes para a MESMA procura.
  --
  -- A garantia é do BANCO, não do frontend nem do `if` do service: clique
  -- duplo, retry de rede e duas abas abertas chegam como requests concorrentes,
  -- e um SELECT-checa-INSERT fora de transação tem janela para os dois passarem.
  -- Com o índice único, o segundo INSERT perde — e o service transforma essa
  -- perda em resposta idempotente, não em erro.
  --
  -- A chave é (intent, ad) e NÃO (intent, dealer, ad): o anúncio já pertence a
  -- um único lojista, então incluir o dealer só permitiria a mesma dupla
  -- aparecer duas vezes se a posse do anúncio mudasse — que é exatamente a
  -- duplicata que não queremos.
  CONSTRAINT purchase_intent_offers_intent_ad_key
    UNIQUE (purchase_intent_id, ad_id)
);

-- Leitura do COMPRADOR: "veículos enviados para esta procura", mais recentes
-- primeiro. O índice único acima casa (purchase_intent_id, ad_id) e não serve
-- a esta ordenação.
CREATE INDEX IF NOT EXISTS purchase_intent_offers_intent_created_idx
  ON purchase_intent_offers (purchase_intent_id, created_at DESC, id DESC);

-- Contagem do LIMITE por lojista dentro de uma procura, e a listagem
-- "o que EU já enviei" na tela do lojista. Sem ele, contar as vagas ocupadas
-- varreria todas as ofertas da procura, de todos os lojistas.
CREATE INDEX IF NOT EXISTS purchase_intent_offers_intent_dealer_idx
  ON purchase_intent_offers (purchase_intent_id, dealer_user_id, created_at DESC, id DESC);

COMMENT ON TABLE purchase_intent_offers IS
  'Fase 3 - relacao procura <-> anuncio enviado pelo lojista. NAO guarda copia do veiculo: preco, fotos, km, ano e modelo sao lidos de ads no momento da consulta.';

COMMENT ON COLUMN purchase_intent_offers.dealer_user_id IS
  'Conta do lojista que enviou (users.id). Nao e advertiser_id: advertisers.user_id nao tem UNIQUE, e o limite de 3 e por LOJISTA.';

COMMENT ON COLUMN purchase_intent_offers.ad_id IS
  'Anuncio enviado. Fonte de verdade do veiculo. Disponibilidade vem de ads.status + status do advertiser na hora da leitura, nunca desta tabela.';
