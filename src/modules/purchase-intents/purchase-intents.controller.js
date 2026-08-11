// Handlers HTTP das procuras. Mesmo estilo do controller de notificações:
// `(req, res)` sem `next` e sem try/catch — o `asyncHandler` de cada arquivo de
// rotas encaminha qualquer throw para o `errorHandler` global.
//
// REGRA ÚNICA E NÃO NEGOCIÁVEL DESTE ARQUIVO: a identidade sai SEMPRE de
// `req.user`. Nenhum handler lê `buyer_user_id`, `user_id`, `city_id` de loja
// ou qualquer outro identificador de dono vindo do corpo ou da query. O corpo
// só carrega o QUE se procura; QUEM procura e de ONDE são do servidor.

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
