-- 052_sale_requests.sql
-- Fase 4.1 — Venda seu carro para lojas (Produto 2).
--
-- Uma linha aqui significa exatamente uma frase:
--
--     "esta pessoa física quer vender ESTE carro para lojas DESTA cidade".
--
-- ============================================================================
-- POR QUE UMA TABELA NOVA, E NÃO `ads`
-- ============================================================================
-- A auditoria da Fase 4.0 (reports/fase-4-0-auditoria-venda-para-lojas-2026-08-15.md)
-- rejeitou reutilizar `ads` por quatro obstáculos que NÃO são estéticos:
--
--   1. RLS. `017_ads_rls_owner_policy.sql` autoriza escrita em `ads` via
--      `ads.advertiser_id → advertisers.user_id`. Uma PF vendendo o carro dela
--      NÃO tem advertiser. As duas saídas são ruins: criar linha em
--      `advertisers` para cada pessoa física (poluindo a tabela que decide
--      elegibilidade de lojista e alimenta `/loja/[slug]`), ou deixar
--      `advertiser_id` NULL e quebrar `ad-ownership.js`.
--
--   2. `ads_status_check` (migration 030) é uma lista AUDITADA de 6 valores, e a
--      própria migration documenta que `draft`/`sold`/`expired` ficaram de fora
--      por não terem caminho de escrita. Um sétimo valor exigiria alterar a
--      constraint da tabela mais protegida do sistema.
--
--   3. `ads.price`, `title` e `slug` são NOT NULL e não descrevem este objeto.
--      Uma solicitação de venda NÃO TEM PREÇO — o preço é justamente o que as
--      lojas vão disputar nas fases 4.3+. Preencher `price = 0` propagaria para
--      `below_fipe`, ranking e `fipe_diff_percent`.
--
--   4. O isolamento público seria uma propriedade de N call sites (todos
--      filtrando `status = 'active'`), não uma garantia. O repositório já
--      registrou esse modo de falha duas vezes (JOINs faltando no `countQuery`,
--      filtros da Fase 3 sem varredura de consumidores).
--
-- Tabela própria torna o isolamento ESTRUTURAL: nenhuma query de `/comprar`,
-- `/carros-em`, home, busca, faceta, sitemap ou JSON-LD conhece este nome. Não
-- existe coluna `slug`, então não há como gerar `/veiculo/[slug]`.
--
-- ============================================================================
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
-- ============================================================================
-- Mesma decisão das migrations 049/050/051: para tabela genuinamente nova,
-- falhar alto é o comportamento certo. O runner (src/database/migrate.js)
-- envolve cada migration em BEGIN/COMMIT e faz ROLLBACK no erro; engolir a
-- exceção marcaria a migration como aplicada com a tabela inexistente — o modo
-- de falha real da 008.
--
-- ============================================================================
-- TIPOS
-- ============================================================================
-- `BIGINT` nas FKs seguindo 049/050/051: em produção `users.id` e `cities.id`
-- são `integer` (divergência conhecida, registrada em
-- reports/fase-0-1-fundacao-oportunidades-2026-08-10.md §P3-2), e a FK
-- BIGINT → integer já funciona lá há fases.
--
-- `NUMERIC(14,2)` em `fipe_reference_value` é a convenção monetária do projeto
-- — a mesma de `ads.price` e `purchase_intents.max_price`.

CREATE TABLE IF NOT EXISTS sale_requests (
  id BIGSERIAL PRIMARY KEY,

  -- Dono da solicitação. É a CONTA da pessoa física: quem vende o próprio carro
  -- pode nunca ter anunciado nada e nunca ter advertiser. CASCADE porque a
  -- solicitação não tem significado sem o dono (mesma escolha de
  -- `purchase_intents.buyer_user_id`).
  owner_user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Cidade ESCOLHIDA explicitamente pela PF. NOT NULL e com FK real: todo o
  -- produto é "mesma cidade = mesma cidade" (a distribuição da 4.2 sai daqui),
  -- então uma solicitação sem cidade válida não teria como ser entregue.
  --
  -- Sem ON DELETE: `cities` é catálogo IBGE estável e não deve ser apagado.
  -- CASCADE destruiria solicitações de gente real por uma limpeza de catálogo, e
  -- SET NULL é impossível numa coluna NOT NULL. O NO ACTION padrão faz o banco
  -- recusar a remoção da cidade — que é exatamente o efeito desejado.
  city_id BIGINT NOT NULL REFERENCES cities(id),

  -- ==========================================================================
  -- IDENTIDADE DO VEÍCULO
  -- ==========================================================================
  -- Marca canônica, já sem o prefixo de grupo da FIPE ("VW - VolksWagen" vira
  -- "Volkswagen"). Derivada no SERVIDOR por `canonicalBrandLabel/Slug` — o
  -- cliente não é autoridade sobre estes valores.
  brand TEXT NOT NULL,
  brand_slug TEXT NOT NULL,

  -- Modelo COMERCIAL derivado ("T-Cross"), nunca a descrição FIPE completa.
  -- Mesma regra de `purchase_intents.model`: agrupar por descrição FIPE
  -- fragmentaria um Onix em quatro modelos diferentes.
  model TEXT NOT NULL,
  model_slug TEXT NOT NULL,

  -- A descrição FIPE INTEIRA ("T-Cross 200 TSI 1.0 Flex 12V 5p Aut.").
  --
  -- DIVERGÊNCIA DELIBERADA em relação a `purchase_intents`, que guarda só o
  -- modelo comercial. Lá o objeto é uma PROCURA (agrupar ajuda); aqui é UM CARRO
  -- ESPECÍFICO sendo avaliado por lojistas, e a versão é o que separa R$ 15 mil
  -- entre um EX e um LX. `ads` guarda a descrição FIPE em `ads.model` pelo mesmo
  -- motivo. Guardamos os dois: o comercial para exibir/agrupar, a descrição para
  -- avaliar.
  fipe_model_description TEXT NOT NULL,

  -- ==========================================================================
  -- ÂNCORA DE MERCADO — SNAPSHOT, não referência viva
  -- ==========================================================================
  -- A migration 051 argumenta CONTRA copiar preço, e o argumento é correto
  -- QUANDO existe fonte de verdade viva (lá, o anúncio). Aqui não existe: a
  -- tabela FIPE muda mensalmente, e re-resolver na leitura faria a âncora mudar
  -- debaixo do lojista entre a oferta preliminar e a avaliação presencial.
  --
  -- Por isso é snapshot, e por isso `fipe_reference_at` existe: sem a data, o
  -- número seria um valor sem época — pior que não ter valor nenhum.
  --
  -- Todos NULLABLE: quando a FIPE não resolve de forma legítima, gravamos NULL.
  -- NUNCA inventamos valor (§16 da especificação da fase).
  fipe_code TEXT,
  fipe_reference_value NUMERIC(14, 2),
  fipe_reference_at TIMESTAMPTZ,

  year INTEGER NOT NULL,
  mileage INTEGER NOT NULL,

  -- Slugs canônicos de `ads.canonical.constants.js`, normalizados no servidor
  -- pelos MESMOS helpers dos anúncios (`normalizeTransmissionForStorage`,
  -- `normalizeFuelTypeForStorage`). Nunca acentuado.
  transmission TEXT NOT NULL,
  fuel_type TEXT NOT NULL,

  -- ==========================================================================
  -- CONDIÇÃO DECLARADA
  -- ==========================================================================
  -- Vocabulário fechado (ver CHECK). É o que permite ao lojista fazer uma oferta
  -- preliminar honesta e, na avaliação presencial da 4.5, comparar o declarado
  -- com o encontrado.
  declared_condition TEXT NOT NULL,

  -- Texto livre OPCIONAL, limitado a 1000 caracteres pela aplicação. Sem CHECK
  -- de tamanho aqui: o limite é mensagem de formulário, e um CHECK devolveria
  -- erro de banco em vez de erro de campo.
  known_issues TEXT,

  -- ==========================================================================
  -- ESTADO
  -- ==========================================================================
  -- SOMENTE dois valores nesta fase (ver CHECK). `selected` e `completed`
  -- pertencem às fases 4.4/4.5 e NÃO entram aqui: nenhum endpoint desta fase os
  -- escreve, e estado sem writer é exatamente o que a migration 030 documenta
  -- como erro a não repetir (`draft`/`sold`/`expired` ficaram fora do CHECK de
  -- `ads.status` por esse motivo).
  --
  -- Quando 4.4/4.5 chegarem, uma migration própria expande o CHECK — pelo mesmo
  -- padrão DROP/ADD que a 030 descreve.
  status TEXT NOT NULL DEFAULT 'receiving_offers',

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_requests_status_check
    CHECK (status IN ('receiving_offers', 'cancelled')),

  CONSTRAINT sale_requests_declared_condition_check
    CHECK (declared_condition IN ('excelente', 'bom', 'regular', 'precisa_reparos')),

  -- Faixa larga de propósito: recusa erro de digitação grosseiro (ano 21 ou
  -- 20255) sem virar regra de negócio sobre que carro pode ser vendido.
  CONSTRAINT sale_requests_year_check
    CHECK (year BETWEEN 1950 AND 2100),

  -- Zero é legítimo (carro 0 km). Negativo não é.
  CONSTRAINT sale_requests_mileage_check
    CHECK (mileage >= 0),

  -- NULL significa "não resolvida"; zero ou negativo significaria "resolvida
  -- como nada", que é um dado errado disfarçado de dado.
  CONSTRAINT sale_requests_fipe_reference_value_check
    CHECK (fipe_reference_value IS NULL OR fipe_reference_value > 0)
);

-- SEM CHECK em `transmission` / `fuel_type`, de propósito.
--
-- Mesma decisão da migration 050: `ads` não tem CHECK nessas colunas (ver
-- docs/database/ads-schema-contract.sql), e criar aqui uma regra mais dura que a
-- da tabela com que as fases seguintes vão comparar geraria divergência entre as
-- duas pontas. A allowlist vive na aplicação, nos normalizadores canônicos.

-- Listagem do DONO: "minhas solicitações", mais recentes primeiro. Cobre a
-- ordenação por tupla (created_at DESC, id DESC) usada na paginação por cursor.
CREATE INDEX IF NOT EXISTS sale_requests_owner_created_idx
  ON sale_requests (owner_user_id, created_at DESC, id DESC);

-- Listagem do LOJISTA (Fase 4.2): solicitações abertas da cidade dele.
--
-- Índice PARCIAL em status = 'receiving_offers': solicitação cancelada nunca
-- aparece para lojista, então não precisa ocupar o índice.
--
-- Criado JÁ nesta fase mesmo sem consumidor: pertence à entidade, é barato, e
-- criá-lo depois exigiria uma migration só para isso num banco maior.
CREATE INDEX IF NOT EXISTS sale_requests_city_open_idx
  ON sale_requests (city_id, created_at DESC, id DESC)
  WHERE status = 'receiving_offers';

COMMENT ON TABLE sale_requests IS
  'Fase 4.1 - solicitacao de venda publicada por uma PF para lojas da cidade. Dominio independente: nao e ads, nao aparece em nenhuma superficie publica, nao tem slug.';

COMMENT ON COLUMN sale_requests.city_id IS
  'Cidade escolhida explicitamente pela PF. Sem fallback: nem users.city, nem cookie, nem geolocalizacao, nem advertiser.';

COMMENT ON COLUMN sale_requests.model IS
  'Modelo COMERCIAL derivado (ex.: T-Cross). A descricao FIPE completa vive em fipe_model_description.';

COMMENT ON COLUMN sale_requests.fipe_model_description IS
  'Descricao FIPE completa (traz a versao). Necessaria para avaliacao comercial - diverge de purchase_intents de proposito.';

COMMENT ON COLUMN sale_requests.fipe_reference_value IS
  'Snapshot do valor FIPE no momento da publicacao, com fipe_reference_at. NULL quando nao resolvida - nunca inventado.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | cancelled. selected/completed entram nas fases 4.4/4.5, com migration propria: estado sem writer nao e criado.';
