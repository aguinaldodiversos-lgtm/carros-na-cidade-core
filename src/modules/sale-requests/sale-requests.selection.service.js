/**
 * A ESCOLHA do proprietário — Fase 4.4.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA DE PRODUTO, EM UMA FRASE
 * ────────────────────────────────────────────────────────────────────────────
 * O proprietário escolhe QUALQUER uma das propostas atuais, e a escolha encerra
 * a disputa sem concluir venda nenhuma.
 *
 * As duas metades importam.
 *
 * "QUALQUER UMA" é uma decisão de produto, não uma frouxidão. O servidor NÃO
 * compara o valor escolhido com o maior valor, e nunca vai comparar: quem vende
 * o próprio carro pondera coisas que este sistema não conhece — a loja que ele
 * já conhece, a que fica perto, a que o atendeu melhor. Um `if` recusando a
 * proposta menor transformaria um leilão assistido em leilão automático, e a
 * pessoa descobriria isso ao clicar. Há teste dedicado provando que a MENOR pode
 * ser selecionada (§28), em três camadas, exatamente para que ninguém adicione
 * essa comparação "por segurança" mais tarde.
 *
 * "SEM CONCLUIR VENDA" é o motivo de nada aqui abrir contato. A seleção é
 * PRELIMINAR: o valor ainda será revisto na avaliação presencial, e as duas
 * partes continuam sem telefone, e-mail ou WhatsApp uma da outra. Não existe
 * neste arquivo — e não deve passar a existir — nenhum campo de contato, nenhum
 * link externo e nenhum "agendar".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE MÓDULO NÃO FAZ, DE PROPÓSITO
 * ────────────────────────────────────────────────────────────────────────────
 * Não desfaz seleção, não reabre disputa, não troca de loja, não recusa
 * proposta, não conclui venda, não cobra comissão, não agenda visita e não conta
 * tempo. Nenhuma dessas transições tem writer, e criá-las agora repetiria o erro
 * que as migrations 030 e 052 documentam. Quando (e se) a reversão for desenhada
 * como produto, ela entra com migration própria e passa pelo UNIQUE de
 * `sale_request_offer_selections` — que existe, entre outras coisas, para
 * obrigar essa conversa a acontecer.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { createUserNotification } from "../notifications/notifications.service.js";
import { NOTIFICATION_EVENT_TYPE } from "../notifications/notifications.constants.js";
import * as selectionRepo from "./sale-requests.selection.repository.js";
import { findCurrentOfferForAdvertiser } from "./sale-requests.offers.repository.js";
import * as roundsRepo from "./sale-requests.rounds.repository.js";
import { SALE_REQUEST_CODE, SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import {
  parseSaleOfferId,
  parseSaleRequestId,
  requireUserId,
} from "./sale-requests.validation.js";

/**
 * Nome comercial de exibição da loja.
 *
 * `advertisers.name` é NOT NULL no schema, mas produção tem linha legada com
 * string vazia (o mesmo motivo que fez `ADVERTISER_IS_OPERATIONAL` tratar `''`
 * como caso à parte). Um nome vazio na tela do proprietário viraria um cartão
 * sem título ao lado de um botão que compromete a decisão dele.
 *
 * O rótulo genérico é honesto: diz que existe uma loja e não inventa nome para
 * ela. NUNCA cai para `advertiser_id` — um número exposto aqui seria justamente
 * o identificador interno que o §3 mantém fora.
 */
function storeNameOf(row) {
  const name = String(row?.store_name ?? "").trim();
  return name === "" ? "Loja parceira" : name;
}

/** "Atibaia - SP", ou `null` quando a loja não tem cidade resolvida. */
function storeCityOf(row) {
  const name = String(row?.store_city_name ?? "").trim();
  if (name === "") return null;
  const state = String(row?.store_city_state ?? "").trim();
  return state === "" ? name : `${name} - ${state}`;
}

/**
 * DTO de UMA proposta na visão do PROPRIETÁRIO — allowlist explícita (§23).
 *
 * Montado campo a campo, NUNCA `...row`. A row que chega do repositório carrega
 * `advertiser_id` (o service precisa dele para agrupar e para notificar) e ele
 * PARA AQUI: um spread o entregaria de graça, junto de qualquer coluna que
 * alguém acrescentasse à query depois.
 *
 * O que sai:
 *   `id`          — a proposta, para que a seleção aponte a OFERTA EXATA (§6).
 *                   É o único identificador da resposta, e não é interno: é o
 *                   valor que o cliente devolve no POST, e o servidor o
 *                   reconfronta com o estado travado antes de aceitar.
 *   `store_name`  — nome comercial;
 *   `store_city`  — cidade/UF;
 *   `amount`      — o valor da proposta atual;
 *   `created_at`  — quando esta proposta foi feita.
 *
 * O que NÃO sai, e por quê:
 *   `advertiser_id`     identificador interno da loja (§3);
 *   `dealer_user_id`    a PESSOA que operou — o proprietário não negocia com
 *                       pessoa nenhuma nesta fase; a query nem o seleciona;
 *   `note`              a observação da proposta é INTERNA e não é canal de
 *                       conversa (migration 055); a query nem a seleciona;
 *   histórico de lances o proprietário vê uma linha por loja, nunca cinco.
 *
 * `is_highest` é DERIVADO da posição, não uma coluna: a lista já vem ordenada
 * por `amount DESC, id DESC`, então a primeira é a maior. Calcular no
 * serializador — em vez de mandar a tela adivinhar — mantém a marcação
 * consistente com a ordenação do servidor, inclusive no desempate. E é só um
 * indicador visual: a maior não tem nenhum privilégio, e qualquer proposta da
 * lista pode ser selecionada.
 */
function serializeProposal(row, { isHighest = false } = {}) {
  return {
    id: row.id,
    store_name: storeNameOf(row),
    store_city: storeCityOf(row),
    amount: row.amount,
    created_at: row.created_at,
    is_highest: isHighest,
  };
}

/**
 * DTO da proposta SELECIONADA. Mesma allowlist, mais o instante da escolha.
 *
 * Não ganha `is_highest`: depois da decisão, dizer se ela era ou não a maior é
 * uma comparação que só serviria para questionar a escolha de quem já escolheu.
 */
function serializeSelected(row) {
  const address = String(row?.store_address ?? "").trim();

  return {
    id: row.id,
    store_name: storeNameOf(row),
    store_city: storeCityOf(row),
    // FASE 4.7 — o endereco comercial, para o handoff. `null` quando a loja nao
    // cadastrou: a tela mostra o resto e nao inventa um endereco vazio.
    store_address: address === "" ? null : address,
    amount: row.amount,
    selected_at: row.selected_offer_at,
  };
}

/**
 * As propostas ATUAIS de uma solicitação, prontas para a tela do dono.
 *
 * Uma por loja (§2), ordenadas por valor (§4). O histórico completo permanece
 * intacto no banco e não aparece aqui — é auditoria, não interface.
 *
 * Escopada ao dono no SQL. Quem chama já provou a posse; a cláusula continua lá
 * porque a autorização não pode depender de quem chama ter lembrado.
 */
export async function listOwnerProposals(saleRequestId, ownerUserId, exec) {
  const rows = await selectionRepo.listCurrentOffersForOwner(saleRequestId, ownerUserId, exec);
  return rows.map((row, index) => serializeProposal(row, { isHighest: index === 0 }));
}

/** A proposta selecionada, ou `null` quando a disputa ainda está aberta. */
export async function getOwnerSelectedOffer(saleRequestId, ownerUserId, exec) {
  const row = await selectionRepo.getSelectedOfferForOwner(saleRequestId, ownerUserId, exec);
  return row ? serializeSelected(row) : null;
}

/**
 * A chave de idempotência da notificação.
 *
 * DETERMINÍSTICA a partir de (solicitação, oferta) — os dois fatos que definem a
 * escolha. Um retry da mesma seleção reproduz a mesma chave e o
 * `ON CONFLICT DO NOTHING` do índice único
 * `(recipient_user_id, idempotency_key)` recusa a segunda linha: a loja recebe
 * UM aviso, não dois.
 *
 * Inclui o `offerId` e não só o `requestId` porque a chave descreve o EVENTO, e
 * não a entidade. Nesta fase a distinção é teórica (só existe uma seleção por
 * solicitação, garantido pelo UNIQUE); ela deixa de ser teórica no dia em que
 * uma fase futura permitir trocar de loja — e aí uma chave por solicitação
 * silenciaria o aviso da segunda escolha, que é a informação mais importante que
 * a nova loja poderia receber.
 */
function selectionIdempotencyKey(saleRequestId, offerId) {
  return `sale-request:${saleRequestId}:offer-selected:${offerId}`;
}

/**
 * Avisa a loja escolhida — DENTRO da transação da seleção (§22).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTA NOTIFICAÇÃO NÃO É BEST-EFFORT
 * ────────────────────────────────────────────────────────────────────────────
 * `notifyBuyerOfOffer` (Produto 1) engole qualquer erro de propósito, e está
 * certo: lá a relação já está commitada, o card aparece de qualquer jeito, e o
 * pior caso é o sino não piscar.
 *
 * Aqui não existe esse "de qualquer jeito". Depois da seleção a oportunidade sai
 * do feed (§20) e a loja escolhida não tem nenhuma tela onde tropeçar na notícia
 * — o aviso É o canal. E o inverso é pior: gravar a notificação fora da
 * transação abriria a janela em que o rollback da seleção deixa para trás um
 * "sua proposta foi selecionada" sobre uma disputa que continua aberta. Uma
 * mentira persistida para um terceiro, sem nada que a corrija depois.
 *
 * Por isso o `exec` viaja: ou as duas escritas existem, ou nenhuma existe. A
 * consequência aceita é que uma falha de notificação DERRUBA a seleção — e essa
 * é a troca certa, porque a seleção pode ser refeita com um clique e o aviso
 * perdido não pode ser recuperado por ninguém.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE O TEXTO NÃO DIZ
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum dado da pessoa física: sem nome, sem telefone, sem e-mail, sem cidade
 * dela, sem "entre em contato". O `payload` carrega o valor e a solicitação — o
 * que a própria loja já sabe, porque foi ela que propôs.
 *
 * E não diz "venda concluída", "negócio fechado" nem "parabéns": a seleção é
 * preliminar, e uma loja que leia "fechado" no sino vai agir como quem comprou.
 */
async function notifySelectedDealer(
  { saleRequestId, offerId, dealerUserId, amount },
  exec
) {
  await createUserNotification(
    {
      recipientUserId: dealerUserId,
      eventType: NOTIFICATION_EVENT_TYPE.SALE_REQUEST_BID_SELECTED,
      title: "Sua proposta foi selecionada",
      body: "Uma proposta enviada por sua loja foi selecionada pelo proprietário.",
      entityType: "sale_request",
      entityId: saleRequestId,
      actionPath: `/dashboard-loja/oportunidades/veiculos/${saleRequestId}`,
      payload: { amount, offer_id: String(offerId) },
      idempotencyKey: selectionIdempotencyKey(saleRequestId, offerId),
    },
    { exec }
  );
}

/**
 * Seleciona uma proposta. A transição terminal desta fase.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * OS ONZE PASSOS, NUMA ÚNICA TRANSAÇÃO — E A ORDEM É A REGRA
 * ────────────────────────────────────────────────────────────────────────────
 *   1. TRAVA a solicitação (`SELECT ... FOR UPDATE`), já escopada ao DONO;
 *   2. não casou → 404 (não existe, ou é de outra pessoa — a mesma resposta);
 *   3. `cancelled`      → 409 `SELECTION_CLOSED`;
 *   4. `offer_selected` → mesma oferta: 200 idempotente; outra: 409;
 *   5. carrega a oferta apontada, PROVANDO que ela é desta solicitação;
 *   6. lê a proposta ATUAL da loja dessa oferta;
 *   7. a oferta apontada ainda é a atual? não → 409 `OFFER_STALE`;
 *   8. grava o EVENTO em `sale_request_offer_selections`;
 *   9. aplica o ESTADO em `sale_requests`;
 *  10. notifica a loja escolhida, no mesmo cliente;
 *  11. commit.
 *
 * NÃO existe "lê, valida, e só então abre a transação". Todo critério desta
 * decisão — posse, estado, existência da oferta, atualidade da oferta — é lido
 * DEPOIS do lock e no MESMO cliente. Um único desses passos fora da transação
 * reintroduz a corrida inteira: entre a leitura e a escrita, a loja aumenta a
 * proposta (§13) ou uma segunda aba seleciona outra loja (§12), e a decisão é
 * tomada sobre um retrato que já não existe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE O PASSO 4 VEM ANTES DO 5
 * ────────────────────────────────────────────────────────────────────────────
 * Um retry de rede sobre uma seleção que já teve sucesso precisa responder
 * sucesso, e responder isso ANTES de qualquer nova validação. Se o passo 5
 * viesse primeiro, o mesmo retry passaria a depender de a oferta continuar sendo
 * a atual — e ela pode não ser, porque nada impede um lance concorrente ter
 * entrado no instante anterior ao commit da seleção. O usuário veria "esta
 * proposta não é mais a atual" para uma ação que, do ponto de vista dele, já deu
 * certo. A posse já foi provada no passo 1, então nada é revelado por este
 * caminho.
 */
export async function selectSaleRequestOffer(userId, rawId, body = {}) {
  const ownerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);
  // Forma do campo ANTES do lock: um `offer_id` malformado é 400 para o próprio
  // dono, e não vale segurar uma linha do banco enquanto se descobre isso.
  const offerId = parseSaleOfferId(body?.offer_id);

  const outcome = await withTransaction(async (exec) => {
    // 1 + 2
    const saleRequest = await selectionRepo.lockSaleRequestForSelection(
      saleRequestId,
      ownerUserId,
      exec
    );

    // Não existe, ou é de outra pessoa. A MESMA resposta para os dois: dizer
    // "pertence a outro usuário" confirmaria a existência da linha para quem
    // estivesse sondando ids.
    if (!saleRequest) {
      return { ok: false, status: 404, message: "Solicitação não encontrada." };
    }

    // 3
    if (saleRequest.status === SALE_REQUEST_STATUS.CANCELLED) {
      return {
        ok: false,
        status: 409,
        message: "Esta solicitação foi cancelada e não recebe mais propostas.",
        code: SALE_REQUEST_CODE.SELECTION_CLOSED,
      };
    }

    // 4 — o retry idempotente e o conflito real, nesta ordem.
    //
    // FASE 4.7 — a igualdade continua sendo com `OFFER_SELECTED` E ISSO É
    // DELIBERADO. Ela agora significa "existe um handoff ATIVO": há uma loja
    // escolhida e as duas partes podem estar conversando neste instante. Trocar
    // de loja por baixo disso seria desfazer um match que já saiu da
    // plataforma — para escolher outra é preciso passar por "não houve acordo".
    //
    // `handoff_failed` NÃO entra aqui: lá a resseleção é o caminho normal, e
    // cair neste ramo devolveria 409 para a ação principal daquela tela.
    if (saleRequest.status === SALE_REQUEST_STATUS.OFFER_SELECTED) {
      if (String(saleRequest.selected_offer_id) === String(offerId)) {
        // A MESMA seleção, de novo. 200 sem escrever nada: nem segunda linha na
        // trilha, nem segundo `updated_at`, nem segunda notificação.
        return { ok: true, changed: false };
      }

      return {
        ok: false,
        status: 409,
        message: "Você já selecionou uma proposta para esta solicitação.",
        code: SALE_REQUEST_CODE.ALREADY_SELECTED,
      };
    }

    // 5 — a oferta apontada É desta solicitação? A prova está no `WHERE`, não
    //     num `if` comparando ids depois de ler.
    // FASE 4.7 — a RODADA ABERTA, lida DEPOIS do lock.
    //
    // Só ofertas dela são selecionáveis. Uma proposta da rodada 1 não pode ser
    // aceita depois que a rodada 2 abriu: ela foi feita sob outro piso, e a loja
    // não a sustenta mais. O `round_id` no `WHERE` da busca é o que torna isso
    // estrutural em vez de uma checagem que alguém pode esquecer.
    const round = await roundsRepo.getCurrentRound(saleRequestId, exec);
    if (!round) {
      return {
        ok: false,
        status: 409,
        message: "Esta solicitação não está recebendo propostas.",
        code: SALE_REQUEST_CODE.SELECTION_CLOSED,
      };
    }

    const offer = await selectionRepo.findOfferForSelection(
      saleRequestId,
      offerId,
      round.id,
      exec
    );
    if (!offer) {
      return {
        ok: false,
        status: 404,
        message: "Proposta não encontrada.",
        code: SALE_REQUEST_CODE.OFFER_NOT_FOUND,
      };
    }

    // 6 + 7 — a barreira do §9.
    //
    // A MESMA função que o resto do domínio usa para responder "qual é a
    // proposta desta loja" (`findCurrentOfferForAdvertiser`), e não uma segunda
    // definição escrita aqui: se as duas divergissem, a tela ofereceria para
    // seleção uma proposta que esta transação recusaria como obsoleta — um botão
    // que nunca funciona.
    const current = await findCurrentOfferForAdvertiser(
      saleRequestId,
      offer.advertiser_id,
      round.id,
      exec
    );

    if (!current || String(current.id) !== String(offerId)) {
      return {
        ok: false,
        status: 409,
        message: "Esta loja já atualizou a proposta. Recarregue para ver o valor atual.",
        code: SALE_REQUEST_CODE.OFFER_STALE,
        // O valor ATUAL viaja junto, pelo mesmo motivo que a recusa de proposta
        // carrega o líder: mandar recarregar sem dizer o que mudou obriga a
        // pessoa a procurar a diferença sozinha.
        currentAmount: current?.amount ?? null,
        currentOfferId: current?.id ?? null,
      };
    }

    // 8 — o EVENTO. `null` significa que o UNIQUE recusou: já existe seleção
    //     nesta solicitação. Chegar aqui com o lock na mão não deveria ser
    //     possível (o passo 4 teria pego), e é exatamente por isso que o ramo
    //     existe — ele transforma "o lock sumiu" em 409 legível em vez de 500 de
    //     constraint.
    const selection = await selectionRepo.insertOfferSelection(
      {
        saleRequestId,
        roundId: round.id,
        offerId,
        advertiserId: offer.advertiser_id,
        selectedByUserId: ownerUserId,
        amountSnapshot: offer.amount,
      },
      exec
    );

    if (!selection) {
      return {
        ok: false,
        status: 409,
        message: "Você já selecionou uma proposta para esta solicitação.",
        code: SALE_REQUEST_CODE.ALREADY_SELECTED,
      };
    }

    // 9 — o ESTADO. `false` tem a mesma leitura do passo 8: a transição válida
    //     deixou de existir entre o lock e agora, o que só é possível se alguém
    //     tiver aberto um caminho de escrita sem lock.
    const changed = await selectionRepo.markOfferSelected(
      { saleRequestId, ownerUserId, offerId },
      exec
    );

    if (!changed) {
      return {
        ok: false,
        status: 409,
        message: "Você já selecionou uma proposta para esta solicitação.",
        code: SALE_REQUEST_CODE.ALREADY_SELECTED,
      };
    }

    // 10 — no MESMO cliente. Uma falha aqui lança e leva a transação inteira
    //      embora: sem seleção e sem notificação, nunca uma sem a outra.
    await notifySelectedDealer(
      {
        saleRequestId,
        offerId,
        dealerUserId: offer.dealer_user_id,
        amount: offer.amount,
      },
      exec
    );

    return { ok: true, changed: true, advertiserId: offer.advertiser_id };
  });

  if (!outcome.ok) {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.offer_selection_rejected",
          result: "error",
          userId: ownerUserId,
          reason: outcome.code || "not_found",
        }),
        saleRequestId,
        offerId,
      },
      "[sale-requests] seleção de proposta recusada"
    );

    throw new AppError(outcome.message, outcome.status, true, {
      ...(outcome.code ? { code: outcome.code } : {}),
      ...(outcome.currentAmount != null ? { current_amount: outcome.currentAmount } : {}),
      ...(outcome.currentOfferId != null
        ? { current_offer_id: String(outcome.currentOfferId) }
        : {}),
    });
  }

  // A leitura para a resposta acontece DEPOIS do commit, de propósito: ela é
  // apresentação, não critério. Dentro da transação ela só somaria trabalho ao
  // lock — que é o recurso mais caro deste caminho e o que serializa a disputa
  // inteira desta solicitação.
  const selected = await getOwnerSelectedOffer(saleRequestId, ownerUserId);

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.offer_selected",
        result: "success",
        userId: ownerUserId,
      }),
      saleRequestId,
      offerId,
      // O VALOR entra no log porque é o fato de negócio desta linha. Nenhum dado
      // pessoal acompanha: não há nome, contato nem documento em lugar nenhum
      // deste caminho, dos dois lados.
      amount: selected?.amount ?? null,
      changed: outcome.changed,
    },
    outcome.changed
      ? "[sale-requests] proposta selecionada"
      : "[sale-requests] seleção repetida (idempotente)"
  );

  return { selected, changed: outcome.changed };
}
