-- 058_sale_request_inspection_final_offer.sql
-- Fase 4.5 — a AVALIAÇÃO PRESENCIAL e a PROPOSTA FINAL da loja selecionada.
--
-- A 4.4 terminou com a solicitação em `offer_selected`: o proprietário escolheu
-- uma proposta PRELIMINAR e a disputa acabou. Esta migration cria o que vem
-- depois — agendar a visita, registrar o que a loja VIU, e apresentar a proposta
-- final.
--
-- ============================================================================
-- O PRINCÍPIO QUE GOVERNA TODO O SCHEMA ABAIXO
-- ============================================================================
-- A proposta preliminar foi feita sobre FOTOS E DECLARAÇÕES. Ela não é
-- compromisso definitivo, e a avaliação presencial existe justamente para
-- confirmar ou corrigir aquela percepção.
--
-- Consequência direta, e é a decisão mais importante desta fase: **nenhuma regra
-- da disputa preliminar se aplica à proposta final**. Não há CHECK exigindo
-- `final >= minimum_accepted_price`, nem `final >= proposta selecionada`, nem
-- `final > maior proposta`. Essas três regras encerraram a função delas quando a
-- disputa acabou, e reaplicá-las aqui recusaria exatamente o caso que a
-- avaliação existe para descobrir: o carro vale menos do que parecia na foto.
--
-- O único piso da proposta final é `> 0`. O que a substitui, como proteção do
-- proprietário, não é um valor mínimo — é a EXIGÊNCIA DE JUSTIFICATIVA quando o
-- valor cai (ver o CHECK de `sale_request_post_inspection_decisions`).
--
-- ============================================================================
-- O QUE ESTA MIGRATION NÃO CRIA
-- ============================================================================
-- Não existe aceite, recusa, contraproposta, renegociação, pagamento, contrato,
-- comissão, escrow, reabertura para lojas perdedoras, troca da loja selecionada,
-- reagendamento pós-confirmação, prazo, cronômetro nem no-show. Nenhum deles tem
-- writer nesta fase, e estado sem writer é o erro que as migrations 030, 052 e
-- 055 documentam. O aceite/recusa é a Fase 4.6.
--
-- ============================================================================
-- SEM `DO $$ ... EXCEPTION WHEN OTHERS`
-- ============================================================================
-- Mesma decisão de 049–057: para tabela genuinamente nova, falhar alto é o
-- comportamento certo. Os blocos `DO $$` abaixo NÃO engolem erro — apenas tornam
-- a migration reexecutável, porque o PostgreSQL não oferece `IF NOT EXISTS` na
-- sintaxe de `ADD CONSTRAINT`.

-- ===========================================================================
-- 1. O CHECK DE STATUS — quatro estados novos, todos com writer
-- ===========================================================================
-- `offer_selected` (4.4) deixa de ser terminal e passa a ser o começo:
--
--   offer_selected        → a loja ainda não mandou horários, ou mandou e o
--                           proprietário ainda não escolheu. O agendamento tem
--                           estados PRÓPRIOS (ver `schedule_status`), e eles
--                           NÃO viram status da oportunidade: `awaiting_slots`
--                           e `awaiting_owner` são passos de um sub-processo,
--                           não fases do negócio.
--   inspection_scheduled  → há um horário CONFIRMADO.
--   inspection_completed  → a loja registrou o que viu.
--   final_offer_submitted → a loja apresentou a proposta final.
--   final_offer_declined  → a loja avaliou e decidiu NÃO propor.
--
-- Os dois últimos são terminais NESTA FASE. `final_offer_declined` não volta
-- para `receiving_offers` e não reabre para as lojas perdedoras — essa é uma
-- decisão de produto que a 4.6 vai tomar, e tomá-la aqui por omissão seria
-- decidi-la sem ninguém perceber.
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
    'cancelled'
  ));

-- ===========================================================================
-- 2. O CHECK DE COERÊNCIA — REESCRITO (o gate obrigatório da fase)
-- ===========================================================================
-- A 057 escreveu a bi-implicação assim:
--
--     (status =  'offer_selected' AND selected_offer_id IS NOT NULL AND …)
--  OR (status <> 'offer_selected' AND selected_offer_id IS     NULL AND …)
--
-- Aquilo estava certo quando `offer_selected` era o ÚNICO estado com seleção. A
-- segunda metade usa `<>`, então todo estado novo cai automaticamente no ramo
-- que EXIGE `selected_offer_id IS NULL` — e `inspection_scheduled` seria
-- rejeitado pelo banco, com a seleção que acabou de acontecer.
--
-- Sem esta reescrita, a Fase 4.5 não consegue avançar UMA transição sequer. É o
-- motivo de este bloco ser o gate da migration.
--
-- A forma nova é uma partição EXPLÍCITA por lista, e não uma negação:
--
--   COM seleção:  offer_selected, inspection_scheduled, inspection_completed,
--                 final_offer_submitted, final_offer_declined
--   SEM seleção:  receiving_offers, cancelled
--
-- Enumerar os dois lados é mais verboso e é o ponto: um estado novo criado por
-- uma fase futura não entra em nenhuma das duas listas, e o CHECK falha na hora
-- — obrigando quem o criou a decidir conscientemente de que lado ele fica. Com
-- `<>`, o estado novo seria silenciosamente colocado no lado errado, exatamente
-- como aconteceu aqui.
--
-- A seleção preliminar continua sendo a RAIZ do processo em todos os estados
-- posteriores: ela é quem diz qual loja tem o direito de agendar, inspecionar e
-- propor. Perder `selected_offer_id` no meio do caminho deixaria a inspeção sem
-- dono comprovável.
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
          'final_offer_declined'
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

-- ===========================================================================
-- 3. A CHAVE CANDIDATA DA SELEÇÃO — alvo da prova de "loja selecionada"
-- ===========================================================================
-- `sale_request_offer_selections` já tem `UNIQUE (sale_request_id)`, então esta
-- não acrescenta unicidade nenhuma. Ela existe pelo mesmo motivo das chaves da
-- 4.4.1: o PostgreSQL só aceita como ALVO de FK um conjunto de colunas coberto
-- **exatamente** por PK ou UNIQUE.
--
-- Com ela, a inspeção pode PROVAR NO BANCO que pertence à loja selecionada —
-- em vez de o service comparar dois ids e torcer para todo caminho futuro
-- lembrar de comparar também.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_offer_selections_request_advertiser_unique'
  ) THEN
    ALTER TABLE sale_request_offer_selections
      ADD CONSTRAINT sale_request_offer_selections_request_advertiser_unique
      UNIQUE (sale_request_id, advertiser_id);
  END IF;
END $$;

-- ===========================================================================
-- 4. A INSPEÇÃO — uma linha por solicitação
-- ===========================================================================
CREATE TABLE IF NOT EXISTS sale_request_inspections (
  id BIGSERIAL PRIMARY KEY,

  sale_request_id BIGINT NOT NULL,

  -- A loja que vai avaliar. NÃO é "uma loja qualquer": a FK composta lá embaixo
  -- prova contra `sale_request_offer_selections` que é EXATAMENTE a loja cuja
  -- proposta o proprietário escolheu.
  advertiser_id BIGINT NOT NULL,

  -- ==========================================================================
  -- O SUB-PROCESSO DE AGENDAMENTO
  -- ==========================================================================
  -- `schedule_status` descreve onde está a NEGOCIAÇÃO DO HORÁRIO, e vive aqui
  -- em vez de virar status da solicitação de propósito (§5). "A loja ainda não
  -- mandou horários" e "o proprietário ainda não escolheu" não são fases do
  -- negócio — do ponto de vista de quem está vendendo o carro, as duas são a
  -- mesma coisa: a visita ainda não foi marcada.
  --
  -- Promover cada passo a status da oportunidade obrigaria todo filtro, todo
  -- feed e todo DTO do domínio a conhecer quatro valores a mais que não mudam
  -- nada para eles.
  schedule_status TEXT NOT NULL DEFAULT 'awaiting_slots',

  -- Qual RODADA de horários está valendo. Começa em 0 (nenhuma enviada) e sobe
  -- a cada conjunto novo. É o que torna "escolher um horário de uma rodada já
  -- substituída" detectável — ver o §11/§12 e o código `INSPECTION_SLOT_STALE`.
  schedule_round INTEGER NOT NULL DEFAULT 0,

  -- O horário ESCOLHIDO. FK composta (mais abaixo) prova que o slot é de uma
  -- rodada DESTA inspeção, e não de outra.
  confirmed_slot_id BIGINT,

  -- O instante confirmado, copiado do slot no momento da confirmação.
  --
  -- Redundante com `slot.starts_at` por um motivo: a leitura mais quente das
  -- duas telas ("quando é a visita?") não deve depender de um JOIN, e o valor é
  -- imutável depois de confirmado (não existe reagendamento nesta fase). Se um
  -- dia existir, esta coluna passa a ser o instante VIGENTE e o histórico
  -- continua nos slots.
  scheduled_at TIMESTAMPTZ,

  -- ==========================================================================
  -- O QUE A LOJA OBSERVOU — preenchido na conclusão, nunca antes
  -- ==========================================================================
  -- Todas as colunas abaixo usam os MESMOS vocabulários da ficha declarada pela
  -- PF (migration 054). Não há uma segunda taxonomia, e a repetição do
  -- vocabulário é o que torna a comparação possível: "a pessoa disse `good` nos
  -- pneus, a loja viu `replace_now`" só é uma frase legível se os dois lados
  -- falarem a mesma língua.
  --
  -- O prefixo `observed_` é o que impede a confusão entre as duas fontes. NADA
  -- aqui sobrescreve a declaração original — `sale_requests.mileage` e a ficha
  -- da 054 permanecem exatamente como o proprietário as escreveu, para sempre.
  -- Corrigir o dado dele seria apagar a prova de que houve divergência, que é
  -- justamente o que justifica uma redução de valor.
  observed_mileage INTEGER,
  observed_condition TEXT,
  observed_tire_condition TEXT,
  observed_engine_condition TEXT,
  observed_gearbox_condition TEXT,
  observed_suspension_condition TEXT,
  observed_body_paint_status TEXT,
  observed_body_paint_issues JSONB,

  -- Observação livre da loja, VISÍVEL ao proprietário.
  --
  -- Limitada pela aplicação. Não é canal de conversa: não existe resposta, não
  -- existe `read_at`, não existe thread — e a ausência das três é deliberada,
  -- porque juntas seriam um chat.
  inspection_notes TEXT,

  completed_at TIMESTAMPTZ,
  completed_by_user_id BIGINT REFERENCES users(id),

  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_inspections_schedule_status_check
    CHECK (schedule_status IN ('awaiting_slots', 'awaiting_owner', 'scheduled', 'completed')),

  CONSTRAINT sale_request_inspections_round_check
    CHECK (schedule_round >= 0),

  -- Zero km é legítimo num carro 0 km; negativo não é. Mesma regra da 052.
  CONSTRAINT sale_request_inspections_observed_mileage_check
    CHECK (observed_mileage IS NULL OR observed_mileage >= 0),

  -- ==========================================================================
  -- COERÊNCIA DO AGENDAMENTO
  -- ==========================================================================
  -- `scheduled` e `completed` exigem horário confirmado; os outros dois exigem
  -- que ele NÃO exista. Sem isto seria possível ter `awaiting_slots` com um
  -- horário marcado, ou `scheduled` sem nada para mostrar na tela.
  CONSTRAINT sale_request_inspections_schedule_coherence_check
    CHECK (
      (
        schedule_status IN ('scheduled', 'completed')
        AND confirmed_slot_id IS NOT NULL
        AND scheduled_at IS NOT NULL
      )
      OR
      (
        schedule_status IN ('awaiting_slots', 'awaiting_owner')
        AND confirmed_slot_id IS NULL
        AND scheduled_at IS NULL
      )
    ),

  -- ==========================================================================
  -- COERÊNCIA DA CONCLUSÃO
  -- ==========================================================================
  -- `completed` exige a ficha inteira preenchida, o instante e o operador.
  -- Qualquer outro estado exige que nada disso exista.
  --
  -- `observed_body_paint_issues` fica FORA da lista de obrigatórios de
  -- propósito: ele só faz sentido quando o status é `issues`, e a aplicação
  -- impõe essa relação (o mesmo desenho da 054, cujo CHECK cruzado vive lá).
  -- Exigi-lo aqui obrigaria a gravar `[]` para um carro sem avaria — um array
  -- vazio que diria "respondido: nenhuma" onde a resposta correta é a própria
  -- ausência da pergunta.
  --
  -- `inspection_notes` também fica fora: observação é opcional, e obrigá-la
  -- produziria texto de preenchimento.
  CONSTRAINT sale_request_inspections_completion_coherence_check
    CHECK (
      (
        schedule_status = 'completed'
        AND completed_at IS NOT NULL
        AND completed_by_user_id IS NOT NULL
        AND observed_mileage IS NOT NULL
        AND observed_condition IS NOT NULL
        AND observed_tire_condition IS NOT NULL
        AND observed_engine_condition IS NOT NULL
        AND observed_gearbox_condition IS NOT NULL
        AND observed_suspension_condition IS NOT NULL
        AND observed_body_paint_status IS NOT NULL
      )
      OR
      (
        schedule_status <> 'completed'
        AND completed_at IS NULL
        AND completed_by_user_id IS NULL
        AND observed_mileage IS NULL
        AND observed_condition IS NULL
        AND observed_tire_condition IS NULL
        AND observed_engine_condition IS NULL
        AND observed_gearbox_condition IS NULL
        AND observed_suspension_condition IS NULL
        AND observed_body_paint_status IS NULL
      )
    ),

  -- ==========================================================================
  -- ALLOWLISTS — os MESMOS vocabulários da 054
  -- ==========================================================================
  -- Escritas aqui, e não só na aplicação, pelo motivo que a 054 documenta: um
  -- script de manutenção ou um SQL manual não passa pelos validadores, e um
  -- valor fora do vocabulário quebraria a comparação declarado × observado sem
  -- erro em lugar nenhum.
  CONSTRAINT sale_request_inspections_observed_condition_check
    CHECK (observed_condition IS NULL OR observed_condition IN
      ('excelente', 'bom', 'regular', 'precisa_reparos')),

  CONSTRAINT sale_request_inspections_observed_tire_check
    CHECK (observed_tire_condition IS NULL OR observed_tire_condition IN
      ('new', 'good', 'half_life', 'replace_soon', 'replace_now', 'unknown')),

  CONSTRAINT sale_request_inspections_observed_engine_check
    CHECK (observed_engine_condition IS NULL OR observed_engine_condition IN
      ('ok', 'issue', 'unknown')),

  CONSTRAINT sale_request_inspections_observed_gearbox_check
    CHECK (observed_gearbox_condition IS NULL OR observed_gearbox_condition IN
      ('ok', 'issue', 'unknown')),

  CONSTRAINT sale_request_inspections_observed_suspension_check
    CHECK (observed_suspension_condition IS NULL OR observed_suspension_condition IN
      ('ok', 'issue', 'unknown')),

  CONSTRAINT sale_request_inspections_observed_body_paint_check
    CHECK (observed_body_paint_status IS NULL OR observed_body_paint_status IN
      ('issues', 'none', 'unknown')),

  -- `jsonb_typeof` e NÃO `jsonb_array_length`: aquela função LANÇA em valor
  -- não-array (SQLSTATE 22023, não 23514), e quem trata violação de constraint
  -- para virar mensagem de campo não reconheceria o erro. A 054 registrou esse
  -- modo de falha por escrito.
  CONSTRAINT sale_request_inspections_observed_issues_type_check
    CHECK (
      observed_body_paint_issues IS NULL
      OR jsonb_typeof(observed_body_paint_issues) = 'array'
    ),

  -- Contenção (`<@`) em vez de subconsulta: CHECK com subquery é proibido no
  -- PostgreSQL. O CHECK de tipo acima é necessário JUNTO deste, porque o `<@`
  -- considera um escalar contido num array que o tenha como elemento — sozinho,
  -- ele deixaria passar `'"scratches"'::jsonb`, que não é array.
  CONSTRAINT sale_request_inspections_observed_issues_allowlist_check
    CHECK (
      observed_body_paint_issues IS NULL
      OR observed_body_paint_issues <@
        '["scratches","dents","worn_paint","repainted_parts","collision_repair"]'::jsonb
    ),

  -- ==========================================================================
  -- A PROVA DE QUE ESTA É A LOJA SELECIONADA
  -- ==========================================================================
  -- Ler em voz alta: "existe uma seleção, nesta solicitação, cuja loja é esta".
  --
  -- Sem ela, `advertiser_id` seria só um número que o service prometeu conferir
  -- — e a promessa vale até o primeiro caminho novo que esqueça de conferir. É
  -- o mesmo raciocínio da 4.4.1, e o alvo é a chave candidata criada no bloco 3.
  --
  -- Sem `ON DELETE`: a inspeção é parte da trilha do negócio e não some em
  -- silêncio (mesma política da 4.4.1).
  CONSTRAINT sale_request_inspections_selected_store_fk
    FOREIGN KEY (sale_request_id, advertiser_id)
    REFERENCES sale_request_offer_selections (sale_request_id, advertiser_id),

  CONSTRAINT sale_request_inspections_request_fk
    FOREIGN KEY (sale_request_id) REFERENCES sale_requests (id),

  CONSTRAINT sale_request_inspections_advertiser_fk
    FOREIGN KEY (advertiser_id) REFERENCES advertisers (id)
);

-- UMA inspeção por solicitação (§9).
CREATE UNIQUE INDEX IF NOT EXISTS sale_request_inspections_request_uidx
  ON sale_request_inspections (sale_request_id);

-- Chave candidata: alvo das FKs compostas dos slots e da decisão final.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_inspections_id_request_advertiser_unique'
  ) THEN
    ALTER TABLE sale_request_inspections
      ADD CONSTRAINT sale_request_inspections_id_request_advertiser_unique
      UNIQUE (id, sale_request_id, advertiser_id);
  END IF;
END $$;

-- "As avaliações desta loja", cronológico. Alimenta a agenda do lojista.
CREATE INDEX IF NOT EXISTS sale_request_inspections_advertiser_idx
  ON sale_request_inspections (advertiser_id, scheduled_at DESC, id DESC);

-- ===========================================================================
-- 5. OS HORÁRIOS PROPOSTOS — append-only, por rodada
-- ===========================================================================
CREATE TABLE IF NOT EXISTS sale_request_inspection_slots (
  id BIGSERIAL PRIMARY KEY,

  inspection_id BIGINT NOT NULL
    REFERENCES sale_request_inspections (id),

  -- A rodada a que este horário pertence. Horário de rodada anterior NÃO pode
  -- ser escolhido (§11) — e continua no banco, porque o histórico de quantas
  -- vezes foi preciso remarcar é informação real sobre o negócio.
  round_no INTEGER NOT NULL,

  -- TIMESTAMPTZ, sempre. O payload chega em ISO 8601 COM offset explícito
  -- (`2026-08-25T14:30:00-03:00`) e a aplicação recusa timestamp sem offset.
  --
  -- Nada aqui presume `America/Sao_Paulo`: o portal opera em várias cidades, e
  -- inferir fuso pela UF erraria em qualquer expansão. A formatação em pt-BR é
  -- assunto exclusivo da tela.
  starts_at TIMESTAMPTZ NOT NULL,

  created_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_inspection_slots_round_check CHECK (round_no >= 1),

  -- O mesmo instante duas vezes na mesma rodada não é opção: seriam dois botões
  -- idênticos na tela do proprietário.
  CONSTRAINT sale_request_inspection_slots_unique
    UNIQUE (inspection_id, round_no, starts_at)
);

-- Chave candidata: alvo da FK composta de `confirmed_slot_id`.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_inspection_slots_id_inspection_unique'
  ) THEN
    ALTER TABLE sale_request_inspection_slots
      ADD CONSTRAINT sale_request_inspection_slots_id_inspection_unique
      UNIQUE (id, inspection_id);
  END IF;
END $$;

-- A leitura quente: "os horários da rodada atual desta inspeção".
CREATE INDEX IF NOT EXISTS sale_request_inspection_slots_round_idx
  ON sale_request_inspection_slots (inspection_id, round_no, starts_at);

-- ---------------------------------------------------------------------------
-- A FK COMPOSTA DO HORÁRIO CONFIRMADO
-- ---------------------------------------------------------------------------
-- Declarada por `ALTER TABLE` porque as duas tabelas se referenciam: os slots
-- apontam para a inspeção, e a inspeção aponta para o slot escolhido. A ordem
-- de criação resolve o ciclo.
--
-- `(confirmed_slot_id, id) → slots (id, inspection_id)` — a mesma forma da FK da
-- 4.4.1: prova PERTENCIMENTO, e não só existência. Sem o par, seria possível
-- confirmar para esta inspeção um horário proposto em outra.
--
-- MATCH SIMPLE (o padrão) é obrigatório: `confirmed_slot_id` é nullable
-- enquanto ninguém escolheu, e `id` nunca é nulo. Com `MATCH FULL`, toda
-- inspeção sem horário confirmado seria rejeitada e a migration morreria no
-- primeiro banco com dados.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'sale_request_inspections_confirmed_slot_fk'
  ) THEN
    ALTER TABLE sale_request_inspections
      ADD CONSTRAINT sale_request_inspections_confirmed_slot_fk
      FOREIGN KEY (confirmed_slot_id, id)
      REFERENCES sale_request_inspection_slots (id, inspection_id);
  END IF;
END $$;

-- ===========================================================================
-- 6. A DECISÃO COMERCIAL PÓS-INSPEÇÃO — uma por solicitação
-- ===========================================================================
CREATE TABLE IF NOT EXISTS sale_request_post_inspection_decisions (
  id BIGSERIAL PRIMARY KEY,

  sale_request_id BIGINT NOT NULL,
  inspection_id BIGINT NOT NULL,
  advertiser_id BIGINT NOT NULL,

  -- A proposta preliminar que originou tudo. Guardada para que a decisão
  -- descreva a COMPARAÇÃO inteira sem depender de JOIN — e para que a FK
  -- composta abaixo prove que ela é mesmo a oferta selecionada desta loja.
  selected_offer_id BIGINT NOT NULL,

  -- `final_offer` | `no_offer`. Duas saídas, e só duas: depois de ver o carro,
  -- ou a loja propõe um valor, ou diz que não vai propor. "Talvez", "pendente" e
  -- "em análise" não são decisões e não teriam quem as escrevesse.
  decision_type TEXT NOT NULL,

  -- O valor preliminar CONGELADO, pelo mesmo argumento do `amount_snapshot` da
  -- 057: a comparação "de quanto para quanto" não pode mudar retroativamente se
  -- outra tabela for corrigida.
  preliminary_amount_snapshot NUMERIC(14, 2) NOT NULL,

  -- O valor final. NULL quando a loja não propõe (ver o CHECK).
  --
  -- SEM piso além de `> 0`, e isso é a decisão central da fase: `minimum_accepted_price`,
  -- a proposta selecionada e a maior proposta da disputa NÃO são barreiras aqui.
  final_amount NUMERIC(14, 2),

  -- ==========================================================================
  -- A JUSTIFICATIVA
  -- ==========================================================================
  -- `adjustment_reason` reutiliza os domínios da própria inspeção (mecânica,
  -- lataria, pneus, quilometragem…) em vez de inventar uma lista nova: o motivo
  -- de um valor cair é, quase sempre, uma das dimensões que a loja acabou de
  -- avaliar, e usar o mesmo vocabulário permite ligar a justificativa à linha da
  -- ficha que a sustenta.
  adjustment_reason TEXT,

  -- Explicação curta, VISÍVEL ao proprietário.
  adjustment_note TEXT,

  -- ==========================================================================
  -- NOTA INTERNA — separada, e a separação é a regra
  -- ==========================================================================
  -- Comentário operacional da loja que o proprietário NUNCA vê. Existe como
  -- coluna PRÓPRIA, e não como um trecho de `adjustment_note`, porque misturar
  -- as duas garantiria o vazamento: a primeira pessoa a escrever "combinar com o
  -- João, ramal 42" num campo compartilhado entregaria isso ao vendedor.
  --
  -- Nenhum DTO do proprietário seleciona esta coluna.
  internal_note TEXT,

  decided_by_user_id BIGINT NOT NULL REFERENCES users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT sale_request_post_inspection_decisions_type_check
    CHECK (decision_type IN ('final_offer', 'no_offer')),

  -- ==========================================================================
  -- O CHECK QUE LIGA TIPO E VALOR (§28)
  -- ==========================================================================
  -- `final_offer` exige valor positivo; `no_offer` exige ausência de valor.
  --
  -- Sem ele seriam expressáveis dois absurdos que a tela não saberia renderizar:
  -- uma proposta final sem valor, e uma desistência com valor — esta última
  -- especialmente perigosa, porque o proprietário veria um número ao lado de
  -- "a loja não vai propor".
  CONSTRAINT sale_request_post_inspection_decisions_amount_check
    CHECK (
      (decision_type = 'final_offer' AND final_amount IS NOT NULL AND final_amount > 0)
      OR
      (decision_type = 'no_offer' AND final_amount IS NULL)
    ),

  -- ==========================================================================
  -- REDUZIR O VALOR EXIGE DIZER POR QUÊ (§25)
  -- ==========================================================================
  -- Esta é a proteção que substitui os pisos removidos. O proprietário não pode
  -- receber `R$ 65.000 → R$ 57.000` sem um motivo registrado — e o banco é quem
  -- garante isso, porque é a única camada que nenhum caminho novo contorna.
  --
  -- `no_offer` também exige motivo: desistir depois de ver o carro é uma
  -- informação valiosa para quem continua tentando vendê-lo.
  --
  -- Valor MAIOR ou IGUAL não exige justificativa: não há o que explicar quando
  -- ninguém perde nada.
  CONSTRAINT sale_request_post_inspection_decisions_reason_check
    CHECK (
      adjustment_reason IS NOT NULL
      OR (
        decision_type = 'final_offer'
        AND final_amount >= preliminary_amount_snapshot
      )
    ),

  CONSTRAINT sale_request_post_inspection_decisions_reason_allowlist_check
    CHECK (
      adjustment_reason IS NULL
      OR adjustment_reason IN (
        'mechanical',
        'body_paint',
        'tires',
        'mileage_difference',
        'documentation',
        'other'
      )
    ),

  -- `other` não diz nada sozinho — é a opção de escape, e sem texto ela vira uma
  -- justificativa que não justifica.
  CONSTRAINT sale_request_post_inspection_decisions_other_note_check
    CHECK (
      adjustment_reason IS DISTINCT FROM 'other'
      OR (adjustment_note IS NOT NULL AND btrim(adjustment_note) <> '')
    ),

  CONSTRAINT sale_request_post_inspection_decisions_preliminary_check
    CHECK (preliminary_amount_snapshot > 0),

  -- ==========================================================================
  -- INTEGRIDADE COMPOSTA (§29) — três provas, duas FKs
  -- ==========================================================================
  -- 1. a inspeção é DESTA solicitação e DESTA loja;
  -- 2. a oferta preliminar é DESTA solicitação e DESTA loja.
  --
  -- Juntas, elas tornam inexprimível a decisão que mistura peças válidas de
  -- negócios diferentes — o modo de falha que a 4.4.1 documenta. A segunda
  -- reaproveita a chave candidata tripla criada lá; nenhuma UNIQUE nova foi
  -- necessária para ela.
  --
  -- Não há FK simples de `inspection_id` nem de `selected_offer_id` ao lado
  -- delas: seriam estritamente mais fracas e verificariam de novo o que as
  -- compostas já verificam.
  CONSTRAINT sale_request_post_inspection_decisions_inspection_fk
    FOREIGN KEY (inspection_id, sale_request_id, advertiser_id)
    REFERENCES sale_request_inspections (id, sale_request_id, advertiser_id),

  CONSTRAINT sale_request_post_inspection_decisions_offer_fk
    FOREIGN KEY (selected_offer_id, sale_request_id, advertiser_id)
    REFERENCES sale_request_offers (id, sale_request_id, advertiser_id)
);

-- UMA decisão por solicitação (§27). É a metade estrutural do §37: o lock
-- serializa e devolve 409 legível; este índice garante o invariante mesmo que
-- alguém remova o lock ou abra um caminho de escrita novo.
CREATE UNIQUE INDEX IF NOT EXISTS sale_request_post_inspection_decisions_request_uidx
  ON sale_request_post_inspection_decisions (sale_request_id);

CREATE INDEX IF NOT EXISTS sale_request_post_inspection_decisions_advertiser_idx
  ON sale_request_post_inspection_decisions (advertiser_id, created_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- SEM `updated_at`, SEM `status`
-- ---------------------------------------------------------------------------
-- As três tabelas desta migration têm partes imutáveis por decisão de produto: a
-- ficha da inspeção não é editável depois de concluída (§21) e a decisão
-- comercial não é editável depois de enviada (§30). Uma coluna `updated_at`
-- sugeriria o contrário para quem lesse o schema.
--
-- `sale_request_inspections` sofre UPDATE, mas apenas em transições declaradas
-- (rodada nova, confirmação, conclusão) — nunca em correção de conteúdo já
-- registrado.

COMMENT ON TABLE sale_request_inspections IS
  'Fase 4.5 - a avaliacao presencial. Uma linha por solicitacao. schedule_status descreve o SUB-PROCESSO de agendamento e NAO vira status da oportunidade. As colunas observed_* usam os MESMOS vocabularios da ficha declarada (054) para permitir comparacao, e nunca sobrescrevem a declaracao do proprietario.';

COMMENT ON COLUMN sale_request_inspections.advertiser_id IS
  'A loja selecionada. FK composta contra sale_request_offer_selections prova NO BANCO que e a loja cuja proposta o proprietario escolheu - nao e um id que o service prometeu conferir.';

COMMENT ON COLUMN sale_request_inspections.observed_mileage IS
  'Quilometragem lida no odometro. NUNCA sobrescreve sale_requests.mileage: a divergencia entre declarado e observado e o que justifica uma eventual reducao de valor, e apaga-la destruiria a prova.';

COMMENT ON COLUMN sale_request_inspections.schedule_round IS
  'Rodada de horarios vigente. 0 = nenhuma enviada. Horario de rodada anterior nao pode ser escolhido (INSPECTION_SLOT_STALE), mas permanece no banco: quantas vezes foi preciso remarcar e informacao real.';

COMMENT ON TABLE sale_request_inspection_slots IS
  'Fase 4.5 - horarios propostos pela loja, APPEND-ONLY e por rodada. starts_at e TIMESTAMPTZ e o payload exige ISO 8601 COM offset: nada aqui presume America/Sao_Paulo.';

COMMENT ON TABLE sale_request_post_inspection_decisions IS
  'Fase 4.5 - a decisao da loja depois de ver o carro: final_offer ou no_offer. UMA por solicitacao. Nenhuma regra da disputa preliminar se aplica ao valor final (sem piso, sem comparacao com a maior proposta); o que protege o proprietario e a EXIGENCIA DE JUSTIFICATIVA quando o valor cai.';

COMMENT ON COLUMN sale_request_post_inspection_decisions.final_amount IS
  'Valor final. Unico piso e > 0. PODE ser menor que minimum_accepted_price e menor que a proposta selecionada - a avaliacao presencial existe justamente para descobrir isso.';

COMMENT ON COLUMN sale_request_post_inspection_decisions.internal_note IS
  'Nota operacional da loja. NUNCA visivel ao proprietario. Coluna propria (e nao um trecho de adjustment_note) porque misturar as duas garantiria o vazamento.';

COMMENT ON COLUMN sale_requests.status IS
  'receiving_offers | offer_selected | inspection_scheduled | inspection_completed | final_offer_submitted | final_offer_declined | cancelled. Cada um com writer real. Aceite/recusa da proposta final e Fase 4.6; reabertura para lojas perdedoras nao existe e nao acontece por omissao.';
