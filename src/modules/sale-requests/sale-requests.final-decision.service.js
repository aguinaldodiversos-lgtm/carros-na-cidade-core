/**
 * A DECISÃO DO PROPRIETÁRIO sobre a proposta final (Fase 4.6).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE MÓDULO REGISTRA — E O QUE ELE NÃO REGISTRA
 * ════════════════════════════════════════════════════════════════════════════
 * Registra UM fato: o proprietário aceitou, ou recusou, a proposta comercial
 * final que a loja apresentou depois de ver o carro.
 *
 * `final_offer_accepted` NÃO significa veículo vendido, pagamento realizado,
 * transferência concluída, contrato assinado nem negócio liquidado. Nenhuma
 * dessas coisas existe neste produto, nenhuma tem writer, e nenhum texto destas
 * telas pode sugerir que existam — há teste travando as frases proibidas.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * RECUSAR NÃO REABRE A DISPUTA
 * ════════════════════════════════════════════════════════════════════════════
 * `final_offer_rejected` é terminal. Não volta para `receiving_offers`, não
 * apaga a seleção, não apaga a inspeção, não apaga a proposta final e não
 * libera uma segunda escolha de loja.
 *
 * O motivo está escrito por extenso na migration 059: a 4.4 criou uma seleção
 * ÚNICA e a 4.5 criou uma inspeção e uma decisão comercial ÚNICAS, todas
 * amarradas por FK composta à loja escolhida. Um `status = 'receiving_offers'`
 * deixaria sem resposta se os lances antigos voltam a valer, a qual rodada a
 * inspeção pertence e o que acontece com o UNIQUE de seleção já ocupado.
 * Reabertura é uma fase com conceito de RODADA, e improvisá-la aqui produziria
 * o estado ambíguo que as migrations 057 e 058 tiveram de consertar depois.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O VALOR NUNCA VEM DO CLIENTE (§8)
 * ════════════════════════════════════════════════════════════════════════════
 * O corpo carrega `decision` e NADA MAIS é lido dele. `final_amount`,
 * `preliminary_amount`, `advertiser_id` e `owner_user_id` enviados pelo cliente
 * não são apenas ignorados — não existe código neste caminho que os leia.
 *
 * O valor gravado é copiado da proposta final PERSISTIDA, dentro da transação,
 * depois do lock. E a FK composta de 5 colunas da 059 confere essa cópia no
 * banco: gravar um número diferente do que a loja apresentou levanta violação de
 * FK, não uma linha errada.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { createUserNotification } from "../notifications/notifications.service.js";
import { NOTIFICATION_EVENT_TYPE } from "../notifications/notifications.constants.js";
import * as repo from "./sale-requests.final-decision.repository.js";
import {
  SALE_REQUEST_OWNER_DECIDED_STATUSES,
  SALE_REQUEST_STATUS,
} from "./sale-requests.constants.js";
import { POST_INSPECTION_DECISION } from "./sale-requests.inspection.constants.js";
import {
  OWNER_FINAL_DECISION,
  OWNER_FINAL_DECISION_CODE,
  OWNER_FINAL_DECISION_MESSAGE,
  OWNER_FINAL_DECISIONS,
} from "./sale-requests.final-decision.constants.js";
import { parseSaleRequestId, requireUserId } from "./sale-requests.validation.js";

// ════════════════════════════════════════════════════════════════════════════
// O MAPA DECISÃO → ESTADO
// ════════════════════════════════════════════════════════════════════════════

/**
 * A única fonte da correspondência entre a trilha e o status.
 *
 * Existe como TABELA e não como `isAccepted ? A : B` espalhado pelo arquivo
 * porque o §17 exige uma invariante forte: `status = final_offer_accepted` se e
 * somente se `decision_type = accepted`. Dois ternários independentes — um para
 * o INSERT, outro para o UPDATE — são exatamente como essa invariante se quebra
 * numa refatoração distraída, e o banco não tem como recusar a combinação
 * cruzada (são tabelas diferentes).
 *
 * Com o mapa, a combinação impossível não é "proibida": é inexprimível, porque
 * os dois lados leem a mesma entrada.
 */
const STATUS_BY_DECISION = Object.freeze({
  [OWNER_FINAL_DECISION.ACCEPTED]: SALE_REQUEST_STATUS.FINAL_OFFER_ACCEPTED,
  [OWNER_FINAL_DECISION.REJECTED]: SALE_REQUEST_STATUS.FINAL_OFFER_REJECTED,
});

/**
 * Os avisos, também derivados da MESMA entrada.
 *
 * Nenhum texto aqui afirma conclusão de venda. "Proposta final aceita" e
 * "Proposta final não aceita" descrevem exatamente o que aconteceu; "Negócio
 * fechado", "Veículo vendido" e "Pagamento confirmado" descreveriam coisas que
 * não aconteceram, e um lojista que lesse isso no sino pararia de tratar o carro
 * como disponível.
 *
 * O corpo não carrega telefone, WhatsApp, e-mail, CPF, endereço nem nome do
 * proprietário. Nem poderia: nenhuma query deste módulo faz JOIN com `users`.
 */
const NOTIFICATION_BY_DECISION = Object.freeze({
  [OWNER_FINAL_DECISION.ACCEPTED]: {
    eventType: NOTIFICATION_EVENT_TYPE.SALE_REQUEST_FINAL_OFFER_ACCEPTED,
    title: "Proposta final aceita",
    body: "O proprietário aceitou a sua proposta final após a avaliação presencial.",
  },
  [OWNER_FINAL_DECISION.REJECTED]: {
    eventType: NOTIFICATION_EVENT_TYPE.SALE_REQUEST_FINAL_OFFER_REJECTED,
    title: "Proposta final não aceita",
    body: "O proprietário não aceitou a proposta final apresentada após a avaliação.",
  },
});

/**
 * Chave de idempotência determinística.
 *
 * Inclui o TIPO da decisão, como a da 4.5 inclui o tipo da decisão da loja. Não
 * é para permitir duas notificações — a trilha é única e o segundo INSERT nunca
 * acontece —, é para que a chave descreva o fato: se um dia existir uma segunda
 * resposta (não nesta fase), ela não silenciará por colidir com a primeira.
 */
const notificationKey = (id, decision) => `sale-request:${id}:owner-final-decision:${decision}`;

const dealerPath = (id) => `/dashboard-loja/oportunidades/veiculos/${id}`;

// ════════════════════════════════════════════════════════════════════════════
// VALIDAÇÃO
// ════════════════════════════════════════════════════════════════════════════

/**
 * O corpo inteiro: um campo, duas respostas possíveis.
 *
 * Allowlist e não "qualquer string não vazia": `decision: "accept"` (sem o `ed`)
 * seria aceito por uma checagem frouxa e gravaria um `decision_type` que o CHECK
 * do banco recusa — 500 em vez de 400, e a pessoa não descobriria o que digitou
 * errado.
 *
 * Roda ANTES do lock: um corpo malformado é 400 para qualquer solicitação, em
 * qualquer estado, e não vale segurar uma linha do banco para descobrir isso.
 */
function parseDecision(body) {
  const raw = String(body?.decision ?? "").trim().toLowerCase();

  if (!OWNER_FINAL_DECISIONS.includes(raw)) {
    throw new AppError(OWNER_FINAL_DECISION_MESSAGE.INVALID_DECISION, 400, true, {
      code: OWNER_FINAL_DECISION_CODE.INVALID_DECISION,
    });
  }

  return raw;
}

/**
 * A mensagem certa para cada estado que NÃO aceita decisão.
 *
 * Todos compartilham o mesmo `code` (a tela faz a mesma coisa: recarregar), e o
 * que muda é o texto — porque a pessoa precisa entender por que o botão que ela
 * viu não valeu mais.
 *
 * `final_offer_declined` tem frase própria e é o caso do §13: a loja encerrou
 * SEM apresentar proposta, então não existe nada para aceitar ou recusar.
 * Responder "estado inválido" genérico aqui faria a pessoa procurar uma proposta
 * que nunca foi feita.
 */
function messageForState(status) {
  if (status === SALE_REQUEST_STATUS.FINAL_OFFER_DECLINED) {
    return OWNER_FINAL_DECISION_MESSAGE.DECLINED_BY_STORE;
  }
  if (status === SALE_REQUEST_STATUS.CANCELLED) {
    return OWNER_FINAL_DECISION_MESSAGE.CANCELLED;
  }
  return OWNER_FINAL_DECISION_MESSAGE.NO_FINAL_OFFER;
}

function notFound() {
  return { ok: false, status: 404, message: "Solicitação não encontrada." };
}

function invalidState(message) {
  return {
    ok: false,
    status: 409,
    message,
    code: OWNER_FINAL_DECISION_CODE.INVALID_STATE,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// A TRANSAÇÃO
// ════════════════════════════════════════════════════════════════════════════

/**
 * Aceita ou recusa a proposta final.
 *
 * ORDEM DOS PASSOS, numa única transação — e nenhum critério é avaliado fora
 * dela:
 *
 *   1. valida a FORMA do corpo (antes do lock: 400 independe de estado);
 *   2. TRAVA a solicitação, já escopada ao dono — 404 se não é dele;
 *   3. lê a decisão do proprietário, se já houver:
 *        - mesma decisão  → 200 idempotente, sem escrita e sem notificação;
 *        - decisão oposta → 409, e nada é gravado;
 *   4. exige `final_offer_submitted`;
 *   5. carrega a proposta final e prova que é do tipo `final_offer`;
 *   6. deriva o valor DELA (nunca do corpo);
 *   7. insere a trilha;
 *   8. move o status pelo mesmo mapa que escolheu o `decision_type`;
 *   9. avisa a loja selecionada, com o MESMO `exec`;
 *  10. commit.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O RETRY É CHECADO ANTES DO ESTADO
 * ────────────────────────────────────────────────────────────────────────────
 * Depois de aceitar, o status é `final_offer_accepted` — que NÃO é
 * `final_offer_submitted`. Se o passo 4 viesse primeiro, o retry legítimo de
 * quem perdeu a resposta na rede receberia "esta solicitação não tem proposta
 * final para responder", que é falso e assustador. Mesma ordem, e pelo mesmo
 * motivo, da decisão comercial da 4.5.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CORRIDA DO §17
 * ────────────────────────────────────────────────────────────────────────────
 * `accepted` e `rejected` simultâneos disputam a MESMA linha de `sale_requests`.
 * Uma transação vence e grava as duas coisas juntas; a outra acorda depois do
 * commit, relê a trilha (leitura própria, pós-lock) e cai no ramo do passo 3 —
 * 200 se for a mesma decisão, 409 se for a oposta.
 *
 * Três redes independentes garantem que estado e trilha nunca divirjam:
 * o LOCK serializa, o UNIQUE de `sale_request_id` impede a segunda linha, e o
 * `fromStatus` no UPDATE impede a segunda transição. Qualquer uma sozinha já
 * bastaria; as três existem porque a que falha é sempre a que ninguém previu.
 */
export async function decideFinalOffer(userId, rawId, body = {}) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);
  const decision = parseDecision(body);

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForOwner(saleRequestId, ownerUserId, exec);
    if (!request) return notFound();

    // ── Retry idempotente / decisão oposta (§16) ──────────────────────────
    const existing = await repo.getOwnerDecision(saleRequestId, exec);
    if (existing) {
      if (existing.decision_type === decision) {
        return { ok: true, changed: false, decision: existing };
      }
      return {
        ok: false,
        status: 409,
        message: OWNER_FINAL_DECISION_MESSAGE.ALREADY_DECIDED,
        code: OWNER_FINAL_DECISION_CODE.ALREADY_DECIDED,
      };
    }

    // Chegar aqui com um dos estados decididos e SEM trilha seria o banco
    // discordando de si mesmo. Não acontece — a trilha e o status são gravados
    // na mesma transação —, e o guard existe para que essa impossibilidade
    // apareça como 409 legível em vez de seguir adiante gravando a segunda
    // decisão sobre uma solicitação que já tem uma.
    if (SALE_REQUEST_OWNER_DECIDED_STATUSES.includes(request.status)) {
      return {
        ok: false,
        status: 409,
        message: OWNER_FINAL_DECISION_MESSAGE.ALREADY_DECIDED,
        code: OWNER_FINAL_DECISION_CODE.ALREADY_DECIDED,
      };
    }

    if (request.status !== SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED) {
      return invalidState(messageForState(request.status));
    }

    const finalOffer = await repo.getPostInspectionDecision(saleRequestId, exec);

    // Sem proposta final persistida, ou com uma do tipo `no_offer`, não há o que
    // responder. O segundo caso não deveria coexistir com
    // `final_offer_submitted` (a 4.5 só move para lá no ramo `final_offer`), e a
    // FK composta da 059 o tornaria impossível de gravar mesmo assim — mas a
    // prova de FK só existe DEPOIS do INSERT, e um 500 de constraint é uma
    // resposta pior do que este 409. É o limite estrutural do §10, e ele está
    // coberto nos dois lugares: aqui, e no banco.
    if (!finalOffer || finalOffer.decision_type !== POST_INSPECTION_DECISION.FINAL_OFFER) {
      return invalidState(OWNER_FINAL_DECISION_MESSAGE.NO_FINAL_OFFER);
    }

    // O VALOR. Da proposta final travada, e de lugar nenhum além dela.
    const finalAmount = finalOffer.final_amount;

    const inserted = await repo.insertOwnerDecision(
      {
        saleRequestId,
        postInspectionDecisionId: finalOffer.id,
        advertiserId: finalOffer.advertiser_id,
        decisionType: decision,
        finalAmount,
        decidedByUserId: ownerUserId,
      },
      exec
    );

    if (!inserted) {
      return {
        ok: false,
        status: 409,
        message: OWNER_FINAL_DECISION_MESSAGE.ALREADY_DECIDED,
        code: OWNER_FINAL_DECISION_CODE.ALREADY_DECIDED,
      };
    }

    const moved = await repo.moveRequestStatus(
      {
        saleRequestId,
        fromStatus: SALE_REQUEST_STATUS.FINAL_OFFER_SUBMITTED,
        toStatus: STATUS_BY_DECISION[decision],
      },
      exec
    );
    if (!moved) return invalidState(OWNER_FINAL_DECISION_MESSAGE.NO_FINAL_OFFER);

    // O destinatário: a conta que enviou a proposta preliminar selecionada.
    // Endereçamento, não autorização.
    const recipient = await repo.getSelectedOfferRecipient(
      saleRequestId,
      request.selected_offer_id,
      exec
    );

    const template = NOTIFICATION_BY_DECISION[decision];

    await createUserNotification(
      {
        recipientUserId: recipient?.dealer_user_id ?? null,
        eventType: template.eventType,
        title: template.title,
        body: template.body,
        entityType: "sale_request",
        entityId: saleRequestId,
        actionPath: dealerPath(saleRequestId),
        // O VALOR entra porque é o fato de negócio, e a loja já o conhece — foi
        // ela que o propôs. Nada do proprietário viaja junto.
        payload: { final_amount: finalAmount },
        idempotencyKey: notificationKey(saleRequestId, decision),
      },
      { exec }
    );

    return { ok: true, changed: true, decision: inserted };
  });

  if (!outcome.ok) {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.owner_final_decision",
          result: "error",
          userId: ownerUserId,
          reason: outcome.code || "not_found",
        }),
        saleRequestId,
      },
      "[sale-requests] decisão sobre a proposta final recusada"
    );

    throw new AppError(outcome.message, outcome.status, true, {
      ...(outcome.code ? { code: outcome.code } : {}),
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.owner_final_decision",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      decisionType: outcome.decision?.decision_type,
      changed: outcome.changed,
    },
    outcome.changed
      ? "[sale-requests] decisão do proprietário registrada"
      : "[sale-requests] decisão repetida (idempotente)"
  );

  return {
    owner_final_decision: serializeOwnerDecision(outcome.decision),
    changed: outcome.changed,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// SERIALIZAÇÃO E LEITURAS
// ════════════════════════════════════════════════════════════════════════════

/**
 * A decisão na visão do PROPRIETÁRIO (§29).
 *
 * Três campos, allowlist explícita. `advertiser_id`, `dealer_user_id`,
 * `decided_by_user_id`, `post_inspection_decision_id` e o `id` da própria linha
 * NÃO saem — nenhuma tela precisa deles, e id interno atravessando a fronteira é
 * como um cliente futuro acaba montando URL a partir de chave primária.
 *
 * A garantia é dupla: a query do repositório não seleciona os três primeiros, e
 * este objeto não os menciona.
 */
function serializeOwnerDecision(row) {
  if (!row) return null;

  return {
    type: row.decision_type,
    final_amount: row.final_amount_snapshot,
    decided_at: row.created_at,
  };
}

/**
 * A decisão na visão do LOJISTA (§30).
 *
 * Sem o valor: a loja já o conhece — foi ela que o apresentou, e ele volta no
 * bloco `final_decision` da própria proposta final. Repeti-lo aqui criaria duas
 * fontes para o mesmo número na mesma tela, e a primeira divergência entre elas
 * seria um bug que ninguém saberia ler.
 *
 * Nada do proprietário: nem nome, nem contato, nem documento. Continua valendo
 * sem exceção a regra da 4.3 — quem foi escolhido ganhou o direito de saber que
 * foi escolhido, não o contato de quem escolheu.
 */
function serializeOwnerDecisionForDealer(row) {
  if (!row) return null;

  return {
    type: row.decision_type,
    decided_at: row.created_at,
  };
}

/** O bloco da decisão para o DTO do proprietário. `null` enquanto não houver. */
export async function readOwnerFinalDecision(saleRequestId, exec) {
  return serializeOwnerDecision(await repo.getOwnerDecision(saleRequestId, exec));
}

/** O bloco da decisão para o DTO do lojista. `null` enquanto não houver. */
export async function readOwnerFinalDecisionForDealer(saleRequestId, exec) {
  return serializeOwnerDecisionForDealer(await repo.getOwnerDecision(saleRequestId, exec));
}

export { serializeOwnerDecision, serializeOwnerDecisionForDealer };
