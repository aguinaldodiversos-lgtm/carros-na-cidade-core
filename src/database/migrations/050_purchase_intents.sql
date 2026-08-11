-- 050_purchase_intents.sql
-- Fase 2 — Compradores ativos / Minhas procuras.
--
-- Primeira entidade do Motor de Oportunidades: uma PROCURA publicada por um
-- comprador (PF). Lojistas CNPJ da MESMA cidade conseguem encontrá-la, sem
-- nenhum dado de contato do comprador.
--
-- FRONTEIRA DESTA FASE
--
-- A tabela guarda SÓ a procura. Não existe aqui `ad_id`, `advertiser_id`,
-- `offer_id` nem qualquer ponte para estoque: a relação
-- purchase_intents → purchase_intent_offers → ads é da Fase 3. Criar a coluna
-- "para já deixar pronto" custaria uma FK que ninguém escreve e um NULL que
-- todo SELECT precisa tratar — e travaria agora um formato que ainda vai ser
-- desenhado.
--
-- POR QUE `purchase_intents` É A FONTE DE VERDADE
--
-- A visibilidade da oportunidade para o lojista sai DESTA tabela
-- (status + expires_at + city_id), nunca de `user_notifications`. A notificação
-- é só o aviso: se o fan-out falhar, a procura continua existindo e continua
-- aparecendo em "Compradores ativos". O contrário — visibilidade derivada da
-- notificação — transformaria uma falha de aviso em perda de produto.
--
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
--
-- Mesma decisão da 049: as migrations 043–046 engolem o erro com RAISE NOTICE,
-- o que marca a migration como aplicada mesmo quando a tabela não nasceu (o
-- modo de falha real da 008). Para uma tabela genuinamente nova, falhar alto é
-- o comportamento certo — o runner (src/database/migrate.js) já envolve cada
-- migration em BEGIN/COMMIT e faz ROLLBACK no erro.
--
-- TIPOS
--
-- `BIGINT` nas FKs seguindo a 049 e `support_tickets.user_id`: em produção
-- `users.id` e `cities.id` são `integer` (divergência conhecida, registrada em
-- reports/fase-0-1-fundacao-oportunidades-2026-08-10.md §P3-2), e a FK
-- BIGINT → integer já funciona lá há tempo.
--
-- `NUMERIC(14,2)` em max_price é a convenção monetária do projeto — a mesma de
-- `ads.price`. Não existe coluna de centavos inteiros em lugar nenhum do
-- schema, e inventar uma aqui obrigaria a converter unidade em toda comparação
-- futura com o preço do anúncio (que é justamente o que a Fase 3 vai fazer).

CREATE TABLE IF NOT EXISTS purchase_intents (
  id BIGSERIAL PRIMARY KEY,

  -- A procura pertence à CONTA do comprador, não a um advertiser: quem procura
  -- é pessoa física e pode nunca ter anunciado nada. CASCADE porque a procura
  -- não tem significado sem o dono (mesma escolha de user_notifications).
  buyer_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Cidade ESCOLHIDA explicitamente pelo comprador. NOT NULL e com FK real:
  -- todo o produto desta fase é "mesma cidade = mesma cidade", então uma
  -- procura sem cidade válida não teria como ser entregue a ninguém.
  --
  -- Sem ON DELETE: `cities` é catálogo IBGE estável e não deve ser apagado.
  -- CASCADE destruiria procuras de gente real por uma limpeza de catálogo, e
  -- SET NULL é impossível numa coluna NOT NULL. O NO ACTION padrão faz o banco
  -- recusar a remoção da cidade — que é exatamente o efeito desejado.
  city_id BIGINT NOT NULL REFERENCES cities(id),

  -- 'specific_model' | 'open_category' — ver purchase-intents.constants.js.
  intent_type TEXT NOT NULL,

  -- Marca/modelo só existem no modo 'specific_model' (ver CHECK de forma).
  -- `model` guarda o MODELO COMERCIAL derivado ("T-Cross"), nunca a descrição
  -- FIPE inteira ("T-Cross 200 TSI 1.0 Flex 12V 5p Aut."): a Fase 3 vai
  -- comparar procura com anúncio, e agrupar por descrição FIPE fragmenta um
  -- Onix em quatro modelos diferentes.
  brand TEXT,
  brand_slug TEXT,
  model TEXT,
  model_slug TEXT,

  -- Carroceria só existe no modo 'open_category'. Slug canônico de
  -- ads.canonical.constants.js (suv|hatch|sedan|picape|coupe|minivan|wagon).
  body_type TEXT,

  -- Câmbio é obrigatório nos DOIS modos. Slug canônico
  -- (automatico|manual|cvt) — nunca acentuado, nunca "Automatizado".
  transmission TEXT NOT NULL,

  max_price NUMERIC(14, 2) NOT NULL,

  -- 'as_soon_as_possible' | 'within_7_days' | 'within_30_days'.
  purchase_timeframe TEXT NOT NULL,

  -- 'active' | 'closed'. Sem draft/negotiating/purchased: o MVP não tem
  -- transição que justifique um estado a mais, e status inventado cedo vira
  -- migração depois.
  status TEXT NOT NULL DEFAULT 'active',

  -- Preenchido pela aplicação como created_at + 30 dias. Expiração é LAZY:
  -- nenhuma linha muda de status quando o prazo passa — a leitura do lojista
  -- filtra `expires_at > NOW()`. Sem cron, sem worker, sem BullMQ. O comprador
  -- continua vendo a procura vencida no histórico dele como "Expirada", que é
  -- informação, não lixo.
  expires_at TIMESTAMPTZ NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- CHECKs só nos vocabulários genuinamente FECHADOS deste domínio. Câmbio e
  -- carroceria ficam de fora de propósito: `ads` não tem CHECK nessas colunas
  -- (ver docs/database/ads-schema-contract.sql, 100% comentado), e criar aqui
  -- uma regra mais dura que a da tabela com que a Fase 3 vai comparar geraria
  -- divergência entre as duas pontas.
  CONSTRAINT purchase_intents_intent_type_check
    CHECK (intent_type IN ('specific_model', 'open_category')),

  CONSTRAINT purchase_intents_status_check
    CHECK (status IN ('active', 'closed')),

  CONSTRAINT purchase_intents_timeframe_check
    CHECK (purchase_timeframe IN ('as_soon_as_possible', 'within_7_days', 'within_30_days')),

  CONSTRAINT purchase_intents_max_price_check
    CHECK (max_price > 0),

  -- Coerência de FORMA entre o modo e os campos preenchidos. É o invariante que
  -- a Fase 3 vai assumir ao casar procura com estoque: em 'specific_model'
  -- existe par marca+modelo e NÃO existe carroceria; em 'open_category' é o
  -- inverso exato. Sem este CHECK, uma linha meio-preenchida (marca sem modelo,
  -- ou marca E carroceria) passaria pelo banco e só quebraria no matching.
  CONSTRAINT purchase_intents_shape_check CHECK (
    (
      intent_type = 'specific_model'
      AND brand IS NOT NULL
      AND brand_slug IS NOT NULL
      AND model IS NOT NULL
      AND model_slug IS NOT NULL
      AND body_type IS NULL
    )
    OR (
      intent_type = 'open_category'
      AND brand IS NULL
      AND brand_slug IS NULL
      AND model IS NULL
      AND model_slug IS NULL
      AND body_type IS NOT NULL
    )
  )
);

-- Listagem do comprador: "minhas procuras", mais recentes primeiro. Cobre a
-- ordenação por tupla (created_at DESC, id DESC) usada na paginação por cursor.
CREATE INDEX IF NOT EXISTS purchase_intents_buyer_created_idx
  ON purchase_intents (buyer_user_id, created_at DESC, id DESC);

-- Listagem do lojista: oportunidades ATIVAS da cidade dele.
--
-- Índice PARCIAL em status = 'active': procura encerrada nunca aparece para
-- lojista, então não precisa ocupar o índice. `expires_at` entra como coluna
-- porque o filtro de vencimento é aplicado na mesma varredura.
CREATE INDEX IF NOT EXISTS purchase_intents_city_active_idx
  ON purchase_intents (city_id, expires_at, created_at DESC, id DESC)
  WHERE status = 'active';

COMMENT ON TABLE purchase_intents IS
  'Fase 2 - procura publicada por um comprador PF. Fonte de verdade da oportunidade; user_notifications apenas avisa. Sem ponte para ads/offers nesta fase.';

COMMENT ON COLUMN purchase_intents.city_id IS
  'Cidade escolhida explicitamente pelo comprador. Sem fallback territorial: mesma cidade = mesma cidade, sem raio nem region_memberships.';

COMMENT ON COLUMN purchase_intents.model IS
  'Modelo COMERCIAL derivado (ex.: T-Cross), nunca a descricao FIPE completa. Ver src/shared/vehicle/commercial-model.js.';

COMMENT ON COLUMN purchase_intents.expires_at IS
  'created_at + 30 dias. Expiracao lazy: nenhum job muda status; a leitura do lojista filtra expires_at > NOW().';

COMMENT ON COLUMN purchase_intents.status IS
  'active | closed. Encerrar e soft: a linha permanece no historico do comprador.';
