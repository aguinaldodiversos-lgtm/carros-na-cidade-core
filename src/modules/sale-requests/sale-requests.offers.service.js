/**
 * Propostas preliminares do lojista — a disputa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A REGRA DE PRODUTO, EM UMA FRASE
 * ────────────────────────────────────────────────────────────────────────────
 * O MAIOR VALOR ATUAL é visível a todo lojista elegível; a IDENTIDADE de quem o
 * ofereceu não é visível a ninguém.
 *
 * Isso não é meia-privacidade: são duas informações diferentes. O valor líder é
 * o que torna a disputa possível — sem ele o lojista propõe no escuro e o
 * vendedor perde dinheiro. O nome do concorrente não acrescenta nada ao negócio
 * e transformaria o feed numa lista de quem-está-comprando-o-quê na cidade.
 *
 * Por isso a resposta NUNCA carrega `advertiser_id`, `dealer_user_id` nem nome
 * de loja rival — e a query que lê o líder (`findHighestAmount`) nem seleciona
 * essas colunas. Não há campo escondido para esconder.
 *
 * NÃO existe o rótulo "Confidencial" em lugar nenhum: ele diria que o VALOR é
 * segredo, que é o oposto da regra.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * SEM PRAZO
 * ────────────────────────────────────────────────────────────────────────────
 * Não há `expires_at`, cronômetro, encerramento automático nem extensão. A
 * solicitação recebe propostas até o proprietário cancelá-la — e, nas fases
 * seguintes, até ele selecionar uma. Um relógio aqui criaria um estado
 * (`expired`) sem ninguém para escrevê-lo, que é o erro que as migrations 030 e
 * 052 documentam.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import * as offersRepo from "./sale-requests.offers.repository.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import { SALE_OPPORTUNITY_CODE } from "./sale-requests.dealer.constants.js";
import { parseSaleRequestId, requireUserId } from "./sale-requests.validation.js";
import { toCents, validateOfferInput } from "./sale-requests.dealer.validation.js";
import { requireDealerStore } from "./sale-requests.dealer.store.js";

/**
 * O bloco de disputa que acompanha uma oportunidade.
 *
 * Montado campo a campo. `highest_offer` é um NÚMERO e nada mais — nenhuma
 * companhia, nenhum "líder: Loja X", nenhuma contagem de lojas identificadas.
 *
 * `offers_count` é o total de propostas recebidas. Ele não revela concorrente:
 * saber que existem quatro propostas não diz de quem são. Aparece porque é uma
 * medida real de interesse — e é a alternativa honesta ao "nível de interesse:
 * Alto" que não tem fonte.
 */
function serializeOfferState({ highest = null, mine = null, total = 0 } = {}) {
  return {
    current_highest_offer: highest,
    my_offer: mine,
    // Comparação em CENTAVOS INTEIROS. `Number("50000.00") > Number("50000.00")`
    // é falso por sorte, não por garantia — e a liderança é exatamente o tipo de
    // decisão que não pode depender de sorte de arredondamento.
    is_leading: highest != null && mine != null && toCents(mine) === toCents(highest),
    offers_count: total,
  };
}

/**
 * Envia uma proposta.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A TRANSAÇÃO É A REGRA — NÃO UMA OTIMIZAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 * Os cinco passos abaixo acontecem numa ÚNICA transação, e a ordem importa:
 *
 *   1. TRAVA a solicitação (`SELECT ... FOR UPDATE`), já escopada à cidade, e lê
 *      na mesma query o PISO declarado pelo proprietário;
 *   2. confere que ela ainda está `receiving_offers`;
 *   3. lê a maior proposta atual — leitura que só é confiável DEPOIS do lock;
 *   4. valida: sem proposta ainda → `amount >= piso`; com proposta →
 *      `amount > maior atual`;
 *   5. insere.
 *
 * Sem o lock, duas lojas propondo no mesmo instante leem as duas o mesmo "maior
 * atual" obsoleto:
 *
 *     líder atual: 50.000
 *     A lê 50.000 → 51.000 passa
 *     B lê 50.000 → 50.500 passa      ← B nunca enxergou os 51.000 de A
 *
 * As duas propostas ficam gravadas e a regra "precisa superar a maior atual"
 * fica violada no banco, sem erro em lugar nenhum. É uma condição de corrida
 * silenciosa: o log fica limpo, e o defeito só aparece quando alguém compara os
 * números.
 *
 * O `FOR UPDATE` faz B esperar A terminar; quando B roda o passo 3, lê 51.000 e
 * é recusada com a mensagem certa. Duas solicitações diferentes não se bloqueiam
 * — o lock é por linha.
 *
 * Isto tem teste de concorrência REAL contra PostgreSQL
 * (tests/integration/sale-request-offers-concurrency.integration.test.js),
 * incluindo teste POR MUTAÇÃO: removido o lock, o teste precisa falhar.
 */
export async function createSaleOffer(userId, rawId, body = {}, context = {}) {
  const dealerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  // A validação de forma vem ANTES da loja e antes de qualquer lock: um valor
  // malformado é 400 para todo mundo, e não vale segurar uma linha do banco
  // enquanto se descobre isso.
  const { amount, amountCents, note } = validateOfferInput(body);

  // A loja é resolvida a partir da sessão; `context.advertiserId` é só a
  // PREFERÊNCIA de qual loja do próprio usuário está comprando, e ela é
  // confrontada com o conjunto que o servidor montou.
  const store = await requireDealerStore(dealerUserId, {
    advertiserId: context.advertiserId,
  });
  const { advertiserId, cityId } = store;

  const result = await withTransaction(async (exec) => {
    const saleRequest = await offersRepo.lockSaleRequestForOffer(saleRequestId, cityId, exec);

    // Não existe / não é da cidade da loja → 404, sempre o mesmo 404. Dizer
    // "esta oportunidade é de outra cidade" confirmaria a existência dela para
    // quem estivesse sondando ids de fora.
    if (!saleRequest) {
      return { ok: false, status: 404, message: "Oportunidade não encontrada." };
    }

    // Existe e é da cidade, mas a disputa ACABOU — cancelada pelo proprietário
    // ou encerrada por uma seleção (Fase 4.4, §15). Aqui o motivo pode (e deve)
    // ser dito: o lojista tem acesso legítimo a esta solicitação, provavelmente
    // tem a tela aberta desde antes, e precisa saber por que a proposta dele não
    // entrou.
    //
    // A condição é `!== RECEIVING_OFFERS`, e não uma lista dos estados que
    // fecham. É a mesma disciplina de igualdade do feed, com o sinal invertido
    // porque aqui a lista curta é a dos estados que ABREM: só um estado aceita
    // proposta, e todo estado novo que uma fase futura criar já nasce recusando
    // — em vez de aceitar até alguém lembrar de acrescentá-lo aqui.
    //
    // Um mesmo 409 para os dois casos, de propósito: distinguir "cancelada" de
    // "outra loja foi escolhida" contaria a um concorrente o desfecho de um
    // negócio alheio. E a loja SELECIONADA também esbarra aqui — ela não pode
    // aumentar a própria proposta pela rota de disputa (§15), porque não há mais
    // disputa.
    if (saleRequest.status !== SALE_REQUEST_STATUS.RECEIVING_OFFERS) {
      return {
        ok: false,
        status: 409,
        message: "Esta solicitação não está mais recebendo propostas.",
        code: SALE_OPPORTUNITY_CODE.OFFER_CLOSED,
      };
    }

    const highest = await offersRepo.findHighestAmount(saleRequestId, exec);
    const highestCents = toCents(highest);

    // ────────────────────────────────────────────────────────────────────────
    // DUAS BARREIRAS, NESTA ORDEM (Fase 4.3.3)
    // ────────────────────────────────────────────────────────────────────────
    // Enquanto NÃO há proposta, a barreira é o PISO do proprietário: a primeira
    // oferta precisa ALCANÇÁ-LO (`>=`), não superá-lo. O piso é o valor que a
    // pessoa disse que aceita — exigir um centavo a mais recusaria exatamente a
    // proposta que ela pediu.
    //
    // Assim que existe proposta, a barreira passa a ser a MAIOR ATUAL, e aí o
    // operador é `>`: empatar não desempata nada, e duas lojas com o mesmo valor
    // deixariam a disputa sem líder definido.
    //
    // A ordem entre as duas não é escolha de estilo. O piso só governa a
    // ABERTURA; depois dela, a maior proposta já é necessariamente >= piso (foi
    // validada quando entrou), então revalidar o piso seria uma condição que
    // nunca reprova. Um `amount >= minimum && amount > highest` funcionaria
    // igual, mas diria ao leitor que existem dois filtros vivos quando existe um
    // só em cada estado.
    //
    // LEGADO: `minimum_accepted_price` é `null` nas solicitações anteriores à
    // regra. Elas mantêm o comportamento histórico — a primeira proposta só
    // precisa ser positiva, o que `validateOfferInput` já garantiu. Inventar um
    // piso para elas (85% da FIPE, a maior proposta, qualquer coisa) faria o
    // sistema recusar propostas em nome de alguém que nunca declarou piso algum.
    const minimumCents = toCents(saleRequest.minimum_accepted_price);

    if (highestCents == null && minimumCents != null && amountCents < minimumCents) {
      return {
        ok: false,
        status: 409,
        message: "A sua proposta precisa alcançar o valor mínimo do proprietário.",
        code: SALE_OPPORTUNITY_CODE.OFFER_BELOW_MINIMUM,
        // O piso viaja junto pelo mesmo motivo do líder: mandar corrigir sem
        // dizer o alvo obriga a recarregar a página para descobrir quanto falta.
        minimumAcceptedPrice: saleRequest.minimum_accepted_price,
      };
    }

    // `null` é "ainda não há proposta" — e não zero. A primeira proposta da
    // solicitação não precisa superar nada; só precisa ser positiva e alcançar o
    // piso, quando ele existe.
    if (highestCents != null && amountCents <= highestCents) {
      return {
        ok: false,
        status: 409,
        message: "A sua proposta precisa ser maior que a maior proposta atual.",
        code: SALE_OPPORTUNITY_CODE.OFFER_NOT_LEADING,
        // O valor líder ATUALIZADO viaja junto: a tela do lojista pode estar
        // exibindo um número já vencido, e mandá-lo corrigir sem dizer o novo
        // valor o obrigaria a recarregar para descobrir quanto falta.
        currentHighest: highest,
      };
    }

    const offer = await offersRepo.insertOffer(
      { saleRequestId, dealerUserId, advertiserId, amount, note },
      exec
    );

    const total = await offersRepo.countOffers(saleRequestId, exec);

    return { ok: true, offer, total };
  });

  if (!result.ok) {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.offer_rejected",
          result: "error",
          userId: dealerUserId,
          reason: result.code || "not_found",
        }),
        saleRequestId,
        advertiserId,
        cityId,
      },
      "[sale-requests] proposta recusada"
    );

    throw new AppError(result.message, result.status, true, {
      ...(result.code ? { code: result.code } : {}),
      ...(result.currentHighest != null
        ? { current_highest_offer: result.currentHighest }
        : {}),
      ...(result.minimumAcceptedPrice != null
        ? { minimum_accepted_price: result.minimumAcceptedPrice }
        : {}),
    });
  }

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.offer_created",
        result: "success",
        userId: dealerUserId,
      }),
      saleRequestId,
      advertiserId,
      cityId,
      offerId: result.offer?.id,
      // O VALOR entra no log de propósito: é o fato de negócio desta linha, e
      // sem ele o registro não descreve o que aconteceu. Nenhum dado da pessoa
      // física acompanha — não há nome, contato nem documento em lugar nenhum
      // deste caminho.
      amount: result.offer?.amount,
    },
    "[sale-requests] proposta registrada"
  );

  return {
    offer: {
      id: result.offer.id,
      amount: result.offer.amount,
      note: result.offer.note,
      created_at: result.offer.created_at,
    },
    // Quem acabou de inserir com a regra "precisa superar" É o líder — mas o
    // valor devolvido vem da própria linha inserida, não de uma segunda leitura
    // fora da transação, que poderia já refletir um lance posterior.
    ...serializeOfferState({
      highest: result.offer.amount,
      mine: result.offer.amount,
      total: result.total,
    }),
  };
}

/**
 * Estado de disputa de UMA solicitação, para o detalhe.
 *
 * Fora de transação de propósito: é leitura de tela. Um valor um instante
 * atrasado aqui não causa dano — quem decide quem lidera é a transação do POST,
 * e ela relê com o lock na mão.
 */
export async function getOfferStateForAdvertiser(saleRequestId, advertiserId) {
  const [highest, mine, total] = await Promise.all([
    offersRepo.findHighestAmount(saleRequestId),
    offersRepo.findCurrentOfferForAdvertiser(saleRequestId, advertiserId),
    offersRepo.countOffers(saleRequestId),
  ]);

  return serializeOfferState({
    highest,
    mine: mine?.amount ?? null,
    total,
  });
}

/**
 * Estado de disputa de VÁRIAS solicitações — uma query para a página inteira.
 *
 * @returns {Promise<Map<string, ReturnType<typeof serializeOfferState>>>}
 */
export async function listOfferStateForFeed(saleRequestIds, advertiserId) {
  const raw = await offersRepo.listOfferStateByRequestIds(saleRequestIds, advertiserId);

  const map = new Map();
  for (const [key, value] of raw.entries()) {
    map.set(key, serializeOfferState(value));
  }
  return map;
}

export { serializeOfferState };
