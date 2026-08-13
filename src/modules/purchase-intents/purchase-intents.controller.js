// Handlers HTTP das procuras. Mesmo estilo do controller de notificações:
// `(req, res)` sem `next` e sem try/catch — o `asyncHandler` de cada arquivo de
// rotas encaminha qualquer throw para o `errorHandler` global.
//
// REGRA ÚNICA E NÃO NEGOCIÁVEL DESTE ARQUIVO: a identidade sai SEMPRE de
// `req.user`. Nenhum handler lê `buyer_user_id`, `user_id`, `city_id` de loja
// ou qualquer outro identificador de dono vindo do corpo ou da query. O corpo
// só carrega o QUE se procura; QUEM procura e de ONDE são do servidor.

import * as offersService from "./purchase-intent-offers.service.js";
import * as service from "./purchase-intents.service.js";

/**
 * Toda resposta é privada e não cacheável.
 *
 * Vale especialmente para os 404 do lojista: o `errorHandler` marca 404
 * operacional como `public, max-age=60`, e uma resposta cacheável publicamente
 * numa rota autenticada é o tipo de coisa que um proxy no meio guarda.
 */
function applyPrivateHeaders(res) {
  res.set("Cache-Control", "private, no-store");
}

// --- Comprador (PF) ---------------------------------------------------------

export async function createPurchaseIntent(req, res) {
  const result = await service.createPurchaseIntent(req.user, req.body || {});
  applyPrivateHeaders(res);
  return res.status(201).json({ success: true, ...result });
}

export async function listMyPurchaseIntents(req, res) {
  const result = await service.listMyPurchaseIntents(req.user.id, {
    limit: req.query?.limit,
    cursor: req.query?.cursor,
  });
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function getMyPurchaseIntent(req, res) {
  const result = await service.getMyPurchaseIntent(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function closeMyPurchaseIntent(req, res) {
  const result = await service.closeMyPurchaseIntent(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

// --- Lojista (CNPJ) ---------------------------------------------------------

export async function listDealerOpportunities(req, res) {
  const result = await service.listDealerOpportunities(req.user.id, {
    limit: req.query?.limit,
    cursor: req.query?.cursor,
  });
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function getDealerOpportunity(req, res) {
  const result = await service.getDealerOpportunity(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

// --- Envio de veículos (Fase 3) ---------------------------------------------

export async function listMatchingAds(req, res) {
  const result = await offersService.listMatchingAdsForDealer(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * O corpo carrega SÓ `ad_id`.
 *
 * `dealer_user_id`, `advertiser_id`, `buyer_user_id`, `city_id`, `price` e
 * qualquer mensagem que o cliente mandasse junto são ignorados — não existe
 * `req.body.x` lido em lugar nenhum além de `ad_id`. QUEM envia sai de
 * `req.user`, PARA QUEM sai da procura, e DE ONDE sai do advertiser. É por isso
 * que não há como forjar um envio em nome de outra loja mudando o payload.
 */
export async function createOffer(req, res) {
  const result = await offersService.sendVehicleToBuyer(req.user.id, req.params.id, req.body || {});
  applyPrivateHeaders(res);
  return res.status(result.created ? 201 : 200).json({ success: true, ...result });
}

export async function listReceivedOffers(req, res) {
  const result = await offersService.listReceivedOffers(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * Resolve o WhatsApp da loja para UM veículo recebido (Fase 3.1).
 *
 * `req.body` NÃO é lido — nem repassado. O service sequer aceita um parâmetro
 * de corpo, então `{ url }`, `{ phone }` ou `{ redirect }` enviados pelo cliente
 * não têm por onde influenciar o destino. É a defesa mais forte contra open
 * redirect: não existe valor para validar.
 *
 * POST e não GET porque a operação REVELA um dado de contato mediante uma ação
 * explícita do comprador. Um GET seria pré-carregável por prefetch do navegador
 * e cacheável por engano — exatamente o que §7 quer evitar ao não pôr o telefone
 * no DTO do card.
 */
export async function resolveOfferWhatsapp(req, res) {
  const result = await offersService.resolveOfferWhatsapp(
    req.user.id,
    req.params.id,
    req.params.offerId
  );
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}
