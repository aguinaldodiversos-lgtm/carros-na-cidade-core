/**
 * Acesso a dados da avaliação presencial e da decisão final (Fase 4.5).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * TODA TRANSIÇÃO TRAVA `sale_requests` — A MESMA LINHA, SEMPRE
 * ────────────────────────────────────────────────────────────────────────────
 * As cinco escritas desta fase (nova rodada de horários, confirmação, pedido de
 * novos horários, conclusão da inspeção, decisão final) começam pelo MESMO
 * `SELECT ... FOR UPDATE` em `sale_requests`.
 *
 * Isso não é conveniência: é o que faz as corridas do §13 e do §37 se
 * resolverem sozinhas. A loja publicando a rodada 2 e o proprietário
 * confirmando um horário da rodada 1 disputam a mesma linha, então uma espera a
 * outra — e a que chega depois RELÊ o estado que a primeira gravou.
 *
 * Travar `sale_request_inspections` em vez disso seria pior por dois motivos.
 * Primeiro, a inspeção pode não existir ainda (a primeira rodada é quem a cria),
 * e não há linha para travar — o mesmo argumento que fez a 4.1 travar `users` e
 * a 4.3 travar `sale_requests`. Segundo, a seleção da 4.4 já trava
 * `sale_requests`; usar uma segunda tabela criaria duas ordens de aquisição de
 * lock no mesmo domínio, que é a receita conhecida de deadlock.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O EXECUTOR INJETÁVEL (`exec`)
 * ────────────────────────────────────────────────────────────────────────────
 * Mesma disciplina do resto do domínio: pool quando ausente, cliente da
 * TRANSAÇÃO quando presente. Sem ele o lock ficaria numa conexão e a leitura do
 * estado em outra — o lock não valeria nada.
 */
import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import { INSPECTION_SCHEDULE_STATUS } from "./sale-requests.inspection.constants.js";

/** Pool por omissão; cliente da transação quando fornecido. */
function runner(exec) {
  return exec?.query ? exec.query : query;
}

/**
 * A INSPEÇÃO, relida DEPOIS do lock.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA LEITURA É SEPARADA DO LOCK — E POR QUE ISSO NÃO É DETALHE
 * ────────────────────────────────────────────────────────────────────────────
 * A primeira versão trazia estas colunas por `LEFT JOIN` na própria query do
 * `SELECT ... FOR UPDATE OF sr`. Parecia melhor (uma ida ao banco em vez de
 * duas) e estava ERRADO, de um jeito que só a concorrência revela.
 *
 * Em READ COMMITTED — o isolamento padrão — o `FOR UPDATE` faz a transação
 * ESPERAR o lock e depois **re-avaliar apenas a linha travada**. As demais
 * tabelas do JOIN continuam vindo do snapshot que o comando pegou quando
 * começou, ou seja, de ANTES do commit da transação concorrente.
 *
 * O efeito prático: dois cliques simultâneos no MESMO horário. O segundo espera
 * o lock, acorda, lê `sr` atualizado — mas enxerga `i.confirmed_slot_id` ainda
 * NULO. Não reconhece o próprio retry, tenta confirmar de novo, o `UPDATE` não
 * casa (o estado já mudou) e o usuário recebe erro por uma ação que deu certo.
 *
 * `FOR UPDATE OF sr, i` não resolve: o PostgreSQL proíbe `FOR UPDATE` no lado
 * nullable de um OUTER JOIN, e a inspeção pode não existir ainda.
 *
 * Uma query NOVA, depois do lock, pega um snapshot NOVO — e aí a leitura reflete
 * o que a transação anterior commitou. É por isso que são duas idas ao banco, e
 * é por isso que elas não podem ser fundidas de volta.
 *
 * Encontrado pelo teste de retry concorrente do §13, que é exatamente o cenário
 * que ele existe para pegar.
 */
async function readInspectionRow(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT id, advertiser_id, schedule_status, schedule_round,
           confirmed_slot_id, scheduled_at
    FROM sale_request_inspections
    WHERE sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/** A decisão comercial, relida depois do lock — mesma razão de `readInspectionRow`. */
async function readDecisionId(saleRequestId, exec) {
  const result = await runner(exec)(
    `SELECT id FROM sale_request_post_inspection_decisions WHERE sale_request_id = $1 LIMIT 1`,
    [saleRequestId]
  );
  return result.rows[0]?.id ?? null;
}

/**
 * TRAVA a solicitação pelo lado do LOJISTA e devolve tudo que as decisões dele
 * precisam — numa leitura só.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A AUTORIZAÇÃO ESTÁ NO `WHERE`, E ELA É SOBRE A **LOJA**
 * ────────────────────────────────────────────────────────────────────────────
 * O JOIN com `sale_request_offers` pelo `selected_offer_id` e a comparação
 * `o.advertiser_id = $2` são a autorização: se a loja que pergunta não é a que
 * teve a proposta selecionada, a linha não casa e a função devolve `null`. O
 * service transforma isso em 404 — o mesmo 404 que a loja perdedora já recebia
 * na 4.4.
 *
 * Isso é sobre a LOJA, e não sobre o usuário (§4). Qualquer operador autorizado
 * naquele advertiser passa; o operador que digitou a proposta preliminar não tem
 * privilégio nenhum sobre os colegas. Quem é registrado por linha é o autor de
 * cada ato (`created_by_user_id`, `completed_by_user_id`, `decided_by_user_id`),
 * para auditoria — não para permissão.
 *
 * `sr.status` NÃO entra no `WHERE`, de propósito: precisamos distinguir "não é
 * sua / não existe" (404) de "é sua, mas o estado não permite" (409), e essas
 * duas respostas pedem telas diferentes.
 *
 * @returns {Promise<object|null>}
 */
export async function lockRequestForDealer(saleRequestId, advertiserId, exec) {
  const locked = await runner(exec)(
    `
    SELECT
      sr.id,
      sr.status,
      sr.selected_offer_id,
      -- O DESTINATARIO da notificacao para a PF. E o unico uso deste campo neste
      -- caminho: ele e lido para enderecar o aviso e NUNCA entra em DTO nenhum
      -- do lojista. Mesma disciplina do buyer_user_id da Fase 3.
      --
      -- (Sem crases neste comentario: ele esta DENTRO de um template literal, e
      -- uma crase aqui fecharia a string no meio do SQL. O erro resultante
      -- aponta a linha do FECHAMENTO do template, nao a do comentario.)
      sr.owner_user_id,
      o.amount         AS selected_amount,
      o.dealer_user_id AS selected_dealer_user_id
    FROM sale_requests sr
    JOIN sale_request_offers o
      ON o.id = sr.selected_offer_id
     AND o.sale_request_id = sr.id
    WHERE sr.id = $1
      AND o.advertiser_id = $2
    FOR UPDATE OF sr
    `,
    [saleRequestId, advertiserId]
  );

  const row = locked.rows[0];
  if (!row) return null;

  // As duas leituras abaixo acontecem DEPOIS do lock, em comandos proprios —
  // ver o comentario de `readInspectionRow`. Traze-las por JOIN na query do
  // lock devolveria dados de um snapshot anterior ao commit concorrente.
  const inspection = await readInspectionRow(saleRequestId, exec);
  const decisionId = await readDecisionId(saleRequestId, exec);

  return {
    ...row,
    inspection_id: inspection?.id ?? null,
    schedule_status: inspection?.schedule_status ?? null,
    schedule_round: inspection?.schedule_round ?? null,
    confirmed_slot_id: inspection?.confirmed_slot_id ?? null,
    scheduled_at: inspection?.scheduled_at ?? null,
    decision_id: decisionId,
  };
}

/**
 * TRAVA a solicitação pelo lado do PROPRIETÁRIO.
 *
 * A posse (`owner_user_id`) está no `WHERE` — a mesma disciplina de todo o
 * repositório do dono desde a 4.1. Linha de outra pessoa não casa.
 *
 * `FOR UPDATE OF sr` e não `FOR UPDATE` puro: o `LEFT JOIN` com `inspections`
 * traz uma linha que não precisa ser travada, e `FOR UPDATE` sem qualificação
 * tentaria travar as duas — travar a inspeção junto não estraga nada aqui, mas
 * declara um lock que ninguém precisa e amplia a superfície de espera.
 */
export async function lockRequestForOwner(saleRequestId, ownerUserId, exec) {
  const locked = await runner(exec)(
    `
    SELECT
      sr.id,
      sr.status,
      sr.selected_offer_id,
      -- O DESTINATARIO da notificacao para a LOJA: a conta que enviou a proposta
      -- preliminar selecionada. E deterministico e ja foi o criterio da 4.4.
      --
      -- Isto e ENDERECAMENTO, nao autorizacao: quem tem direito de agir e o
      -- advertiser inteiro, e qualquer operador dele passa pelas guardas. As
      -- duas coisas nao podem ser confundidas.
      o.dealer_user_id AS selected_dealer_user_id
    FROM sale_requests sr
    LEFT JOIN sale_request_offers o
      ON o.id = sr.selected_offer_id
     AND o.sale_request_id = sr.id
    WHERE sr.id = $1
      AND sr.owner_user_id = $2
    FOR UPDATE OF sr
    `,
    [saleRequestId, ownerUserId]
  );

  const row = locked.rows[0];
  if (!row) return null;

  // DEPOIS do lock, em comando proprio — ver `readInspectionRow`.
  const inspection = await readInspectionRow(saleRequestId, exec);

  return {
    ...row,
    inspection_id: inspection?.id ?? null,
    advertiser_id: inspection?.advertiser_id ?? null,
    schedule_status: inspection?.schedule_status ?? null,
    schedule_round: inspection?.schedule_round ?? null,
    confirmed_slot_id: inspection?.confirmed_slot_id ?? null,
  };
}

/**
 * Cria a linha da inspeção, se ainda não existir.
 *
 * A inspeção nasce quando a loja envia a PRIMEIRA rodada de horários — não na
 * seleção. Criá-la na 4.4 teria produzido uma linha `awaiting_slots` para toda
 * solicitação selecionada, inclusive as que a loja nunca vai agendar, e o "o que
 * está pendente?" passaria a exigir distinguir linha vazia de linha ausente.
 *
 * `ON CONFLICT DO NOTHING` sobre o UNIQUE de `sale_request_id`: chegar aqui com
 * a solicitação travada torna a corrida impossível, e o ramo existe pela mesma
 * razão do `insertOfferSelection` da 4.4 — transformar "alguém removeu o lock"
 * em resultado tratável em vez de erro de constraint.
 */
export async function createInspection(
  { saleRequestId, advertiserId, createdByUserId },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_inspections (
      sale_request_id, advertiser_id, schedule_status, schedule_round, created_by_user_id
    )
    VALUES ($1, $2, $3, 0, $4)
    ON CONFLICT (sale_request_id) DO NOTHING
    RETURNING id, schedule_status, schedule_round
    `,
    [saleRequestId, advertiserId, INSPECTION_SCHEDULE_STATUS.AWAITING_SLOTS, createdByUserId]
  );
  return result.rows[0] ?? null;
}

/**
 * Insere uma RODADA inteira de horários numa query.
 *
 * `unnest` em vez de N INSERTs: três round-trips dentro de uma transação
 * segurariam o lock da solicitação por três latências de rede, e o lock é o
 * recurso mais caro deste caminho — ele serializa tudo que acontece nesta
 * solicitação.
 *
 * Os horários antigos NÃO são apagados (§11): a rodada anterior continua no
 * banco, e quantas vezes foi preciso remarcar é informação real sobre o negócio.
 */
export async function insertSlots({ inspectionId, roundNo, startsAt, createdByUserId }, exec) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_inspection_slots (
      inspection_id, round_no, starts_at, created_by_user_id
    )
    SELECT $1, $2, ts, $4
    FROM UNNEST($3::timestamptz[]) AS t(ts)
    RETURNING id, round_no, starts_at
    `,
    [inspectionId, roundNo, startsAt, createdByUserId]
  );
  return result.rows;
}

/** Avança a rodada e passa a bola para o proprietário. */
export async function markRoundPublished({ inspectionId, roundNo }, exec) {
  const result = await runner(exec)(
    `
    UPDATE sale_request_inspections
    SET schedule_status = $3,
        schedule_round = $2
    WHERE id = $1
      AND schedule_status IN ($4, $5)
    `,
    [
      inspectionId,
      roundNo,
      INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER,
      INSPECTION_SCHEDULE_STATUS.AWAITING_SLOTS,
      INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Os horários da rodada VIGENTE.
 *
 * `round_no = i.schedule_round` é o filtro que implementa o §11: só a rodada
 * atual é escolhível. Rodadas anteriores continuam no banco e simplesmente não
 * saem por aqui — a tela nunca oferece um horário que a transação recusaria.
 */
export async function listCurrentSlots(inspectionId, exec) {
  const result = await runner(exec)(
    `
    SELECT s.id, s.round_no, s.starts_at
    FROM sale_request_inspection_slots s
    JOIN sale_request_inspections i ON i.id = s.inspection_id
    WHERE s.inspection_id = $1
      AND s.round_no = i.schedule_round
    ORDER BY s.starts_at ASC, s.id ASC
    `,
    [inspectionId]
  );
  return result.rows;
}

/**
 * O horário apontado, PROVADO como da rodada vigente desta inspeção.
 *
 * As três condições estão no `WHERE`, não num `if` posterior:
 *   - `s.id = $1`                    o slot pedido;
 *   - `s.inspection_id = $2`         é desta inspeção;
 *   - `s.round_no = i.schedule_round` é da rodada que está valendo.
 *
 * A terceira é o §11 inteiro. Um slot de rodada anterior não casa, a função
 * devolve `null`, e o service responde `INSPECTION_SLOT_STALE` — em vez de
 * confirmar um horário que a loja já substituiu.
 */
export async function findCurrentSlot(slotId, inspectionId, exec) {
  const result = await runner(exec)(
    `
    SELECT s.id, s.round_no, s.starts_at
    FROM sale_request_inspection_slots s
    JOIN sale_request_inspections i ON i.id = s.inspection_id
    WHERE s.id = $1
      AND s.inspection_id = $2
      AND s.round_no = i.schedule_round
    LIMIT 1
    `,
    [slotId, inspectionId]
  );
  return result.rows[0] ?? null;
}

/**
 * Confirma o horário.
 *
 * `AND schedule_status = 'awaiting_owner'` no `WHERE` é o que torna a
 * confirmação ÚNICA: uma inspeção já `scheduled` não casa, então o segundo
 * clique — ou uma segunda aba — não reescreve nada. O service distingue retry
 * (mesmo slot → 200) de conflito (outro slot → 409) lendo o estado travado
 * ANTES de chamar isto.
 */
export async function confirmSlot({ inspectionId, slotId, startsAt }, exec) {
  const result = await runner(exec)(
    `
    UPDATE sale_request_inspections
    SET schedule_status = $4,
        confirmed_slot_id = $2,
        scheduled_at = $3
    WHERE id = $1
      AND schedule_status = $5
    `,
    [
      inspectionId,
      slotId,
      startsAt,
      INSPECTION_SCHEDULE_STATUS.SCHEDULED,
      INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * "Não consigo nesses horários" (§12).
 *
 * Volta o sub-processo para `awaiting_slots`. NÃO cancela a seleção, NÃO reabre
 * a disputa e NÃO apaga os horários — apenas devolve a bola para a loja. A
 * rodada continua registrada; a próxima virá com `round_no` maior, e a
 * comparação `round_no = schedule_round` faz a antiga deixar de ser escolhível
 * sozinha.
 */
export async function requestNewSlots(inspectionId, exec) {
  const result = await runner(exec)(
    `
    UPDATE sale_request_inspections
    SET schedule_status = $2
    WHERE id = $1
      AND schedule_status = $3
    `,
    [
      inspectionId,
      INSPECTION_SCHEDULE_STATUS.AWAITING_SLOTS,
      INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Registra a ficha e conclui.
 *
 * Uma única escrita: a ficha e o estado mudam juntos, e o CHECK de coerência da
 * 058 garante que `completed` sem ficha (ou ficha sem `completed`) seja
 * inexprimível. Fossem dois UPDATEs, existiria um instante — dentro da
 * transação, mas existiria — em que a linha violaria o próprio invariante.
 *
 * `AND schedule_status = 'scheduled'` torna a conclusão ÚNICA e é o que faz a
 * ficha ser IMUTÁVEL (§21): concluir de novo não casa linha, e não existe
 * nenhum outro caminho de escrita para as colunas `observed_*`.
 *
 * O JSONB viaja como TEXTO com cast explícito. O driver `pg` serializaria um
 * array JS como ARRAY do Postgres (`{a,b}`), que não é JSON válido e violaria o
 * CHECK de `jsonb_typeof` — falha tardia, no banco, longe de onde o valor foi
 * montado. A migration 052 registrou esse mesmo modo de falha.
 */
export async function completeInspection(
  { inspectionId, form, completedByUserId },
  exec
) {
  const result = await runner(exec)(
    `
    UPDATE sale_request_inspections
    SET schedule_status = $2,
        completed_at = NOW(),
        completed_by_user_id = $3,
        observed_mileage = $4,
        observed_condition = $5,
        observed_tire_condition = $6,
        observed_engine_condition = $7,
        observed_gearbox_condition = $8,
        observed_suspension_condition = $9,
        observed_body_paint_status = $10,
        observed_body_paint_issues = $11::jsonb,
        inspection_notes = $12
    WHERE id = $1
      AND schedule_status = $13
    `,
    [
      inspectionId,
      INSPECTION_SCHEDULE_STATUS.COMPLETED,
      completedByUserId,
      form.observedMileage,
      form.observedCondition,
      form.observedTireCondition,
      form.observedEngineCondition,
      form.observedGearboxCondition,
      form.observedSuspensionCondition,
      form.observedBodyPaintStatus,
      form.observedBodyPaintIssues === null
        ? null
        : JSON.stringify(form.observedBodyPaintIssues),
      form.inspectionNotes,
      INSPECTION_SCHEDULE_STATUS.SCHEDULED,
    ]
  );
  return (result.rowCount ?? 0) > 0;
}

/**
 * Registra a decisão comercial. Append-only: nunca UPDATE, nunca DELETE.
 *
 * `ON CONFLICT DO NOTHING` sobre o UNIQUE de `sale_request_id` — a mesma rede de
 * segurança da trilha de seleção da 4.4: com o lock na mão isto não deveria
 * disparar, e o ramo existe justamente para o dia em que o lock não estiver lá.
 * Sem ele, o mesmo cenário viraria um 500 de violação de constraint em vez de um
 * 409 legível.
 */
export async function insertDecision(
  {
    saleRequestId,
    inspectionId,
    advertiserId,
    selectedOfferId,
    decisionType,
    preliminaryAmount,
    finalAmount,
    adjustmentReason,
    adjustmentNote,
    internalNote,
    decidedByUserId,
  },
  exec
) {
  const result = await runner(exec)(
    `
    INSERT INTO sale_request_post_inspection_decisions (
      sale_request_id, inspection_id, advertiser_id, selected_offer_id,
      decision_type, preliminary_amount_snapshot, final_amount,
      adjustment_reason, adjustment_note, internal_note, decided_by_user_id
    )
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    ON CONFLICT (sale_request_id) DO NOTHING
    RETURNING id, decision_type, final_amount, preliminary_amount_snapshot,
              adjustment_reason, adjustment_note, created_at
    `,
    [
      saleRequestId,
      inspectionId,
      advertiserId,
      selectedOfferId,
      decisionType,
      preliminaryAmount,
      finalAmount,
      adjustmentReason,
      adjustmentNote,
      internalNote,
      decidedByUserId,
    ]
  );
  return result.rows[0] ?? null;
}

/**
 * Move o status da SOLICITAÇÃO.
 *
 * `fromStatus` no `WHERE` é o que torna cada transição única e verificável: a
 * mesma disciplina de `markOfferSelected` da 4.4. Um `WHERE id = $1` puro
 * confiaria em quem chama ter conferido o estado antes.
 */
export async function moveRequestStatus(
  { saleRequestId, fromStatus, toStatus },
  exec
) {
  const result = await runner(exec)(
    `
    UPDATE sale_requests
    SET status = $3,
        updated_at = NOW()
    WHERE id = $1
      AND status = $2
    `,
    [saleRequestId, fromStatus, toStatus]
  );
  return (result.rowCount ?? 0) > 0;
}

// ────────────────────────────────────────────────────────────────────────────
// LEITURAS DE TELA (fora de transação — apresentação, não critério)
// ────────────────────────────────────────────────────────────────────────────

/**
 * A inspeção de uma solicitação, com o endereço COMERCIAL da loja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTA QUERY SELECIONA DA LOJA — E O QUE ELA RECUSA A SELECIONAR
 * ────────────────────────────────────────────────────────────────────────────
 * `adv.name`, `adv.address` e a cidade. Nada além disso sai do banco.
 *
 * `adv.email`, `adv.phone`, `adv.whatsapp` e o documento NÃO são pedidos — não é
 * omissão de conveniência, é o que torna estruturalmente impossível vazá-los
 * para o proprietário. A garantia não é "o DTO não repassa": é que o dado não
 * chega ao service.
 *
 * O endereço é o COMERCIAL, público, que a loja já cadastrou em
 * `/dashboard-loja/dados` — e ele existe para uma finalidade única: o
 * proprietário precisa saber onde comparecer. Não é canal de contato.
 */
export async function getInspectionForRequest(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      i.id,
      i.schedule_status,
      i.schedule_round,
      i.confirmed_slot_id,
      i.scheduled_at,
      i.completed_at,
      i.observed_mileage,
      i.observed_condition,
      i.observed_tire_condition,
      i.observed_engine_condition,
      i.observed_gearbox_condition,
      i.observed_suspension_condition,
      i.observed_body_paint_status,
      i.observed_body_paint_issues,
      i.inspection_notes,
      adv.name    AS store_name,
      adv.address AS store_address,
      c.name      AS store_city_name,
      c.state     AS store_city_state
    FROM sale_request_inspections i
    JOIN advertisers adv ON adv.id = i.advertiser_id
    LEFT JOIN cities c ON c.id = adv.city_id
    WHERE i.sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/**
 * A decisão pós-inspeção de uma solicitação.
 *
 * `internal_note` NÃO é selecionada. É a nota operacional da loja, e o
 * proprietário nunca a vê — a coluna existe separada de `adjustment_note`
 * exatamente para que esta query possa deixá-la de fora sem pensar duas vezes.
 *
 * Quem precisar dela (a própria loja, numa fase futura) escreve uma query
 * própria, e essa escrita será uma decisão consciente.
 */
export async function getDecisionForRequest(saleRequestId, exec) {
  const result = await runner(exec)(
    `
    SELECT
      id,
      decision_type,
      preliminary_amount_snapshot,
      final_amount,
      adjustment_reason,
      adjustment_note,
      created_at
    FROM sale_request_post_inspection_decisions
    WHERE sale_request_id = $1
    LIMIT 1
    `,
    [saleRequestId]
  );
  return result.rows[0] ?? null;
}

/** O endereço comercial da loja — para decidir se ela pode propor horários (§14). */
export async function getStoreLocation(advertiserId, exec) {
  const result = await runner(exec)(
    `
    SELECT adv.name, adv.address, c.name AS city_name, c.state AS city_state
    FROM advertisers adv
    LEFT JOIN cities c ON c.id = adv.city_id
    WHERE adv.id = $1
    LIMIT 1
    `,
    [advertiserId]
  );
  return result.rows[0] ?? null;
}

export { SALE_REQUEST_STATUS };
