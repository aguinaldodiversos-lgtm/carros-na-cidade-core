-- 054_sale_requests_vehicle_evaluation.sql
-- Produto 2 — ficha preliminar de avaliação do veículo.
--
-- A Fase 4.1 criou `sale_requests` com o suficiente para IDENTIFICAR o carro
-- (marca, modelo, ano, km, câmbio, combustível) e uma única declaração de
-- estado (`declared_condition`). Isso responde "que carro é", mas não responde
-- a pergunta que o lojista realmente faz antes de gastar tempo com uma visita:
-- "que RISCO e que CUSTO vêm junto?".
--
-- Esta migration acrescenta as dezenove colunas que respondem a isso.
--
-- ============================================================================
-- ADITIVA — E POR QUÊ ISSO IMPORTA AQUI
-- ============================================================================
-- Nada é removido, renomeado ou reescrito. `sale_requests` NÃO é recriada e as
-- migrations 052/053 não são tocadas. Já existem solicitações publicadas por
-- pessoas reais, e o produto continua funcionando para elas mesmo que nenhuma
-- coluna abaixo seja preenchida.
--
-- ============================================================================
-- TODAS NULLABLE — A DISTINÇÃO QUE O NULL PRESERVA
-- ============================================================================
-- Nenhuma coluna nova é NOT NULL, e nenhuma tem DEFAULT.
--
-- É a decisão central desta migration. Um `NOT NULL DEFAULT 'unknown'` seria
-- tecnicamente possível (o default preencheria as linhas antigas de uma vez),
-- mas destruiria uma diferença que tem valor comercial:
--
--     NULL      = a versão anterior do formulário NÃO PERGUNTOU isto.
--     'unknown' = a pessoa foi perguntada e respondeu "não sei informar".
--
-- As duas viram a mesma coisa no banco se houver default, e nenhuma leitura
-- futura consegue desfazer a fusão. A tela do dono trata NULL como "Não
-- informado" — nunca como "Não".
--
-- A obrigatoriedade vive na APLICAÇÃO (`validateEvaluation`), que exige resposta
-- explícita para toda solicitação NOVA. É a mesma divisão de trabalho que a 052
-- já usa em `known_issues`: o banco garante a forma, a aplicação garante a
-- política, e a política pode mudar sem migration.
--
-- ============================================================================
-- CHECKS: FORMA E COERÊNCIA, NÃO POLÍTICA
-- ============================================================================
-- Dois grupos, com propósitos diferentes:
--
--   1. ALLOWLIST por coluna — recusa vocabulário inventado por qualquer caminho
--      que não passe pelos validadores (script, SQL manual, módulo futuro).
--
--   2. COERÊNCIA CRUZADA — torna os estados contraditórios INEXPRIMÍVEIS, e não
--      apenas proibidos por convenção. Um saldo devedor numa linha que declara
--      "não tem financiamento" é um dado que ninguém sabe interpretar depois;
--      é mais barato o banco recusá-lo do que uma fase futura ter de adivinhar
--      qual das duas informações era a verdadeira.
--
-- Todos os CHECKs de coerência passam quando as colunas são NULL, que é
-- exatamente o estado das linhas legadas. Por isso são criados VALIDADOS (sem
-- `NOT VALID`): não existe linha antiga que possa violá-los.

-- ---------------------------------------------------------------------------
-- COLUNAS
-- ---------------------------------------------------------------------------
ALTER TABLE sale_requests
  -- Pneus. Escala fechada ordenada por custo imediato: 'new' não gera despesa,
  -- 'replace_now' gera despesa no ato.
  ADD COLUMN IF NOT EXISTS tire_condition TEXT,

  -- Pendências financeiras. `*_status` usa o vocabulário de TRÊS estados
  -- (yes/no/unknown) porque "não sei" é uma resposta legítima e diferente de
  -- "não" — um boolean forçaria as duas a virarem `false`.
  --
  -- Os valores são NUMERIC(14,2), a convenção monetária do projeto (mesma de
  -- `ads.price`, `purchase_intents.max_price` e `fipe_reference_value`). Nunca
  -- float: dinheiro em binário de ponto flutuante acumula erro de arredondamento
  -- na primeira soma.
  ADD COLUMN IF NOT EXISTS financing_status TEXT,
  ADD COLUMN IF NOT EXISTS financing_balance NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS fines_status TEXT,
  ADD COLUMN IF NOT EXISTS fines_amount NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS ipva_status TEXT,
  ADD COLUMN IF NOT EXISTS ipva_amount_due NUMERIC(14, 2),
  ADD COLUMN IF NOT EXISTS licensing_status TEXT,

  -- Histórico. `caution_report_status` é UMA coluna, e não o par
  -- (possui_laudo, resultado): duas colunas independentes permitem o estado
  -- impossível "não possui laudo + resultado aprovado", e seriam dois CHECKs
  -- que não se enxergam. Um vocabulário único torna esse estado inexprimível.
  ADD COLUMN IF NOT EXISTS caution_report_status TEXT,
  ADD COLUMN IF NOT EXISTS auction_history TEXT,
  ADD COLUMN IF NOT EXISTS collision_history TEXT,

  -- Mecânica, por conjunto. 'ok' significa SEM PROBLEMA CONHECIDO PELO
  -- PROPRIETÁRIO — não "mecanicamente perfeito". As notas só existem quando a
  -- condição é 'issue' (ver CHECKs de coerência).
  ADD COLUMN IF NOT EXISTS engine_condition TEXT,
  ADD COLUMN IF NOT EXISTS engine_notes TEXT,
  ADD COLUMN IF NOT EXISTS gearbox_condition TEXT,
  ADD COLUMN IF NOT EXISTS gearbox_notes TEXT,
  ADD COLUMN IF NOT EXISTS suspension_condition TEXT,
  ADD COLUMN IF NOT EXISTS suspension_notes TEXT,

  -- Lataria e pintura. `body_paint_issues` é JSONB seguindo a convenção que a
  -- 037 estabeleceu para conjunto de atributos de veículo (`ads.vehicle_options`),
  -- e não TEXT[] — a migration 037 é o único precedente do projeto para esse
  -- formato, e duas convenções de coleção obrigariam todo consumidor futuro a
  -- saber qual tabela usa qual.
  --
  -- Guarda um ARRAY de valores da allowlist, nunca texto livre: o "onde" fica em
  -- `body_paint_notes`, separado, para que o QUE continue agregável.
  ADD COLUMN IF NOT EXISTS body_paint_status TEXT,
  ADD COLUMN IF NOT EXISTS body_paint_issues JSONB,
  ADD COLUMN IF NOT EXISTS body_paint_notes TEXT;

-- ---------------------------------------------------------------------------
-- GRUPO 1 — ALLOWLISTS
-- ---------------------------------------------------------------------------
-- `IS NULL OR ...` em todas: a linha legada tem NULL e precisa continuar válida.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_tire_condition_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_tire_condition_check
      CHECK (tire_condition IS NULL OR tire_condition IN (
        'new', 'good', 'half_life', 'replace_soon', 'replace_now', 'unknown'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_financing_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_financing_status_check
      CHECK (financing_status IS NULL OR financing_status IN ('yes', 'no', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_fines_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_fines_status_check
      CHECK (fines_status IS NULL OR fines_status IN ('yes', 'no', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_ipva_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_ipva_status_check
      CHECK (ipva_status IS NULL OR ipva_status IN ('paid', 'installments', 'open', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_licensing_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_licensing_status_check
      CHECK (licensing_status IS NULL OR licensing_status IN ('ok', 'pending', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_caution_report_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_caution_report_status_check
      CHECK (caution_report_status IS NULL OR caution_report_status IN (
        'not_available', 'approved', 'approved_with_notes', 'rejected', 'unknown'
      ));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_auction_history_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_auction_history_check
      CHECK (auction_history IS NULL OR auction_history IN ('yes', 'no', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_collision_history_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_collision_history_check
      CHECK (collision_history IS NULL OR collision_history IN ('yes', 'no', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_engine_condition_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_engine_condition_check
      CHECK (engine_condition IS NULL OR engine_condition IN ('ok', 'issue', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_gearbox_condition_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_gearbox_condition_check
      CHECK (gearbox_condition IS NULL OR gearbox_condition IN ('ok', 'issue', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_suspension_condition_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_suspension_condition_check
      CHECK (suspension_condition IS NULL OR suspension_condition IN ('ok', 'issue', 'unknown'));
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_body_paint_status_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_body_paint_status_check
      CHECK (body_paint_status IS NULL OR body_paint_status IN ('issues', 'none', 'unknown'));
  END IF;

  -- JSONB aceita qualquer coisa: objeto, número, string. Sem este CHECK,
  -- `body_paint_issues = '"riscos"'` seria aceito e `jsonb_array_length` abaixo
  -- lançaria erro de tipo em tempo de leitura — longe de onde o dado entrou.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_body_paint_issues_array_check') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_body_paint_issues_array_check
      CHECK (body_paint_issues IS NULL OR jsonb_typeof(body_paint_issues) = 'array');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- GRUPO 2 — COERÊNCIA CRUZADA
-- ---------------------------------------------------------------------------
-- Cada valor monetário só pode existir junto da resposta que o justifica, e
-- cada descrição de problema só pode existir junto de 'issue'.
--
-- A forma `X IS NULL OR <condição sobre o status>` é NULL-safe nos dois lados:
-- linha legada (tudo NULL) passa pelo primeiro ramo.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_financing_balance_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_financing_balance_coherence
      CHECK (
        financing_balance IS NULL
        OR (financing_status = 'yes' AND financing_balance >= 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_fines_amount_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_fines_amount_coherence
      CHECK (
        fines_amount IS NULL
        OR (fines_status = 'yes' AND fines_amount >= 0)
      );
  END IF;

  -- Quitado e "não sei" não têm valor pendente; parcelado e em aberto têm.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_ipva_amount_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_ipva_amount_coherence
      CHECK (
        ipva_amount_due IS NULL
        OR (ipva_status IN ('installments', 'open') AND ipva_amount_due >= 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_engine_notes_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_engine_notes_coherence
      CHECK (engine_notes IS NULL OR engine_condition = 'issue');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_gearbox_notes_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_gearbox_notes_coherence
      CHECK (gearbox_notes IS NULL OR gearbox_condition = 'issue');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_suspension_notes_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_suspension_notes_coherence
      CHECK (suspension_notes IS NULL OR suspension_condition = 'issue');
  END IF;

  -- Bicondicional: quando o estado foi declarado, "é 'issues'" tem de ser
  -- EXATAMENTE o mesmo que "tem ao menos um detalhe marcado". Isso barra as duas
  -- contradições de uma vez — 'issues' com lista vazia, e 'none'/'unknown' com
  -- detalhes marcados.
  --
  -- `COALESCE(..., 0)` cobre o caso em que a lista é NULL: zero detalhes.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_body_paint_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_body_paint_coherence
      CHECK (
        body_paint_status IS NULL
        OR (body_paint_status = 'issues')
           = (COALESCE(jsonb_array_length(body_paint_issues), 0) > 0)
      );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sale_requests_body_paint_notes_coherence') THEN
    ALTER TABLE sale_requests
      ADD CONSTRAINT sale_requests_body_paint_notes_coherence
      CHECK (body_paint_notes IS NULL OR body_paint_status = 'issues');
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- ÍNDICE
-- ---------------------------------------------------------------------------
-- GIN em `body_paint_issues`, mesmo padrão de `ads_vehicle_options_gin` (037).
-- A Fase 4.2 vai filtrar solicitações por tipo de avaria ("mostre os que não
-- passaram por reparo de colisão"), e o operador de contenção do JSONB só é
-- indexável assim. Barato agora, caro depois num banco maior.
CREATE INDEX IF NOT EXISTS sale_requests_body_paint_issues_gin
  ON sale_requests USING gin (body_paint_issues);

-- ---------------------------------------------------------------------------
-- COMENTÁRIOS
-- ---------------------------------------------------------------------------
COMMENT ON COLUMN sale_requests.tire_condition IS
  'Estado declarado dos pneus. NULL = solicitacao anterior a esta migration (nao perguntado), nunca "nao sei".';

COMMENT ON COLUMN sale_requests.financing_status IS
  'yes | no | unknown. Tres estados de proposito: "nao sei" e diferente de "nao" para quem vai fazer oferta.';

COMMENT ON COLUMN sale_requests.caution_report_status IS
  'Vocabulario UNICO (not_available | approved | approved_with_notes | rejected | unknown). Um so campo torna impossivel "sem laudo + aprovado".';

COMMENT ON COLUMN sale_requests.engine_condition IS
  'ok | issue | unknown. "ok" = sem problema CONHECIDO PELO PROPRIETARIO; nao e atestado mecanico.';

COMMENT ON COLUMN sale_requests.body_paint_issues IS
  'Array JSONB da allowlist (scratches, dents, worn_paint, repainted_parts, collision_repair). Vazio quando o estado e none/unknown; NULL apenas em linha legada.';
