/**
 * Regras da ÁREA DO LOJISTA do Produto 2 — "Veículos para avaliação".
 *
 * ────────────────────────────────────────────────────────────────────────────
 * AS DUAS CAMADAS DE AUTORIZAÇÃO
 * ────────────────────────────────────────────────────────────────────────────
 *   1. `requireDealerAccount()` no router — só conta CNPJ entra na área;
 *   2. a CIDADE, resolvida aqui a partir da loja do usuário — decide O QUE ele
 *      vê.
 *
 * Sem a segunda, qualquer CNPJ enxergaria as solicitações de qualquer cidade. A
 * cidade NUNCA chega pelo cliente: não existe `city_id` na query string, no
 * corpo nem em header. Vem de `resolveDealerStore`, que só olha o advertiser do
 * usuário autenticado.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ZERO CONTATO DIRETO — E POR QUE ISSO É UMA PROPRIEDADE DO DTO
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum campo desta resposta identifica a pessoa que publicou: não há nome,
 * e-mail, telefone, WhatsApp, CPF, documento, endereço nem `owner_user_id`.
 *
 * A garantia não é "a tela não mostra". É que o dado NÃO SAI DO BANCO:
 * `DEALER_COLUMNS` não o seleciona e nenhuma query do módulo faz JOIN com
 * `users`. Um campo escondido no JSON seria vazamento igual — quem fala HTTP lê
 * a resposta inteira, não o React.
 *
 * O portal controla o fluxo: o lojista avalia a ficha e faz proposta pelo
 * próprio sistema. Não existe canal direto nesta fase, e não existe botão que
 * finja existir.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { requireDealerStore } from "./sale-requests.dealer.store.js";
import {
  getOfferStateForAdvertiser,
  listOfferStateForFeed,
} from "./sale-requests.offers.service.js";
import * as offersRepo from "./sale-requests.offers.repository.js";
import { buildCanonicalImageUrlFromStorageKey } from "../ads/ads.public-images.js";
import * as repo from "./sale-requests.dealer.repository.js";
import { parseSaleRequestId, requireUserId } from "./sale-requests.validation.js";
import { SALE_REQUEST_STATUS } from "./sale-requests.constants.js";
import { SALE_OPPORTUNITY_PAGE } from "./sale-requests.dealer.constants.js";
import {
  decodeCursor,
  encodeCursor,
  parseFeedFilters,
  parseLimit,
  parseSort,
} from "./sale-requests.dealer.validation.js";

/** Monta o objeto `city` a partir das colunas do JOIN. */
function cityOf(row) {
  return {
    name: row.city_name,
    state: row.city_state,
    slug: row.city_slug,
  };
}

/**
 * `storage_key` → URL pública, pelo helper CANÔNICO do projeto.
 *
 * `buildCanonicalImageUrlFromStorageKey` resolve o R2 público quando configurado
 * e cai para o proxy `/api/vehicle-images?key=` quando não. Uma segunda regra de
 * URL aqui divergiria da primeira na próxima mudança de storage, e o sintoma
 * seria foto quebrada só nesta área.
 */
function imageUrlOf(storageKey) {
  if (!storageKey) return null;
  return buildCanonicalImageUrlFromStorageKey(storageKey) || null;
}

/**
 * A ficha estruturada, campo a campo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * NULL NÃO VIRA NADA
 * ────────────────────────────────────────────────────────────────────────────
 * Nenhum `?? "unknown"`, nenhum `?? "no"`, nenhum `?? false`. Uma solicitação
 * publicada antes da migration 054 tem NULL em todas estas colunas, e NULL
 * significa "a versão anterior do formulário NÃO PERGUNTOU" — que é diferente de
 * `'unknown'` ("a pessoa foi perguntada e respondeu que não sabe") e MUITO
 * diferente de `'no'`.
 *
 * Traduzir NULL aqui inventaria uma declaração que o proprietário jamais fez, e
 * o lojista leria como afirmação dele — em cima da qual faria uma proposta. A
 * tela mostra "Não informado"; a decisão de como isso APARECE é dela, não desta
 * camada.
 */
function evaluationOf(row) {
  return {
    tire_condition: row.tire_condition,

    financing_status: row.financing_status,
    financing_balance: row.financing_balance,
    fines_status: row.fines_status,
    fines_amount: row.fines_amount,
    ipva_status: row.ipva_status,
    ipva_amount_due: row.ipva_amount_due,
    licensing_status: row.licensing_status,

    caution_report_status: row.caution_report_status,
    auction_history: row.auction_history,
    collision_history: row.collision_history,

    engine_condition: row.engine_condition,
    engine_notes: row.engine_notes,
    gearbox_condition: row.gearbox_condition,
    gearbox_notes: row.gearbox_notes,
    suspension_condition: row.suspension_condition,
    suspension_notes: row.suspension_notes,

    body_paint_status: row.body_paint_status,
    // JSONB chega desserializado pelo driver. O guarda de tipo mantém a
    // distinção que importa: array (inclusive vazio) = respondido; `null` =
    // linha legada. Um `|| []` colapsaria as duas.
    body_paint_issues: Array.isArray(row.body_paint_issues) ? row.body_paint_issues : null,
    body_paint_notes: row.body_paint_notes,
  };
}

/**
 * DTO do CARD — montado campo a campo, NUNCA `...row`.
 *
 * Um spread devolveria de graça qualquer coluna nova que alguém adicionasse à
 * consulta depois. A lista abaixo é o contrato: para um campo chegar ao lojista,
 * alguém precisa escrevê-lo aqui.
 *
 * O card carrega a ficha inteira porque os BADGES do card (pneus, laudo, leilão,
 * financiamento) saem dela — e uma segunda ida ao servidor por card para montar
 * quatro etiquetas seria N+1 no lugar mais visitado da tela.
 */
function serializeSummary(row, { image = null } = {}) {
  return {
    id: row.id,

    brand: row.brand,
    brand_slug: row.brand_slug,
    model: row.model,
    model_slug: row.model_slug,
    fipe_model_description: row.fipe_model_description,

    year: row.year,
    mileage: row.mileage,
    transmission: row.transmission,
    fuel_type: row.fuel_type,
    declared_condition: row.declared_condition,

    evaluation: evaluationOf(row),

    // ────────────────────────────────────────────────────────────────────────
    // O PISO DO PROPRIETÁRIO (4.3.3) — o único valor que o CARD mostra
    // ────────────────────────────────────────────────────────────────────────
    // É um número declarado pela pessoa, não uma derivação: nunca vem da FIPE,
    // nunca da maior proposta, nunca de um cálculo. Vale `null` quando a
    // solicitação é anterior à regra — e `null` NÃO é zero: a tela precisa
    // distinguir "sem piso declarado" de "aceita qualquer coisa".
    minimum_accepted_price: row.minimum_accepted_price,

    // Referência de MERCADO, com a data do snapshot. Nunca "valor do veículo" e
    // nunca preço pedido — a solicitação não tem preço pedido, e a disputa
    // existe para descobri-lo. Segue no contrato porque o DETALHE a usa; o card
    // deixou de renderizá-la na 4.3.3.
    fipe_reference_value: row.fipe_reference_value,
    fipe_reference_at: row.fipe_reference_at,

    image,
    city: cityOf(row),
    status: row.status,
    created_at: row.created_at,
  };
}

/**
 * DTO do DETALHE — o mesmo objeto do feed, mais a galeria e as observações.
 *
 * Reusa `serializeSummary` de propósito: se o detalhe montasse a própria lista
 * de campos, uma correção de privacidade aplicada a um dos dois deixaria o outro
 * para trás. O detalhe ACRESCENTA, nunca redeclara.
 */
function serializeDetail(row, { images = [] } = {}) {
  return {
    ...serializeSummary(row, { image: images[0] ?? null }),
    images,
    known_issues: row.known_issues,
  };
}

/**
 * O bloco de SELEÇÃO na visão do lojista (Fase 4.4, §24).
 *
 * Chegar aqui com `status = 'offer_selected'` já significa, por construção da
 * query, que ESTA loja é a escolhida: a linha não casa o `WHERE` para nenhuma
 * outra (§20). O DTO não precisa — e não deve — carregar um "quem ganhou",
 * porque a única resposta possível é "você".
 *
 * `selected_amount` é o valor da PRÓPRIA proposta desta loja. Não é vazamento de
 * concorrente: é o número que ela mesma ofereceu, devolvido para que a tela não
 * precise ir buscá-lo.
 *
 * O que este bloco NÃO carrega, e não pode passar a carregar: nome, telefone,
 * e-mail, WhatsApp, endereço ou documento do proprietário. A garantia continua
 * sendo estrutural — `DEALER_COLUMNS` não os seleciona e nenhuma query deste
 * módulo faz JOIN com `users` —, e a seleção não afrouxa nada: quem foi
 * escolhido ganha o direito de saber que foi escolhido, não o contato de quem
 * escolheu. O contato não existe nesta fase para ninguém.
 */
function serializeSelection(row) {
  const isSelected = row.status === SALE_REQUEST_STATUS.OFFER_SELECTED;

  return {
    is_selected: isSelected,
    selected_amount: isSelected ? (row.selected_offer_amount ?? null) : null,
    selected_at: isSelected ? (row.selected_offer_at ?? null) : null,
  };
}


/**
 * Feed de veículos disponíveis para avaliação na cidade da loja.
 *
 * Devolve `items`, `next_cursor` e um `summary` com métricas REAIS — contadas
 * pela mesma fonte da listagem, com os mesmos filtros. Não há métrica
 * decorativa: nenhuma "margem potencial", nenhum "nível de interesse", nenhum
 * "nv. oportunidade". Todas três dependeriam de um preço de compra que este
 * produto ainda não tem, e um número inventado no topo da tela é justamente o
 * que faz alguém decidir errado com confiança.
 */
export async function listDealerSaleOpportunities(userId, rawQuery = {}, { now = new Date() } = {}) {
  const dealerUserId = requireUserId(userId);

  // A validação vem ANTES da resolução da loja de propósito: um filtro inválido
  // é 400 para qualquer lojista, e não um 403 que dependeria de quem perguntou.
  const sort = parseSort(rawQuery.sort);
  const filters = parseFeedFilters(rawQuery, { now });
  const limit = parseLimit(rawQuery.limit);
  const cursor = decodeCursor(rawQuery.cursor, sort);

  // `advertiser_id` é a PREFERÊNCIA do lojista, não uma autorização: o valor é
  // confrontado com as lojas que o servidor montou a partir de `req.user.id`.
  const { advertiserId, cityId } = await requireDealerStore(dealerUserId, {
    advertiserId: rawQuery.advertiser_id,
  });

  const [{ rows, hasMore }, counts, offerCounts] = await Promise.all([
    repo.listOpenByCity({ cityId, filters, sort, limit, cursor }),
    repo.countOpenByCity({ cityId, filters }),
    offersRepo.countCityOffersForAdvertiser({ cityId, advertiserId }),
  ]);

  // As duas leituras por lote da página. Em paralelo porque são independentes;
  // em LOTE porque a alternativa é uma ida ao banco por card — o N+1 clássico,
  // no lugar mais visitado da área.
  const ids = rows.map((row) => row.id);
  const [covers, offerState] = await Promise.all([
    repo.listCoverImagesByRequestIds(ids),
    listOfferStateForFeed(ids, advertiserId),
  ]);

  logger.info(
    {
      ...buildDomainFields({
        action: "sale_request.dealer_list",
        result: "success",
        userId: dealerUserId,
      }),
      cityId,
      sort,
      returned: rows.length,
      total: counts.total,
      // Só os NOMES dos filtros usados. Os valores ficam de fora: eles descrevem
      // o interesse comercial de um lojista identificável, e o log não é lugar
      // para isso.
      filters: Object.keys(filters).filter((key) => filters[key] != null),
    },
    "[sale-requests] feed de oportunidades listado para lojista"
  );

  return {
    items: rows.map((row) => ({
      ...serializeSummary(row, { image: imageUrlOf(covers.get(String(row.id))) }),
      // Estado de disputa por card: o VALOR líder e a proposta desta loja.
      // Nunca quem é o líder. `serializeOfferState` já devolve o formato
      // completo mesmo para solicitação sem proposta nenhuma — assim o card não
      // precisa distinguir "sem disputa" de "campo ausente".
      ...(offerState.get(String(row.id)) ?? {
        current_highest_offer: null,
        my_offer: null,
        is_leading: false,
        offers_count: 0,
      }),
    })),
    next_cursor: hasMore ? encodeCursor(rows[rows.length - 1], sort) : null,
    limit,
    sort,
    summary: {
      total: counts.total,
      new_today: counts.newToday,
      // As duas métricas de proposta do §12. `with_my_offer + without_my_offer`
      // fecha com o total da cidade SEM filtros — as duas saem da mesma query,
      // sobre a mesma partição, justamente para que o par nunca discorde.
      //
      // Elas descrevem a cidade inteira, e não a página filtrada: "quantas ainda
      // não recebi proposta" é uma pergunta sobre o trabalho pendente do
      // lojista, não sobre o recorte que ele está olhando agora.
      with_my_offer: offerCounts.withMine,
      without_my_offer: offerCounts.withoutMine,
    },
  };
}

/**
 * UMA oportunidade, com a ficha completa e a galeria.
 *
 * Sempre 404 quando não casa — nunca "esta oportunidade é de outra cidade",
 * nunca "esta solicitação foi cancelada" e nunca "outra loja foi escolhida".
 * Distinguir os motivos confirmaria a existência da solicitação para quem
 * estivesse sondando ids de fora da cidade, e a existência já é informação: diz
 * que alguém naquela cidade está vendendo um carro.
 *
 * O 404 é o MESMO para a loja que perdeu a disputa (§20). A tentação de dar a
 * ela um 403 com "outra loja foi selecionada" é grande e está errada: seria
 * contar o desfecho de um negócio alheio a alguém que já não participa dele — e
 * a mesma resposta viraria um oráculo para qualquer CNPJ da cidade sondar ids e
 * descobrir quais solicitações foram fechadas.
 */
export async function getDealerSaleOpportunity(userId, rawId, rawQuery = {}) {
  const dealerUserId = requireUserId(userId);
  const saleRequestId = parseSaleRequestId(rawId);

  const { advertiserId, cityId } = await requireDealerStore(dealerUserId, {
    advertiserId: rawQuery.advertiser_id,
  });

  // A loja entra na PRÓPRIA query de visibilidade: é ela que decide se uma
  // solicitação já decidida ainda pode ser aberta, e por quem.
  const row = await repo.getVisibleByIdForCity(saleRequestId, cityId, advertiserId);
  if (!row) {
    logger.info(
      {
        ...buildDomainFields({
          action: "sale_request.dealer_detail",
          result: "error",
          userId: dealerUserId,
          reason: "not_found",
        }),
        cityId,
        saleRequestId,
      },
      "[sale-requests] detalhe de oportunidade não encontrado"
    );
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  const [images, offerState] = await Promise.all([
    repo.listImagesByRequestId(saleRequestId),
    getOfferStateForAdvertiser(saleRequestId, advertiserId),
  ]);

  return {
    sale_opportunity: {
      ...serializeDetail(row, {
        images: images.map((image) => imageUrlOf(image.storage_key)).filter(Boolean),
      }),
      // O bloco de disputa: valor líder, proposta desta loja, se ela lidera e
      // quantas propostas existem. Nenhum identificador de concorrente — a
      // query que lê o líder nem seleciona `advertiser_id`.
      ...offerState,
      // O bloco de seleção (4.4). `is_selected: false` enquanto a disputa está
      // aberta — presente em todo detalhe, e não só quando verdadeiro, para que
      // a tela não precise distinguir "não selecionada" de "campo ausente". É a
      // mesma escolha que `serializeOfferState` faz com a solicitação sem
      // proposta nenhuma.
      ...serializeSelection(row),
    },
  };
}

export { SALE_OPPORTUNITY_PAGE, requireDealerStore, serializeDetail, serializeSummary };
