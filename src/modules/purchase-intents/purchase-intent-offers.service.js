// Envio de veículos do estoque ao comprador (Fase 3).
//
// Três superfícies, com autorizações diferentes:
//
//   1. LOJISTA — lista o PRÓPRIO estoque compatível com uma procura da cidade
//      dele, e envia um anúncio para ela.
//   2. COMPRADOR — lista os veículos recebidos nas PRÓPRIAS procuras.
//   3. NOTIFICAÇÃO — avisa o comprador, depois do COMMIT, best-effort.
//
// ────────────────────────────────────────────────────────────────────────────
// O QUE ESTE MÓDULO NÃO FAZ
// ────────────────────────────────────────────────────────────────────────────
// Não abre WhatsApp, não agenda visita, não cria conversa, não recebe mensagem
// livre do lojista, não pontua, não recomenda substituto e não toca em nada de
// `ads` além de LER. Enviar um veículo cria uma linha de relação e mais nada:
// o anúncio não muda de status, não ganha destaque, não conta lead e não muda
// de posição em lugar nenhum.
//
// ────────────────────────────────────────────────────────────────────────────
// PRIVACIDADE — A FRONTEIRA QUE NÃO SE ATRAVESSA
// ────────────────────────────────────────────────────────────────────────────
// O service PRECISA do `buyer_user_id` para endereçar a notificação. Ele o lê
// da procura travada e o usa numa única linha (`recipientUserId`). Nenhum DTO
// devolvido ao lojista o contém — nem ele, nem nome, e-mail, telefone, WhatsApp
// ou documento do comprador. Os serializadores são montados campo a campo, sem
// `...row`, exatamente pelo mesmo motivo da Fase 2: um spread devolveria de
// graça qualquer coluna nova que alguém adicionasse à consulta depois.

import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";
import { withTransaction } from "../../infrastructure/database/db.js";
import { canonicalBrandLabel } from "../../shared/utils/slugify.js";
import { commercialModelLabel } from "../../shared/vehicle/commercial-model.js";
import {
  buildNormalizedPublicImages,
  listVehicleImagesByAdIds,
} from "../ads/ads.public-images.js";
import { createUserNotification } from "../notifications/notifications.service.js";
import { NOTIFICATION_EVENT_TYPE } from "../notifications/notifications.constants.js";
import { AD_STATUS } from "../../shared/constants/status.js";
import * as offersRepo from "./purchase-intent-offers.repository.js";
import { getByIdForBuyer } from "./purchase-intents.repository.js";
import {
  BUDGET_RELATION,
  PURCHASE_INTENT_OFFER_CODE,
  PURCHASE_INTENT_OFFER_MAX_PER_DEALER,
  PURCHASE_INTENT_OFFER_SCAN_LIMIT,
} from "./purchase-intent-offers.constants.js";
import {
  budgetRelationOf,
  compareMatchingAds,
  evaluateAdForIntent,
} from "./purchase-intent-offers.matching.js";
import { requireUserId, resolveDealerCityId } from "./purchase-intents.service.js";
import { parsePurchaseIntentId } from "./purchase-intents.validation.js";

/**
 * `ad_id` do corpo → inteiro positivo.
 *
 * A string INTEIRA precisa ser dígitos: `Number.parseInt` sozinho leria o
 * prefixo de "12abc" e o servidor agiria sobre o anúncio 12. 400 (e não 404)
 * porque aqui o problema é a FORMA do campo enviado, não a existência de um
 * recurso — e recusar formato não revela nada sobre que anúncios existem.
 */
export function parseAdId(raw) {
  const asText = String(raw ?? "").trim();
  if (!/^\d+$/.test(asText)) {
    throw new AppError("Selecione um veículo do seu estoque.", 400, true, {
      code: PURCHASE_INTENT_OFFER_CODE.INVALID_AD,
      field: "ad_id",
    });
  }

  const adId = Number.parseInt(asText, 10);
  if (!Number.isSafeInteger(adId) || adId <= 0) {
    throw new AppError("Selecione um veículo do seu estoque.", 400, true, {
      code: PURCHASE_INTENT_OFFER_CODE.INVALID_AD,
      field: "ad_id",
    });
  }
  return adId;
}

/**
 * Nome comercial do veículo, derivado do anúncio.
 *
 * Usa os MESMOS helpers canônicos da procura (`canonicalBrandLabel` +
 * `commercialModelLabel`), então "VW - VolksWagen" + "T-Cross 200 TSI 1.0 Flex
 * 12V 5p Aut." vira "Volkswagen T-Cross" dos dois lados. Uma segunda regra de
 * exibição aqui faria o card do comprador dizer um nome e a procura dele outro.
 *
 * Cai para `ads.title` quando a derivação não é segura — o título é o que o
 * próprio lojista escreveu, então nunca é uma invenção do sistema.
 */
function vehicleNameOf(ad) {
  const brand = canonicalBrandLabel(ad?.brand);
  const model = commercialModelLabel(ad?.model, { brand: ad?.brand });
  const derived = [brand, model].filter(Boolean).join(" ").trim();
  if (derived) return derived;

  const title = String(ad?.title ?? "").trim();
  return title || "Veículo";
}

/**
 * Imagem principal, EM LOTE.
 *
 * Reaproveita a estratégia canônica de `ads.public-images.js` (storage_key → R2
 * → proxy → legado), a mesma do catálogo público. Não existe parser novo aqui:
 * um segundo jeito de resolver imagem divergiria do primeiro na próxima
 * mudança de storage, e o sintoma seria foto quebrada só na área privada.
 *
 * Uma única consulta para TODOS os anúncios da página — é o que impede o N+1 do
 * §46. A URL não é copiada para `purchase_intent_offers`: trocar a foto do
 * anúncio precisa aparecer no card do comprador.
 *
 * @returns {Promise<Map<string, string|null>>} adId (string) → URL da capa
 */
async function resolveMainImages(adRows) {
  const map = new Map();
  if (!Array.isArray(adRows) || adRows.length === 0) return map;

  let imagesByAdId = new Map();
  try {
    imagesByAdId = await listVehicleImagesByAdIds(adRows.map((row) => row.id));
  } catch (error) {
    // Foto é acessório do card; a lista de veículos não pode sumir porque a
    // tabela de imagens ficou indisponível. Segue com o fallback de
    // `ads.images`, que é o caminho normal em produção hoje.
    logger.warn(
      {
        ...buildDomainFields({
          action: "purchase_intent_offer.images",
          result: "error",
          reason: "vehicle_images_failed",
        }),
        err: error?.message || String(error),
      },
      "[purchase-intent-offers] falha ao ler vehicle_images — usando ads.images"
    );
  }

  for (const row of adRows) {
    const normalized = buildNormalizedPublicImages(row, imagesByAdId.get(Number(row.id)) || []);
    map.set(String(row.id), normalized[0] || null);
  }

  return map;
}

/**
 * Card do estoque, para o LOJISTA.
 *
 * Allowlist: só o que a tela precisa para o lojista reconhecer o próprio carro
 * e decidir. Nada da procura além da relação de orçamento, e nada do comprador.
 */
function serializeMatchingAd(ad, { budgetRelation, alreadySent, mainImage }) {
  return {
    ad_id: ad.id,
    slug: ad.slug,
    title: ad.title,
    vehicle_name: vehicleNameOf(ad),
    brand: ad.brand,
    year: ad.year,
    mileage: ad.mileage,
    transmission: ad.transmission,
    price: ad.price,
    main_image: mainImage,
    budget_relation: budgetRelation,
    already_sent: alreadySent,
  };
}

/**
 * Card do veículo recebido, para o COMPRADOR.
 *
 * `vehicle` carrega o estado ATUAL do anúncio (preço, foto, km, status), lido
 * no momento da consulta. Não é snapshot da época do envio — ver o comentário
 * da migration.
 *
 * `dealer` traz só o nome público da loja. O comprador precisa saber de quem
 * veio o carro (é o que torna a próxima fase possível), e nada além disso é
 * necessário para esta tela: sem telefone, sem WhatsApp, sem e-mail, sem CNPJ.
 *
 * `dealer_user_id` não aparece: o comprador não tem o que fazer com o id da
 * conta do lojista, e DTO mínimo é o que impede o vazamento de amanhã.
 */
function serializeReceivedOffer(row, { maxPrice, mainImage }) {
  const available = row.available === true;

  return {
    offer_id: row.offer_id,
    sent_at: row.sent_at,
    budget_relation: budgetRelationOf(row.price, maxPrice),
    vehicle: {
      id: row.id,
      // `slug` continua no payload mesmo indisponível: é o que o card usa para
      // montar o link, e a decisão de MOSTRAR o link é de `available`.
      slug: row.slug,
      title: row.title,
      vehicle_name: vehicleNameOf(row),
      brand: row.brand,
      year: row.year,
      mileage: row.mileage,
      transmission: row.transmission,
      price: row.price,
      main_image: mainImage,
      city: row.city_name ? { name: row.city_name, state: row.city_state } : null,
      available,
    },
    dealer: {
      name: row.dealer_name || null,
    },
  };
}

/**
 * Estoque compatível do lojista com uma procura.
 *
 * Ordem das guardas, todas no servidor:
 *   1. cidade da loja (`resolveDealerCityId`) — nunca vem do navegador;
 *   2. a procura precisa ser DAQUELA cidade, ativa e não vencida;
 *   3. o estoque lido é só o do próprio lojista, só ACTIVE, só com loja
 *      operacional;
 *   4. o casamento é o mesmo de `evaluateAdForIntent` que o POST usa.
 *
 * O passo 4 é a razão de esta lista existir: ela evita o envio irrelevante, mas
 * NÃO é autorização. Quem autoriza é o POST, que repete a avaliação.
 */
export async function listMatchingAdsForDealer(userId, rawIntentId) {
  const dealerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawIntentId);

  const cityId = await resolveDealerCityId(dealerUserId);
  if (cityId == null) {
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  const intent = await offersRepo.getMatchingContextForCity(purchaseIntentId, cityId);
  if (!intent) {
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  const [{ rows: stock, truncated }, sentAdIds] = await Promise.all([
    offersRepo.listActiveAdsByDealer({
      dealerUserId,
      limit: PURCHASE_INTENT_OFFER_SCAN_LIMIT,
    }),
    offersRepo.listSentAdIdsByDealer({ purchaseIntentId, dealerUserId }),
  ]);

  if (truncated) {
    // Corte silencioso faria a lista parecer "todo o estoque compatível" quando
    // não é. Se este log aparecer, o teto precisa subir ou o casamento precisa
    // descer para o SQL.
    logger.warn(
      {
        ...buildDomainFields({
          action: "purchase_intent_offer.matching",
          result: "success",
          userId: dealerUserId,
          reason: "scan_truncated",
        }),
        purchaseIntentId,
        scanLimit: PURCHASE_INTENT_OFFER_SCAN_LIMIT,
      },
      "[purchase-intent-offers] estoque maior que o teto de varredura — lista pode estar incompleta"
    );
  }

  const sent = new Set(sentAdIds.map(String));

  const eligible = [];
  for (const ad of stock) {
    const verdict = evaluateAdForIntent(ad, intent);
    if (!verdict.eligible) continue;
    eligible.push({ ad, budgetRelation: verdict.budgetRelation });
  }

  const mainImages = await resolveMainImages(eligible.map((item) => item.ad));

  const matchingAds = eligible
    .map((item) =>
      serializeMatchingAd(item.ad, {
        budgetRelation: item.budgetRelation,
        alreadySent: sent.has(String(item.ad.id)),
        mainImage: mainImages.get(String(item.ad.id)) ?? null,
      })
    )
    .sort((a, b) =>
      compareMatchingAds(
        { budget_relation: a.budget_relation, price: a.price, id: a.ad_id },
        { budget_relation: b.budget_relation, price: b.price, id: b.ad_id }
      )
    );

  // Vagas ocupadas AGORA — a mesma contagem que o POST aplica. A tela usa para
  // avisar antes do clique; o backend continua sendo quem recusa.
  const usedSlots = await offersRepo.countAvailableOffersByDealer({
    purchaseIntentId,
    dealerUserId,
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent_offer.matching",
        result: "success",
        userId: dealerUserId,
      }),
      purchaseIntentId,
      scanned: stock.length,
      eligible: matchingAds.length,
      usedSlots,
    },
    "[purchase-intent-offers] estoque compatível listado"
  );

  return {
    matching_ads: matchingAds,
    limit: {
      max_per_dealer: PURCHASE_INTENT_OFFER_MAX_PER_DEALER,
      used: usedSlots,
      remaining: Math.max(0, PURCHASE_INTENT_OFFER_MAX_PER_DEALER - usedSlots),
    },
  };
}

/**
 * Avisa o COMPRADOR de que recebeu um veículo. BEST-EFFORT, fora da transação.
 *
 * A relação já está COMMITADA quando isto roda, e `purchase_intent_offers` é a
 * fonte de verdade: mesmo que o aviso falhe, o card aparece na área do
 * comprador no próximo carregamento e o lojista continua vendo "Enviado".
 * Derrubar o envio porque uma notificação falhou trocaria um problema pequeno
 * (o sino não piscou) por um grande (o lojista acha que enviou e não enviou).
 *
 * Por isso a função NUNCA propaga erro.
 *
 * Idempotência: a chave inclui o ANÚNCIO
 * (`purchase_intent:{id}:ad:{adId}:offer_received`). Retry do mesmo envio reusa
 * a chave e não duplica o aviso; um anúncio DIFERENTE gera chave diferente e
 * portanto uma notificação nova — que é o comportamento desejado, porque é uma
 * opção nova para o comprador.
 */
async function notifyBuyerOfOffer({ intentId, buyerUserId, adId, vehicleName }) {
  try {
    await createUserNotification({
      recipientUserId: buyerUserId,
      eventType: NOTIFICATION_EVENT_TYPE.PURCHASE_INTENT_OFFER_RECEIVED,
      title: "Nova opção para sua procura",
      body: `Uma loja enviou um ${vehicleName} para você.`,
      entityType: "purchase_intent",
      entityId: intentId,
      actionPath: `/dashboard/minhas-procuras/${intentId}`,
      idempotencyKey: `purchase_intent:${intentId}:ad:${adId}:offer_received`,
    });
    return true;
  } catch (error) {
    // Log SEM PII: ids e o motivo, nunca o texto nem dados do comprador.
    logger.error(
      {
        ...buildDomainFields({
          action: "purchase_intent_offer.notify",
          result: "error",
          userId: buyerUserId,
        }),
        purchaseIntentId: intentId,
        adId,
        err: error?.message || String(error),
      },
      "[purchase-intent-offers] falha ao notificar comprador — envio permanece criado"
    );
    return false;
  }
}

/**
 * Envia um veículo do estoque para a procura.
 *
 * ORDEM DAS VERIFICAÇÕES (§32 da especificação) — cada passo depende do
 * anterior:
 *
 *   1. cidade da loja + procura ATIVA da mesma cidade, com `FOR UPDATE`;
 *   2. o anúncio é DO LOJISTA (ownership reconstruída no servidor);
 *   3. JÁ FOI ENVIADO? → resposta idempotente, sem tocar em mais nada;
 *   4. o anúncio está ACTIVE;
 *   5. o anúncio CASA com a procura (a mesma avaliação da lista);
 *   6. vagas disponíveis < 3;
 *   7. INSERT.
 *
 * O passo 3 vem antes do 4 de propósito. Um retry de rede sobre um anúncio que
 * o lojista enviou e depois marcou como vendido continua sendo o MESMO envio —
 * responder "este anúncio não está ativo" a quem já enviou com sucesso seria
 * um erro para uma ação que, do ponto de vista dele, deu certo. A posse já foi
 * provada no passo 2, então nada é revelado por esse caminho.
 *
 * E vem antes do 6 porque um duplicado não consome vaga nova: recusar por
 * "limite atingido" um envio que já existe faria o lojista perder uma vaga que
 * ele nunca usou.
 */
export async function sendVehicleToBuyer(userId, rawIntentId, body) {
  const dealerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawIntentId);
  const adId = parseAdId(body?.ad_id);

  // A cidade sai do advertiser do usuário autenticado, FORA da transação: é
  // leitura pura e não participa da serialização do limite.
  const cityId = await resolveDealerCityId(dealerUserId);
  if (cityId == null) {
    throw new AppError("Oportunidade não encontrada.", 404);
  }

  const outcome = await withTransaction(async (tx) => {
    // 1. Procura ativa DA CIDADE DA LOJA, travada. Encerrada ou vencida não
    //    casa — inclusive se tiver mudado depois que a tela do lojista carregou.
    const intent = await offersRepo.lockActiveIntentForCity(purchaseIntentId, cityId, tx);
    if (!intent) {
      throw new AppError("Oportunidade não encontrada.", 404);
    }

    // 2. O anúncio precisa ser DELE. Nunca confiar no `ad_id` recebido.
    const ad = await offersRepo.getAdForDealer({ adId, dealerUserId }, tx);
    if (!ad) {
      // 404 e não 403: dizer "este anúncio é de outra loja" confirmaria a
      // existência do anúncio para quem está sondando ids.
      throw new AppError("Veículo não encontrado no seu estoque.", 404);
    }

    // 3. Duplicado → idempotente.
    const existing = await offersRepo.findOfferByIntentAndAd({ purchaseIntentId, adId }, tx);
    if (existing) {
      return { offer: existing, created: false, intent, ad };
    }

    // 4. Só anúncio ACTIVE pode ser enviado — mesmo sendo do dono.
    if (ad.status !== AD_STATUS.ACTIVE) {
      throw new AppError(
        "Só é possível enviar um veículo com anúncio ativo.",
        409,
        true,
        { code: PURCHASE_INTENT_OFFER_CODE.AD_NOT_ACTIVE, status: ad.status }
      );
    }

    // 5. Compatibilidade — a MESMA função que monta a lista. É isto que impede
    //    o ataque de trocar `ad_id` por um carro que a tela nunca ofereceu.
    const verdict = evaluateAdForIntent(ad, intent);
    if (!verdict.eligible) {
      logger.warn(
        {
          ...buildDomainFields({
            action: "purchase_intent_offer.create",
            result: "error",
            userId: dealerUserId,
            reason: verdict.reason,
          }),
          purchaseIntentId,
          adId,
        },
        "[purchase-intent-offers] envio recusado — veículo incompatível com a procura"
      );
      throw new AppError(
        "Este veículo não corresponde ao que o comprador procura.",
        409,
        true,
        { code: PURCHASE_INTENT_OFFER_CODE.AD_NOT_ELIGIBLE }
      );
    }

    // 6. Limite de vagas DISPONÍVEIS. A contagem enxerga os INSERTs dos
    //    requests anteriores porque o `FOR UPDATE` do passo 1 os serializou.
    const used = await offersRepo.countAvailableOffersByDealer(
      { purchaseIntentId, dealerUserId },
      tx
    );
    if (used >= PURCHASE_INTENT_OFFER_MAX_PER_DEALER) {
      throw new AppError(
        `Você já enviou ${PURCHASE_INTENT_OFFER_MAX_PER_DEALER} veículos disponíveis para este comprador.`,
        409,
        true,
        {
          code: PURCHASE_INTENT_OFFER_CODE.LIMIT_REACHED,
          max_per_dealer: PURCHASE_INTENT_OFFER_MAX_PER_DEALER,
        }
      );
    }

    // 7. INSERT. `null` = outro request venceu a corrida entre o passo 3 e
    //    aqui; o índice único fez o trabalho e a resposta continua idempotente.
    const inserted = await offersRepo.insertOffer(
      { purchaseIntentId, dealerUserId, adId },
      tx
    );
    if (!inserted) {
      const raced = await offersRepo.findOfferByIntentAndAd({ purchaseIntentId, adId }, tx);
      return { offer: raced, created: false, intent, ad };
    }

    return { offer: inserted, created: true, intent, ad };
  });

  logger.info(
    {
      ...buildDomainFields({
        action: "purchase_intent_offer.create",
        result: "success",
        userId: dealerUserId,
      }),
      purchaseIntentId,
      adId,
      created: outcome.created,
    },
    outcome.created
      ? "[purchase-intent-offers] veículo enviado ao comprador"
      : "[purchase-intent-offers] envio já existia (idempotente)"
  );

  // A notificação roda DEPOIS do COMMIT e só num envio novo. Num retry a chave
  // de idempotência já barraria a duplicata, mas nem chegar lá é mais honesto:
  // nada aconteceu, nada a avisar.
  if (outcome.created) {
    await notifyBuyerOfOffer({
      intentId: purchaseIntentId,
      buyerUserId: outcome.intent.buyer_user_id,
      adId,
      vehicleName: vehicleNameOf(outcome.ad),
    });
  }

  // Resposta MÍNIMA. Sem PII do comprador, sem `buyer_user_id` (que existe em
  // `outcome.intent` e para aqui), sem dados internos da procura.
  return {
    offer: {
      id: outcome.offer?.id ?? null,
      ad_id: adId,
      sent_at: outcome.offer?.created_at ?? null,
    },
    created: outcome.created,
    ...(outcome.created ? {} : { already_sent: true }),
  };
}

/**
 * Veículos recebidos numa procura DO PRÓPRIO comprador.
 *
 * A posse está na query (§44): procura de outra pessoa não casa nenhuma linha e
 * a resposta é 404 — nunca "esta procura é de outro usuário", que confirmaria a
 * existência do id.
 *
 * Funciona com procura encerrada e vencida: o histórico do que o comprador
 * recebeu não desaparece quando ele encerra a busca. O que ele não recebe mais
 * são veículos NOVOS, e essa regra vive no POST.
 */
export async function listReceivedOffers(userId, rawIntentId) {
  const buyerUserId = requireUserId(userId);
  const purchaseIntentId = parsePurchaseIntentId(rawIntentId);

  const { rows, intentFound, maxPrice } = await loadBuyerOffers({
    purchaseIntentId,
    buyerUserId,
  });

  if (!intentFound) {
    throw new AppError("Procura não encontrada.", 404);
  }

  const mainImages = await resolveMainImages(rows);

  return {
    offers: rows.map((row) =>
      serializeReceivedOffer(row, {
        maxPrice,
        mainImage: mainImages.get(String(row.id)) ?? null,
      })
    ),
  };
}

/**
 * Lê as ofertas E confirma a posse da procura.
 *
 * A lista vazia é ambígua sozinha: pode ser "procura sua, ainda sem veículos"
 * (200 com lista vazia) ou "procura de outra pessoa" (404). Distinguir exige
 * saber se a procura existe PARA ESTE dono — daí a consulta à procura, que é a
 * mesma do módulo da Fase 2 e igualmente escopada.
 *
 * A procura também é a fonte do `max_price` que classifica cada card em "dentro"
 * ou "acima do orçamento". As duas consultas são disparadas EM PARALELO: são
 * independentes, e a de ofertas já carrega a posse no próprio WHERE — não existe
 * janela em que a segunda devolva dado de outra pessoa por causa da ordem.
 */
async function loadBuyerOffers({ purchaseIntentId, buyerUserId }) {
  const [intent, rows] = await Promise.all([
    getByIdForBuyer(purchaseIntentId, buyerUserId),
    offersRepo.listOffersForBuyer({ purchaseIntentId, buyerUserId }),
  ]);

  return {
    rows: intent ? rows : [],
    intentFound: Boolean(intent),
    maxPrice: intent?.max_price ?? null,
  };
}

export { BUDGET_RELATION, PURCHASE_INTENT_OFFER_MAX_PER_DEALER };
