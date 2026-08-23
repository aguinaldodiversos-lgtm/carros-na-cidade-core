/**
 * A AVALIAÇÃO PRESENCIAL e a PROPOSTA FINAL (Fase 4.5).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A REGRA DE PRODUTO, EM UMA FRASE
 * ════════════════════════════════════════════════════════════════════════════
 * A proposta escolhida na 4.4 foi feita sobre FOTOS E DECLARAÇÕES. Ela não é
 * compromisso: a visita existe para confirmar ou corrigir aquela percepção, e a
 * proposta final pode ser maior, igual ou MENOR.
 *
 * Consequência que atravessa este arquivo inteiro: **nenhuma regra da disputa
 * preliminar vale aqui**. Não se compara o valor final com
 * `minimum_accepted_price`, nem com a proposta selecionada, nem com a maior
 * proposta da disputa. Aquelas três regras governavam a DISPUTA, e a disputa
 * acabou quando o proprietário escolheu.
 *
 * Reaplicá-las recusaria exatamente o caso que a avaliação existe para
 * descobrir: o carro vale menos do que parecia na foto. O que protege o
 * proprietário não é um piso — é a EXIGÊNCIA DE JUSTIFICATIVA quando o valor
 * cai, imposta pelo validador E pelo CHECK da migration 058.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A LOJA É SELECIONADA, NÃO O OPERADOR (§4)
 * ════════════════════════════════════════════════════════════════════════════
 * A autorização é sempre sobre o `advertiser_id`: qualquer usuário que opere a
 * loja selecionada pode agendar, inspecionar e propor. O operador que digitou a
 * proposta preliminar não tem privilégio nenhum sobre os colegas — uma loja em
 * que só uma pessoa consegue concluir o negócio é uma loja parada quando essa
 * pessoa está de férias.
 *
 * Quem é registrado por linha é o AUTOR de cada ato (`created_by_user_id`,
 * `completed_by_user_id`, `decided_by_user_id`), e isso é auditoria — nunca
 * permissão. As duas coisas não podem ser confundidas: destinatário de
 * notificação e autoridade de domínio também não (§36).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO
 * ════════════════════════════════════════════════════════════════════════════
 * Não aceita nem recusa a proposta final (é a 4.6), não renegocia, não faz
 * contraproposta, não reabre para lojas perdedoras, não troca a loja
 * selecionada, não reagenda depois de confirmado, não cobra, não abre contato e
 * não conta tempo. Nenhuma dessas transições tem writer, e criá-las agora
 * repetiria o erro que as migrations 030, 052 e 055 documentam.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { createUserNotification } from "../notifications/notifications.service.js";
import { NOTIFICATION_EVENT_TYPE } from "../notifications/notifications.constants.js";
import * as repo from "./sale-requests.inspection.repository.js";
import { requireDealerStore } from "./sale-requests.dealer.store.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import {
  INSPECTION_CODE,
  INSPECTION_SCHEDULE_STATUS,
  POST_INSPECTION_DECISION,
  STORE_LOCATION_ACTION_PATH,
  STORE_LOCATION_REQUIRED_MESSAGE,
} from "./sale-requests.inspection.constants.js";
import {
  parseSaleRequestId,
  requireUserId,
} from "./sale-requests.validation.js";
import {
  parseSlotId,
  validateFinalDecision,
  validateInspectionForm,
  validateSlotRound,
} from "./sale-requests.inspection.validation.js";

// ════════════════════════════════════════════════════════════════════════════
// SERIALIZADORES
// ════════════════════════════════════════════════════════════════════════════

/**
 * O endereço COMERCIAL da loja, montado para exibição ao proprietário.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESTE É O ÚNICO DADO DA LOJA QUE ATRAVESSA A FRONTEIRA — E ELE NÃO É CONTATO
 * ────────────────────────────────────────────────────────────────────────────
 * Existe por uma finalidade única: a pessoa precisa saber ONDE comparecer. Não
 * há telefone, e-mail, WhatsApp, CNPJ nem nome de operador — a query do
 * repositório nem os seleciona, então não há campo escondido para esconder.
 *
 * `advertisers.address` é um TEXT livre (migration 018): o schema real não tem
 * logradouro, número, bairro e CEP separados. Devolvemos o que a loja cadastrou,
 * sem tentar estruturar um texto que nunca foi estruturado — parsear endereço
 * brasileiro por heurística erraria em silêncio, e mostrar um endereço errado é
 * pior do que mostrar um endereço feio.
 */
function storeLocationOf(row) {
  if (!row) return null;

  const name = String(row.store_name ?? "").trim();
  const address = String(row.store_address ?? "").trim();
  const cityName = String(row.store_city_name ?? "").trim();
  const state = String(row.store_city_state ?? "").trim();

  return {
    name: name === "" ? "Loja parceira" : name,
    address: address === "" ? null : address,
    city: cityName === "" ? null : state === "" ? cityName : `${cityName} - ${state}`,
  };
}

/** Um horário oferecido. Só id e instante — o resto é apresentação da tela. */
function serializeSlot(row) {
  return {
    id: row.id,
    // ISO com offset, como veio. A formatação pt-BR é assunto exclusivo da tela,
    // que sabe o fuso de quem está lendo. O servidor nunca formata data.
    starts_at: row.starts_at,
  };
}

/**
 * O bloco de inspeção na visão do PROPRIETÁRIO (§39).
 *
 * Allowlist explícita, montada campo a campo. `advertiser_id`, `dealer_user_id`,
 * `created_by_user_id` e `completed_by_user_id` NÃO saem: identificam a empresa
 * e as pessoas do outro lado, e o proprietário não negocia com nenhuma delas
 * nesta fase.
 */
function serializeInspectionForOwner(row, slots = []) {
  if (!row) return null;

  const completed = row.schedule_status === INSPECTION_SCHEDULE_STATUS.COMPLETED;

  return {
    state: row.schedule_status,
    // Só há o que escolher enquanto a bola está com o proprietário. Depois de
    // confirmado, devolver a lista faria a tela ter de decidir sozinha se ainda
    // pode oferecer os botões.
    slots:
      row.schedule_status === INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER
        ? slots.map(serializeSlot)
        : [],
    scheduled_at: row.scheduled_at ?? null,
    completed_at: row.completed_at ?? null,
    store: storeLocationOf(row),

    // A ficha observada só aparece depois de concluída. Antes disso as colunas
    // são NULL por construção (o CHECK da 058 garante), e mandá-las como um
    // objeto de nulos faria a tela distinguir "não avaliado" de "avaliado sem
    // resposta" — distinção que não existe.
    observed: completed
      ? {
          mileage: row.observed_mileage,
          condition: row.observed_condition,
          tire_condition: row.observed_tire_condition,
          engine_condition: row.observed_engine_condition,
          gearbox_condition: row.observed_gearbox_condition,
          suspension_condition: row.observed_suspension_condition,
          body_paint_status: row.observed_body_paint_status,
          body_paint_issues: Array.isArray(row.observed_body_paint_issues)
            ? row.observed_body_paint_issues
            : null,
          notes: row.inspection_notes ?? null,
        }
      : null,
  };
}

/**
 * A decisão final na visão do PROPRIETÁRIO.
 *
 * `difference` é CALCULADA no servidor, e não deixada para a tela: é o número
 * que a pessoa vai olhar para entender o que aconteceu, e duas telas (web e uma
 * futura app) calculando a mesma subtração acabariam divergindo no
 * arredondamento.
 *
 * `internal_note` não está aqui — e nem chega ao service: a query do repositório
 * não a seleciona.
 */
function serializeDecisionForOwner(row) {
  if (!row) return null;

  const preliminary = row.preliminary_amount_snapshot;
  const final = row.final_amount;

  let difference = null;
  if (final != null && preliminary != null) {
    // Em centavos inteiros, pelo mesmo motivo de toda comparação de dinheiro
    // deste domínio: a diferença é exibida como número e não pode carregar
    // resíduo de ponto flutuante binário.
    const diffCents = Math.round(Number(final) * 100) - Math.round(Number(preliminary) * 100);
    difference = (diffCents / 100).toFixed(2);
  }

  return {
    type: row.decision_type,
    preliminary_amount: preliminary,
    final_amount: final,
    difference,
    reason: row.adjustment_reason ?? null,
    note: row.adjustment_note ?? null,
    created_at: row.created_at,
  };
}

/**
 * O bloco na visão do LOJISTA (§40).
 *
 * Inclui a rodada corrente (a loja precisa saber se está esperando resposta) e a
 * ficha que ela mesma preencheu. Nunca inclui NADA do proprietário — nem nome,
 * nem contato, nem endereço. A regra da 4.3 continua valendo sem exceção: a
 * seleção deu à loja o direito de avaliar o carro, não de conhecer a pessoa.
 */
function serializeInspectionForDealer(row, slots = []) {
  if (!row) return null;

  const completed = row.schedule_status === INSPECTION_SCHEDULE_STATUS.COMPLETED;

  return {
    state: row.schedule_status,
    round: row.schedule_round,
    slots: slots.map(serializeSlot),
    scheduled_at: row.scheduled_at ?? null,
    completed_at: row.completed_at ?? null,
    observed: completed
      ? {
          mileage: row.observed_mileage,
          condition: row.observed_condition,
          tire_condition: row.observed_tire_condition,
          engine_condition: row.observed_engine_condition,
          gearbox_condition: row.observed_gearbox_condition,
          suspension_condition: row.observed_suspension_condition,
          body_paint_status: row.observed_body_paint_status,
          body_paint_issues: Array.isArray(row.observed_body_paint_issues)
            ? row.observed_body_paint_issues
            : null,
          notes: row.inspection_notes ?? null,
        }
      : null,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// NOTIFICAÇÕES
// ════════════════════════════════════════════════════════════════════════════

/**
 * Chaves de idempotência determinísticas.
 *
 * A da rodada inclui o `round_no`: um conjunto NOVO de horários é um evento novo
 * e merece aviso próprio. Uma chave só por solicitação silenciaria a segunda
 * rodada — justamente a que o proprietário está esperando depois de dizer que
 * não conseguia nos primeiros horários.
 */
const KEYS = Object.freeze({
  slotsOffered: (id, round) => `sale-request:${id}:inspection-slots:${round}`,
  slotsRequested: (id, round) => `sale-request:${id}:inspection-slots-requested:${round}`,
  scheduled: (id, slotId) => `sale-request:${id}:inspection-scheduled:${slotId}`,
  decision: (id, type) => `sale-request:${id}:post-inspection:${type}`,
});

/**
 * Todas as notificações desta fase entram na MESMA transação (§35).
 *
 * Cada uma acompanha uma transição de estado que a outra ponta não tem como
 * descobrir sozinha: a loja não sabe que o proprietário escolheu um horário, o
 * proprietário não sabe que a loja mandou horários novos. O aviso É o canal —
 * não existe outra tela onde tropeçar na notícia.
 *
 * Por isso não são best-effort: uma falha aqui derruba a transição, e essa é a
 * troca certa, porque a transição pode ser refeita com um clique e o aviso
 * perdido não pode ser recuperado por ninguém. É o mesmo argumento — e o mesmo
 * mecanismo (`{ exec }`) — provado na 4.4.
 *
 * Nenhuma carrega dado pessoal: nem da PF para a loja, nem da loja para a PF.
 */
async function notify({ recipientUserId, eventType, title, body, saleRequestId, actionPath, key, payload }, exec) {
  await createUserNotification(
    {
      recipientUserId,
      eventType,
      title,
      body,
      entityType: "sale_request",
      entityId: saleRequestId,
      actionPath,
      payload: payload ?? {},
      idempotencyKey: key,
    },
    { exec }
  );
}

const ownerPath = (id) => `/dashboard/vender-para-lojas/${id}`;
const dealerPath = (id) => `/dashboard-loja/oportunidades/veiculos/${id}`;

// ════════════════════════════════════════════════════════════════════════════
// GUARDAS COMPARTILHADAS
// ════════════════════════════════════════════════════════════════════════════

function notFound() {
  return { ok: false, status: 404, message: "Oportunidade não encontrada." };
}

function invalidState(message) {
  return {
    ok: false,
    status: 409,
    message,
    code: INSPECTION_CODE.INVALID_STATE,
  };
}

/** Transforma o resultado da transação em resposta HTTP, com log de domínio. */
function raise(outcome, { action, userId, saleRequestId }) {
  logger.info(
    {
      ...buildDomainFields({
        action,
        result: "error",
        userId,
        reason: outcome.code || "not_found",
      }),
      saleRequestId,
    },
    "[sale-requests] ação de avaliação recusada"
  );

  throw new AppError(outcome.message, outcome.status, true, {
    ...(outcome.code ? { code: outcome.code } : {}),
    ...(outcome.details ? outcome.details : {}),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// LOJA — PROPOR HORÁRIOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Envia uma rodada de 1 a 3 horários.
 *
 * ORDEM DOS PASSOS, numa única transação:
 *   1. valida a FORMA dos horários (antes do lock: valor malformado é 400 para
 *      todo mundo, e não vale segurar uma linha do banco para descobrir isso);
 *   2. resolve a loja a partir da sessão;
 *   3. TRAVA a solicitação, já escopada à loja SELECIONADA;
 *   4. confere o estado (`offer_selected`, e nenhum horário já confirmado);
 *   5. exige endereço comercial cadastrado (§14);
 *   6. cria a inspeção se for a primeira rodada;
 *   7. insere os horários com `round_no` incrementado;
 *   8. avisa o proprietário;
 *   9. commit.
 *
 * O status da SOLICITAÇÃO não muda: continua `offer_selected` até alguém
 * escolher um horário. Enviar opções não é um marco do negócio (§5).
 */
export async function offerInspectionSlots(userId, rawId, body = {}, context = {}) {
  const dealerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);
  const slots = validateSlotRound(body?.slots, { now: new Date() });

  const store = await requireDealerStore(dealerUserId, {
    advertiserId: context.advertiserId,
  });

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForDealer(saleRequestId, store.advertiserId, exec);

    // Não existe, não tem seleção, ou a loja selecionada é OUTRA. O mesmo 404 da
    // 4.4 para as lojas perdedoras — distinguir contaria a um concorrente o
    // desfecho de um negócio alheio.
    if (!request) return notFound();

    if (request.status !== SALE_REQUEST_STATUS.OFFER_SELECTED) {
      return invalidState(
        request.status === SALE_REQUEST_STATUS.INSPECTION_SCHEDULED
          ? "A avaliação já está agendada."
          : "Esta oportunidade não está na etapa de agendamento."
      );
    }

    // Endereço comercial é pré-requisito, não detalhe (§14): sem ele o
    // proprietário receberia horários para comparecer num lugar que o sistema
    // não sabe dizer qual é.
    const location = await repo.getStoreLocation(store.advertiserId, exec);
    if (!location || String(location.address ?? "").trim() === "") {
      return {
        ok: false,
        status: 409,
        message: STORE_LOCATION_REQUIRED_MESSAGE,
        code: INSPECTION_CODE.STORE_LOCATION_REQUIRED,
        details: { action_path: STORE_LOCATION_ACTION_PATH },
      };
    }

    let inspectionId = request.inspection_id;
    let currentRound = request.schedule_round ?? 0;

    if (!inspectionId) {
      const created = await repo.createInspection(
        {
          saleRequestId,
          advertiserId: store.advertiserId,
          createdByUserId: dealerUserId,
        },
        exec
      );

      // `null` só aconteceria se o UNIQUE tivesse recusado — impossível com a
      // solicitação travada. O ramo existe para transformar "o lock sumiu" em
      // resposta tratável, e não em erro de constraint.
      if (!created) return invalidState("Não foi possível iniciar o agendamento.");

      inspectionId = created.id;
      currentRound = 0;
    } else if (request.confirmed_slot_id) {
      // Defesa em profundidade: o status da solicitação já teria barrado, mas um
      // caminho futuro pode chegar aqui por outra porta.
      return {
        ok: false,
        status: 409,
        message: "Já existe um horário confirmado para esta avaliação.",
        code: INSPECTION_CODE.ALREADY_SCHEDULED,
      };
    }

    const nextRound = Number(currentRound) + 1;

    const inserted = await repo.insertSlots(
      {
        inspectionId,
        roundNo: nextRound,
        startsAt: slots,
        createdByUserId: dealerUserId,
      },
      exec
    );

    const published = await repo.markRoundPublished(
      { inspectionId, roundNo: nextRound },
      exec
    );
    if (!published) return invalidState("Não foi possível registrar os horários.");

    await notify(
      {
        recipientUserId: request.owner_user_id ?? null,
        eventType: NOTIFICATION_EVENT_TYPE.SALE_REQUEST_INSPECTION_SLOTS_OFFERED,
        title: "Horários para a avaliação",
        body: "A loja enviou opções de horário para a avaliação presencial do seu veículo.",
        saleRequestId,
        actionPath: ownerPath(saleRequestId),
        key: KEYS.slotsOffered(saleRequestId, nextRound),
        payload: { round: nextRound, slots: inserted.length },
      },
      exec
    );

    return { ok: true, inspectionId, round: nextRound, slots: inserted };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.inspection_slots_offered",
      userId: dealerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.inspection_slots_offered",
        result: "success",
        userId: dealerUserId,
      }),
      saleRequestId,
      advertiserId: store.advertiserId,
      round: outcome.round,
      slots: outcome.slots.length,
    },
    "[sale-requests] horários de avaliação enviados"
  );

  return {
    inspection: {
      state: INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER,
      round: outcome.round,
      slots: outcome.slots.map(serializeSlot),
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// PROPRIETÁRIO — ESCOLHER OU RECUSAR OS HORÁRIOS
// ════════════════════════════════════════════════════════════════════════════

/**
 * Confirma um horário.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CORRIDA DO §13, E COMO ELA SE RESOLVE
 * ────────────────────────────────────────────────────────────────────────────
 * O proprietário clica num horário da rodada 1 no mesmo instante em que a loja
 * publica a rodada 2. As duas transações disputam a MESMA linha de
 * `sale_requests`, então uma espera a outra:
 *
 *   rodada 2 primeiro → `findCurrentSlot` não casa (o slot é de `round_no`
 *                       anterior ao `schedule_round` novo) → 409 SLOT_STALE;
 *   confirmação antes → a rodada 2 encontra `confirmed_slot_id` preenchido e o
 *                       status já em `inspection_scheduled` → 409.
 *
 * Em nenhuma ordem o proprietário confirma um horário que já foi substituído.
 *
 * A idempotência é resolvida ANTES de qualquer validação nova: um retry sobre um
 * horário já confirmado responde 200, mesmo que a loja tenha publicado outra
 * rodada no meio. Recusar o retry mandaria o usuário corrigir uma ação que, do
 * ponto de vista dele, deu certo.
 */
export async function confirmInspectionSlot(userId, rawId, body = {}) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);
  const slotId = parseSlotId(body?.slot_id);

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForOwner(saleRequestId, ownerUserId, exec);
    if (!request) return notFound();

    // Retry idempotente — antes de tudo, pelo mesmo motivo do passo 4 da 4.4.
    if (
      request.confirmed_slot_id != null &&
      String(request.confirmed_slot_id) === String(slotId)
    ) {
      return { ok: true, changed: false, inspectionId: request.inspection_id };
    }

    if (request.status === SALE_REQUEST_STATUS.CANCELLED) {
      return invalidState("Esta solicitação foi cancelada.");
    }

    if (request.status !== SALE_REQUEST_STATUS.OFFER_SELECTED) {
      // Já agendada com OUTRO horário, ou já avançou. Não há reagendamento nesta
      // fase, e a limitação está documentada no relatório.
      return {
        ok: false,
        status: 409,
        message: "Esta avaliação já tem um horário confirmado.",
        code: INSPECTION_CODE.ALREADY_SCHEDULED,
      };
    }

    if (!request.inspection_id) {
      return invalidState("A loja ainda não enviou horários.");
    }

    if (request.schedule_status !== INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER) {
      return invalidState("Não há horários aguardando sua escolha.");
    }

    // A prova de que o horário é da rodada VIGENTE está no `WHERE` da query.
    const slot = await repo.findCurrentSlot(slotId, request.inspection_id, exec);
    if (!slot) {
      return {
        ok: false,
        status: 409,
        message: "A loja atualizou os horários. Recarregue para ver as opções atuais.",
        code: INSPECTION_CODE.SLOT_STALE,
      };
    }

    const confirmed = await repo.confirmSlot(
      { inspectionId: request.inspection_id, slotId: slot.id, startsAt: slot.starts_at },
      exec
    );
    if (!confirmed) return invalidState("Não foi possível confirmar o horário.");

    const moved = await repo.moveRequestStatus(
      {
        saleRequestId,
        fromStatus: SALE_REQUEST_STATUS.OFFER_SELECTED,
        toStatus: SALE_REQUEST_STATUS.INSPECTION_SCHEDULED,
      },
      exec
    );
    if (!moved) return invalidState("Não foi possível confirmar o horário.");

    // A loja precisa saber que a visita foi marcada — não existe outra tela onde
    // ela descubra isso. `APPOINTMENT_CONFIRMED` já existia e diz exatamente
    // isso; criar um evento novo seria duplicar vocabulário.
    await notify(
      {
        recipientUserId: request.selected_dealer_user_id ?? null,
        eventType: NOTIFICATION_EVENT_TYPE.APPOINTMENT_CONFIRMED,
        title: "Avaliação confirmada",
        body: "O proprietário confirmou um horário para a avaliação presencial.",
        saleRequestId,
        actionPath: dealerPath(saleRequestId),
        key: KEYS.scheduled(saleRequestId, slot.id),
        payload: { scheduled_at: slot.starts_at },
      },
      exec
    );

    return { ok: true, changed: true, inspectionId: request.inspection_id };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.inspection_scheduled",
      userId: ownerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.inspection_scheduled",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      slotId,
      changed: outcome.changed,
    },
    outcome.changed
      ? "[sale-requests] horário de avaliação confirmado"
      : "[sale-requests] confirmação repetida (idempotente)"
  );

  const inspection = await repo.getInspectionForRequest(saleRequestId);
  return {
    inspection: serializeInspectionForOwner(inspection, []),
    changed: outcome.changed,
  };
}

/**
 * "Não consigo nesses horários" (§12).
 *
 * O que esta ação NÃO faz importa mais do que o que ela faz: não cancela a
 * seleção, não reabre a disputa, não devolve a oportunidade para as lojas
 * perdedoras e não cria campo de texto. Ela devolve a bola para a loja, e nada
 * além disso.
 *
 * Sem texto livre de propósito: um campo aqui viraria o canal de conversa que o
 * produto decidiu não ter, e a primeira pessoa a escrever um telefone nele
 * entregaria o contato que todo o desenho evita.
 */
export async function requestNewInspectionSlots(userId, rawId) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForOwner(saleRequestId, ownerUserId, exec);
    if (!request) return notFound();

    if (request.status !== SALE_REQUEST_STATUS.OFFER_SELECTED) {
      return invalidState("Esta etapa já foi concluída.");
    }

    if (!request.inspection_id) {
      return invalidState("A loja ainda não enviou horários.");
    }

    // Idempotente: pedir de novo quando já se está esperando horários é a mesma
    // intenção, e responder erro puniria o duplo clique.
    if (request.schedule_status === INSPECTION_SCHEDULE_STATUS.AWAITING_SLOTS) {
      return { ok: true, changed: false, round: request.schedule_round };
    }

    if (request.schedule_status !== INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER) {
      return invalidState("Não há horários aguardando sua escolha.");
    }

    const updated = await repo.requestNewSlots(request.inspection_id, exec);
    if (!updated) return invalidState("Não foi possível solicitar novos horários.");

    await notify(
      {
        recipientUserId: request.selected_dealer_user_id ?? null,
        eventType: NOTIFICATION_EVENT_TYPE.SALE_REQUEST_INSPECTION_SLOTS_REQUESTED,
        title: "Novos horários solicitados",
        body: "O proprietário não conseguiu nos horários enviados e pediu novas opções.",
        saleRequestId,
        actionPath: dealerPath(saleRequestId),
        key: KEYS.slotsRequested(saleRequestId, request.schedule_round),
        payload: { round: request.schedule_round },
      },
      exec
    );

    return { ok: true, changed: true, round: request.schedule_round };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.inspection_slots_requested",
      userId: ownerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.inspection_slots_requested",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      round: outcome.round,
    },
    "[sale-requests] novos horários solicitados"
  );

  const inspection = await repo.getInspectionForRequest(saleRequestId);
  return {
    inspection: serializeInspectionForOwner(inspection, []),
    changed: outcome.changed,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LOJA — REGISTRAR A AVALIAÇÃO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Conclui a avaliação com a ficha do que foi observado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NADA AQUI SOBRESCREVE A DECLARAÇÃO DO PROPRIETÁRIO (§20, §45)
 * ────────────────────────────────────────────────────────────────────────────
 * `sale_requests.mileage` e a ficha da 054 permanecem exatamente como a pessoa
 * as escreveu. A leitura da loja vai para colunas `observed_*` PRÓPRIAS, e as
 * duas convivem para sempre.
 *
 * "Corrigir" o dado do proprietário seria destruir a prova de que houve
 * divergência — que é justamente o que justifica uma redução de valor depois. A
 * frase que o produto precisa poder dizer é *"você declarou 62.000, a loja leu
 * 64.230"*, e ela exige os dois números.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM RELÓGIO ARTIFICIAL (§22)
 * ────────────────────────────────────────────────────────────────────────────
 * Não se exige que `scheduled_at` já tenha passado. O carro pode chegar antes, a
 * loja pode ter atendido fora do horário combinado, e o relógio do servidor não
 * sabe nada disso. O requisito real é existir um agendamento confirmado — e é
 * só ele que é verificado.
 */
export async function completeInspection(userId, rawId, body = {}, context = {}) {
  const dealerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);
  const form = validateInspectionForm(body);

  const store = await requireDealerStore(dealerUserId, {
    advertiserId: context.advertiserId,
  });

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForDealer(saleRequestId, store.advertiserId, exec);
    if (!request) return notFound();

    if (request.status === SALE_REQUEST_STATUS.INSPECTION_COMPLETED) {
      // A ficha é IMUTÁVEL (§21). Não há "corrigir": um erro operacional é
      // assunto de fase futura, e permitir a reescrita agora apagaria o registro
      // que sustenta a justificativa de um eventual ajuste de valor.
      return invalidState("Esta avaliação já foi registrada.");
    }

    if (request.status !== SALE_REQUEST_STATUS.INSPECTION_SCHEDULED) {
      return invalidState("A avaliação só pode ser registrada depois do horário confirmado.");
    }

    if (!request.inspection_id) {
      return invalidState("Não há avaliação agendada.");
    }

    const completed = await repo.completeInspection(
      { inspectionId: request.inspection_id, form, completedByUserId: dealerUserId },
      exec
    );
    if (!completed) return invalidState("Não foi possível registrar a avaliação.");

    const moved = await repo.moveRequestStatus(
      {
        saleRequestId,
        fromStatus: SALE_REQUEST_STATUS.INSPECTION_SCHEDULED,
        toStatus: SALE_REQUEST_STATUS.INSPECTION_COMPLETED,
      },
      exec
    );
    if (!moved) return invalidState("Não foi possível registrar a avaliação.");

    return { ok: true, inspectionId: request.inspection_id };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.inspection_completed",
      userId: dealerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.inspection_completed",
        result: "success",
        userId: dealerUserId,
      }),
      saleRequestId,
      advertiserId: store.advertiserId,
      // A quilometragem observada entra no log porque é o fato central desta
      // linha. Nenhum dado pessoal acompanha, dos dois lados.
      observedMileage: form.observedMileage,
    },
    "[sale-requests] avaliação presencial registrada"
  );

  const inspection = await repo.getInspectionForRequest(saleRequestId);
  return { inspection: serializeInspectionForDealer(inspection, []) };
}

// ════════════════════════════════════════════════════════════════════════════
// LOJA — A DECISÃO COMERCIAL
// ════════════════════════════════════════════════════════════════════════════

/**
 * Apresenta a proposta final, ou declara que não haverá proposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O VALOR PRELIMINAR VEM DA TRANSAÇÃO, NUNCA DO CLIENTE
 * ────────────────────────────────────────────────────────────────────────────
 * É ele que decide se houve REDUÇÃO e, portanto, se a justificativa é
 * obrigatória. Aceitá-lo do corpo permitiria a uma loja declarar um preliminar
 * falso e escapar da exigência — a proteção do proprietário viraria uma
 * gentileza do cliente.
 *
 * Por isso a validação do corpo acontece DENTRO da transação, depois de ler o
 * valor travado: é o único ponto do domínio em que isso é necessário, e a razão
 * está escrita aqui para que ninguém "melhore" movendo-a para fora.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CORRIDA DO §37
 * ────────────────────────────────────────────────────────────────────────────
 * Duas requisições simultâneas — dois valores, ou proposta contra desistência —
 * disputam a mesma linha de `sale_requests`. Uma vence e grava; a outra acorda,
 * encontra o estado já movido e recebe 409. O UNIQUE de `sale_request_id` na
 * tabela de decisões é a rede: mesmo sem lock, duas decisões são impossíveis.
 */
export async function submitPostInspectionDecision(userId, rawId, body = {}, context = {}) {
  const dealerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const store = await requireDealerStore(dealerUserId, {
    advertiserId: context.advertiserId,
  });

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForDealer(saleRequestId, store.advertiserId, exec);
    if (!request) return notFound();

    // ── Retry idempotente ────────────────────────────────────────────────
    // Antes de qualquer validação nova, pelo mesmo motivo da 4.4: um retry de
    // rede sobre uma decisão que já teve sucesso precisa responder sucesso.
    if (request.decision_id) {
      const existing = await repo.getDecisionForRequest(saleRequestId, exec);
      const sameType = existing?.decision_type === String(body?.decision_type ?? "").trim();
      const sameAmount =
        existing?.final_amount == null
          ? body?.final_amount == null || String(body?.final_amount ?? "").trim() === ""
          : Number(existing.final_amount) === Number(String(body?.final_amount ?? "").replace(",", "."));

      if (sameType && sameAmount) {
        return { ok: true, changed: false, decision: existing };
      }

      return {
        ok: false,
        status: 409,
        message: "A decisão desta avaliação já foi registrada e não pode ser alterada.",
        code: INSPECTION_CODE.FINAL_DECISION_ALREADY_RECORDED,
      };
    }

    if (request.status !== SALE_REQUEST_STATUS.INSPECTION_COMPLETED) {
      return invalidState(
        "A proposta final só pode ser enviada depois da avaliação presencial registrada."
      );
    }

    if (!request.inspection_id) {
      return invalidState("Não há avaliação registrada.");
    }

    // O valor preliminar TRAVADO. É o critério da exigência de justificativa.
    const preliminaryAmount = request.selected_amount;

    const decision = validateFinalDecision(body, { preliminaryAmount });

    const inserted = await repo.insertDecision(
      {
        saleRequestId,
        inspectionId: request.inspection_id,
        advertiserId: store.advertiserId,
        selectedOfferId: request.selected_offer_id,
        decisionType: decision.decisionType,
        preliminaryAmount,
        finalAmount: decision.finalAmount,
        adjustmentReason: decision.adjustmentReason,
        adjustmentNote: decision.adjustmentNote,
        internalNote: decision.internalNote,
        decidedByUserId: dealerUserId,
      },
      exec
    );

    if (!inserted) {
      return {
        ok: false,
        status: 409,
        message: "A decisão desta avaliação já foi registrada e não pode ser alterada.",
        code: INSPECTION_CODE.FINAL_DECISION_ALREADY_RECORDED,
      };
    }

    const isOffer = decision.decisionType === POST_INSPECTION_DECISION.FINAL_OFFER;

    const moved = await repo.moveRequestStatus(
      {
        saleRequestId,
        fromStatus: SALE_REQUEST_STATUS.INSPECTION_COMPLETED,
        toStatus: isOffer
          ? SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED
          : SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED,
      },
      exec
    );
    if (!moved) return invalidState("Não foi possível registrar a decisão.");

    await notify(
      {
        recipientUserId: request.owner_user_id ?? null,
        eventType: isOffer
          ? NOTIFICATION_EVENT_TYPE.SALE_REQUEST_FINAL_OFFER_SUBMITTED
          : NOTIFICATION_EVENT_TYPE.SALE_REQUEST_FINAL_OFFER_DECLINED,
        title: isOffer ? "Proposta final recebida" : "Avaliação encerrada sem proposta",
        body: isOffer
          ? "A loja apresentou a proposta final após a avaliação presencial."
          : "A loja encerrou a avaliação sem apresentar proposta final.",
        saleRequestId,
        actionPath: ownerPath(saleRequestId),
        key: KEYS.decision(saleRequestId, decision.decisionType),
        // O VALOR entra no payload porque é o fato de negócio. Nenhum dado da
        // loja além dele — nem operador, nem contato, nem nota interna.
        payload: isOffer ? { final_amount: decision.finalAmount } : {},
      },
      exec
    );

    return { ok: true, changed: true, decision: inserted };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.post_inspection_decision",
      userId: dealerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.post_inspection_decision",
        result: "success",
        userId: dealerUserId,
      }),
      saleRequestId,
      advertiserId: store.advertiserId,
      decisionType: outcome.decision?.decision_type,
      finalAmount: outcome.decision?.final_amount ?? null,
      changed: outcome.changed,
    },
    outcome.changed
      ? "[sale-requests] decisão pós-avaliação registrada"
      : "[sale-requests] decisão repetida (idempotente)"
  );

  return {
    decision: serializeDecisionForOwner(outcome.decision),
    changed: outcome.changed,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LEITURAS
// ════════════════════════════════════════════════════════════════════════════

/** O bloco de avaliação + decisão para o DTO do proprietário. */
export async function readOwnerInspectionState(saleRequestId, exec) {
  const inspection = await repo.getInspectionForRequest(saleRequestId, exec);
  if (!inspection) return { inspection: null, final_decision: null };

  const slots =
    inspection.schedule_status === INSPECTION_SCHEDULE_STATUS.AWAITING_OWNER
      ? await repo.listCurrentSlots(inspection.id, exec)
      : [];

  const decision = await repo.getDecisionForRequest(saleRequestId, exec);

  return {
    inspection: serializeInspectionForOwner(inspection, slots),
    final_decision: serializeDecisionForOwner(decision),
  };
}

/** O bloco de avaliação + decisão para o DTO do lojista. */
export async function readDealerInspectionState(saleRequestId, exec) {
  const inspection = await repo.getInspectionForRequest(saleRequestId, exec);
  if (!inspection) return { inspection: null, final_decision: null };

  const slots = await repo.listCurrentSlots(inspection.id, exec);
  const decision = await repo.getDecisionForRequest(saleRequestId, exec);

  return {
    inspection: serializeInspectionForDealer(inspection, slots),
    final_decision: serializeDecisionForOwner(decision),
  };
}

export { serializeInspectionForOwner, serializeDecisionForOwner };
