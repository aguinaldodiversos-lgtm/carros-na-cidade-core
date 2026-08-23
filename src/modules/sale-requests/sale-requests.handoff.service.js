/**
 * O HANDOFF DIRETO, o desfecho e as RODADAS (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TRÊS AÇÕES DO PROPRIETÁRIO, UM ÚNICO PONTO DE SERIALIZAÇÃO
 * ════════════════════════════════════════════════════════════════════════════
 *   1. resolver o WhatsApp da loja escolhida  (leitura)
 *   2. informar que NÃO HOUVE ACORDO           (offer_selected → handoff_failed)
 *   3. abrir uma NOVA RODADA                   (handoff_failed → receiving_offers)
 *
 * As duas de escrita travam a MESMA linha de `sale_requests` que a seleção
 * trava. É isso — e só isso — que impede os cenários dos §41, §42 e §43:
 * aceitar outra oferta, encerrar o handoff e abrir rodada nova não podem
 * acontecer em paralelo sobre o mesmo negócio.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE MÓDULO NÃO PERGUNTA
 * ════════════════════════════════════════════════════════════════════════════
 * Quem desistiu, qual defeito, qual valor foi renegociado, de quem é a culpa.
 * O Carros na Cidade não arbitra a negociação, e um campo de texto aqui viraria
 * o depoimento de uma parte sobre a outra, guardado para sempre e sem
 * contraditório.
 *
 * E não pergunta o SUCESSO. Se o negócio deu certo, a solicitação simplesmente
 * permanece em `offer_selected` sem atividade — a plataforma entregou o match e
 * não precisa saber o resto.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { normalizeWhatsappDigits } from "../../shared/utils/brPhone.js";
import * as repo from "./sale-requests.handoff.repository.js";
import * as roundsRepo from "./sale-requests.rounds.repository.js";
import {
  SALE_REQUEST_CODE,
  SALE_REQUEST_LEGACY_STATUSES,
  SALE_REQUEST_STATUS,
} from "./sale-requests.constants.js";
import {
  HANDOFF_MESSAGE,
  HANDOFF_OUTCOME,
  WHATSAPP_BASE_URL,
  buildHandoffMessage,
} from "./sale-requests.handoff.constants.js";
import {
  parseSaleRequestId,
  requireUserId,
  validateMinimumAcceptedPrice,
} from "./sale-requests.validation.js";
import { deriveCommercialModel } from "../../shared/vehicle/commercial-model.js";

function notFound() {
  return { ok: false, status: 404, message: "Solicitação não encontrada." };
}

function conflict(message, code) {
  return { ok: false, status: 409, message, code };
}

/**
 * A mensagem certa para cada estado que NÃO aceita "não houve acordo".
 *
 * Todos compartilham o mesmo `code` — a tela faz a mesma coisa nos três:
 * recarregar. O que muda é o texto, porque a pessoa precisa entender por que o
 * botão que ela viu não valeu mais.
 */
function messageForState(status) {
  if (status === SALE_REQUEST_STATUS.CANCELLED) return HANDOFF_MESSAGE.CANCELLED;
  if (SALE_REQUEST_LEGACY_STATUSES.includes(status)) return HANDOFF_MESSAGE.LEGACY;
  return HANDOFF_MESSAGE.NO_SELECTION;
}

/** Erro de domínio → HTTP, com log. */
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
    "[sale-requests] ação de handoff recusada"
  );

  throw new AppError(outcome.message, outcome.status, true, {
    ...(outcome.code ? { code: outcome.code } : {}),
  });
}

// ════════════════════════════════════════════════════════════════════════════
// 1. O CONTATO DA LOJA ESCOLHIDA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Nome do veículo para a MENSAGEM.
 *
 * Usa o modelo COMERCIAL derivado (`deriveCommercialModel`), e não a descrição
 * FIPE inteira: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut." transformaria a abertura
 * da conversa num despejo de catálogo. O nome comercial é como as duas pessoas
 * vão chamar o carro — "Volkswagen T-Cross 2020".
 */
function vehicleNameForMessage(row) {
  const brand = String(row?.vehicle_brand ?? "").trim();

  // `deriveCommercialModel` devolve `{ label, slug, source }` — NÃO uma string.
  // Interpolá-lo direto produz "[object Object]" na mensagem que a pessoa
  // assina, e nenhum teste de tipo pega isso num template literal.
  const derived = deriveCommercialModel(row?.vehicle_model, { brand });
  const model = String(derived?.label ?? "").trim();

  const year = Number(row?.vehicle_year);
  const name = [brand, model].filter(Boolean).join(" ").trim() || "veículo";

  return Number.isInteger(year) && year > 1900 ? `${name} ${year}` : name;
}

/**
 * Resolve o link de WhatsApp da loja cuja oferta foi aceita.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE UM ENDPOINT, E NÃO UM CAMPO NO DTO
 * ────────────────────────────────────────────────────────────────────────────
 * Mesma escolha do Produto 1 (`purchase-intent-offers`), pelas mesmas razões:
 *
 *   1. o número não trafega em toda leitura da tela — ele sai UMA vez, quando a
 *      pessoa decide falar com a loja;
 *   2. o acesso fica registrado no log de domínio, com o autor;
 *   3. a resposta é MÍNIMA — só a URL. Sem telefone em campo separado, sem eco
 *      de nada que o cliente mandou.
 *
 * A URL é montada no SERVIDOR. Mandar os dígitos e deixar a tela montar o link
 * daria à tela a chance de montá-lo errado — e um `wa.me` errado abre uma
 * conversa com um estranho.
 *
 * Fora de transação: é leitura. O que autoriza é o `WHERE` da query (dono +
 * oferta selecionada), não um estado que possa mudar no meio.
 */
export async function getSelectedStoreWhatsapp(userId, rawId) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const row = await repo.getSelectedStoreContact(saleRequestId, ownerUserId);

  // Sem linha: não é dele, não existe, ou não há oferta aceita. O MESMO 404
  // para os três — distinguir contaria a quem sonda ids qual solicitação existe.
  if (!row) {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.handoff_whatsapp",
          result: "error",
          userId: ownerUserId,
          reason: "not_found",
        }),
        saleRequestId,
      },
      "[sale-requests] contato de handoff não encontrado"
    );
    throw new AppError("Solicitação não encontrada.", 404);
  }

  const digits = normalizeWhatsappDigits(row.store_whatsapp);
  if (!digits) {
    // Estado de DADO, não falha: a loja não preencheu um número utilizável.
    // Log SEM o valor cru — mesmo inválido, é telefone de alguém.
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.handoff_whatsapp",
          result: "error",
          userId: ownerUserId,
          reason: "whatsapp_unavailable",
        }),
        saleRequestId,
        advertiserId: row.advertiser_id,
      },
      "[sale-requests] loja sem WhatsApp utilizável"
    );
    throw new AppError(HANDOFF_MESSAGE.WHATSAPP_UNAVAILABLE, 409, true, {
      code: SALE_REQUEST_CODE.STORE_WHATSAPP_UNAVAILABLE,
    });
  }

  const message = buildHandoffMessage(vehicleNameForMessage(row));
  const url = `${WHATSAPP_BASE_URL}/${digits}?text=${encodeURIComponent(message)}`;

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.handoff_whatsapp",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      advertiserId: row.advertiser_id,
    },
    "[sale-requests] contato de WhatsApp do handoff resolvido"
  );

  return { url };
}

// ════════════════════════════════════════════════════════════════════════════
// 2. NÃO HOUVE ACORDO
// ════════════════════════════════════════════════════════════════════════════

/**
 * O proprietário informa que a negociação direta não prosseguiu.
 *
 * NÃO recebe corpo nenhum, e a ausência é a regra (§17): nem motivo, nem valor,
 * nem quem desistiu. Um campo aqui viraria o canal de reclamação que o produto
 * decidiu não ter — e a primeira pessoa a escrever o nome de um funcionário
 * transformaria a plataforma em parte de um conflito que ela não presenciou.
 *
 * ORDEM DOS PASSOS, numa transação:
 *   1. TRAVA a solicitação, escopada ao dono → 404 se não é dele;
 *   2. exige `offer_selected` (há match ATIVO para encerrar);
 *   3. lê a seleção corrente pelo ponteiro;
 *   4. se JÁ existe desfecho → 200 idempotente, sem escrever;
 *   5. insere o desfecho;
 *   6. move para `handoff_failed`;
 *   7. commit.
 *
 * O passo 4 vem antes do 5 pelo mesmo motivo das fases anteriores: um retry de
 * rede sobre uma ação que já teve sucesso precisa responder sucesso.
 *
 * NÃO notifica a loja. O §46 é explícito de que isso é opcional, e o silêncio é
 * a escolha certa aqui: a loja participou da negociação presencial e já sabe o
 * que aconteceu. Um aviso do portal contando o desfecho de uma conversa que ele
 * não presenciou — e baseado no relato de uma das partes — seria a plataforma
 * tomando lado.
 */
export async function reportNoAgreement(userId, rawId) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForOwner(saleRequestId, ownerUserId, exec);
    if (!request) return notFound();

    // Já informado: idempotente. Precisa vir ANTES do guard de estado, porque
    // depois do primeiro sucesso o status é `handoff_failed` — e a ordem
    // inversa responderia "você ainda não aceitou nenhuma oferta" a quem
    // acabou de encerrar o handoff.
    if (request.status === SALE_REQUEST_STATUS.HANDOFF_FAILED) {
      return { ok: true, changed: false };
    }

    if (request.status !== SALE_REQUEST_STATUS.OFFER_SELECTED) {
      return conflict(
        messageForState(request.status),
        SALE_REQUEST_CODE.HANDOFF_NOT_ACTIVE
      );
    }

    const selection = await repo.getCurrentSelection(
      saleRequestId,
      request.selected_offer_id,
      exec
    );

    if (!selection) {
      // Inexprimível: o CHECK de coerência garante `selected_offer_id` em
      // `offer_selected`, e toda seleção grava a trilha na mesma transação. O
      // ramo existe para que a impossibilidade vire 409 legível.
      return conflict(HANDOFF_MESSAGE.NO_SELECTION, SALE_REQUEST_CODE.HANDOFF_NOT_ACTIVE);
    }

    const inserted = await repo.insertOutcome(
      {
        saleRequestId,
        selectionId: selection.id,
        outcome: HANDOFF_OUTCOME.NO_AGREEMENT,
        recordedByUserId: ownerUserId,
      },
      exec
    );

    if (!inserted) {
      // O UNIQUE de `selection_id` recusou — esta seleção já foi encerrada.
      // Com o lock isto não deveria acontecer; é a rede de segurança.
      return { ok: true, changed: false };
    }

    const moved = await repo.moveRequestStatus(
      {
        saleRequestId,
        ownerUserId,
        fromStatus: SALE_REQUEST_STATUS.OFFER_SELECTED,
        toStatus: SALE_REQUEST_STATUS.HANDOFF_FAILED,
      },
      exec
    );

    if (!moved) {
      return conflict(HANDOFF_MESSAGE.NO_SELECTION, SALE_REQUEST_CODE.HANDOFF_NOT_ACTIVE);
    }

    return { ok: true, changed: true };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.handoff_no_agreement",
      userId: ownerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.handoff_no_agreement",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      changed: outcome.changed,
    },
    outcome.changed
      ? "[sale-requests] handoff encerrado sem acordo"
      : "[sale-requests] handoff já encerrado (idempotente)"
  );

  return { changed: outcome.changed };
}

// ════════════════════════════════════════════════════════════════════════════
// 3. NOVA RODADA
// ════════════════════════════════════════════════════════════════════════════

/**
 * Abre uma rodada nova, com um piso novo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE SÓ A PARTIR DE `handoff_failed`
 * ────────────────────────────────────────────────────────────────────────────
 * Durante `receiving_offers` não faz sentido — a disputa está aberta e abrir
 * outra apagaria propostas que estão valendo. Durante `offer_selected` seria
 * pior: existe um match ativo, e as duas partes podem estar conversando neste
 * instante. Reabrir por baixo disso é o único caminho desta fase que poderia
 * atropelar uma negociação real.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * IDEMPOTÊNCIA (§44)
 * ────────────────────────────────────────────────────────────────────────────
 * O retry do POST da rodada 2 NÃO pode criar a rodada 3. A defesa é dupla:
 *
 *   - o `UPDATE` exige `current_round_number = novo - 1`. Depois do primeiro
 *     sucesso o ponteiro já é 2, e o segundo request calcula 3 → não casa;
 *   - o `fromStatus = handoff_failed` já não vale (a solicitação voltou para
 *     `receiving_offers`).
 *
 * O segundo request cai no ramo de estado inválido e recebe 409 — que é a
 * resposta certa: ele PEDIU uma coisa diferente da primeira (outro piso,
 * possivelmente), e responder 200 esconderia que o piso enviado foi ignorado.
 */
export async function openNewRound(userId, rawId, body = {}) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  // O piso é validado ANTES do lock: um valor malformado é 400 em qualquer
  // estado, e não vale segurar uma linha do banco para descobrir isso.
  //
  // Reusa o MESMO validador da publicação — o piso de uma rodada nova é o mesmo
  // tipo de dado que o piso original, e uma segunda regra aqui divergiria da
  // primeira no dia em que uma delas mudasse.
  const minimumAcceptedPrice = validateMinimumAcceptedPrice(body?.minimum_accepted_price);

  const outcome = await withTransaction(async (exec) => {
    const request = await repo.lockRequestForOwner(saleRequestId, ownerUserId, exec);
    if (!request) return notFound();

    if (request.status !== SALE_REQUEST_STATUS.HANDOFF_FAILED) {
      return conflict(
        HANDOFF_MESSAGE.ROUND_REQUIRES_FAILED_HANDOFF,
        SALE_REQUEST_CODE.ROUND_NOT_ALLOWED
      );
    }

    const nextNumber = Number(request.current_round_number) + 1;

    const round = await roundsRepo.insertRound(
      { saleRequestId, roundNumber: nextNumber, minimumAcceptedPrice },
      exec
    );

    if (!round) {
      // O UNIQUE (sale_request_id, round_number) recusou: outra transação já
      // criou esta rodada. Com o lock não deveria acontecer — é a rede do §43.
      return conflict(
        HANDOFF_MESSAGE.ROUND_REQUIRES_FAILED_HANDOFF,
        SALE_REQUEST_CODE.ROUND_NOT_ALLOWED
      );
    }

    // Move o ponteiro E reabre a disputa no MESMO UPDATE. Ver o comentário de
    // `openRound`: nenhum dos dois estados intermediários pode existir.
    const opened = await roundsRepo.openRound(
      {
        saleRequestId,
        ownerUserId,
        roundNumber: nextNumber,
        fromStatus: SALE_REQUEST_STATUS.HANDOFF_FAILED,
        toStatus: SALE_REQUEST_STATUS.RECEIVING_OFFERS,
      },
      exec
    );

    if (!opened) {
      return conflict(
        HANDOFF_MESSAGE.ROUND_REQUIRES_FAILED_HANDOFF,
        SALE_REQUEST_CODE.ROUND_NOT_ALLOWED
      );
    }

    return { ok: true, changed: true, round };
  });

  if (!outcome.ok) {
    raise(outcome, {
      action: "sale_request.open_round",
      userId: ownerUserId,
      saleRequestId,
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.open_round",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      roundNumber: outcome.round?.round_number,
    },
    "[sale-requests] nova rodada aberta"
  );

  return {
    round: {
      number: outcome.round.round_number,
      minimum_accepted_price: outcome.round.minimum_accepted_price,
      created_at: outcome.round.created_at,
    },
    changed: outcome.changed,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// LEITURAS DE TELA
// ════════════════════════════════════════════════════════════════════════════

/**
 * O histórico de matches, para o DTO do proprietário.
 *
 * Allowlist explícita. O que sai: nome da loja, valor, data, rodada e se aquele
 * match foi encerrado. O que NÃO sai: `advertiser_id`, `offer_id`,
 * `dealer_user_id`, `selection_id` e qualquer contato — ids internos não
 * atravessam a fronteira, e a tela não precisa de nenhum deles para renderizar
 * "Não houve acordo com a Loja A".
 */
export async function readSelectionHistory(saleRequestId, exec) {
  const rows = await repo.listSelectionHistory(saleRequestId, exec);

  return rows.map((row) => ({
    store_name: row.store_name,
    amount: row.amount_snapshot,
    selected_at: row.selected_at,
    round_number: row.round_number,
    /** `null` enquanto o match está vivo; `no_agreement` quando foi encerrado. */
    outcome: row.outcome ?? null,
    outcome_at: row.outcome_at ?? null,
  }));
}
