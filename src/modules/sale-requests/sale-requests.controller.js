// Handlers HTTP das solicitações de venda. Mesmo estilo dos controllers de
// procuras e notificações: `(req, res)` sem `next` e sem try/catch — o
// `asyncHandler` do arquivo de rotas encaminha qualquer throw para o
// `errorHandler` global.
//
// REGRA ÚNICA E NÃO NEGOCIÁVEL DESTE ARQUIVO: a identidade sai SEMPRE de
// `req.user`. Nenhum handler lê `owner_user_id`, `user_id` ou qualquer outro
// identificador de dono vindo do corpo, da query ou de header. O corpo carrega o
// QUE se vende; QUEM vende é do servidor.

import * as photosService from "./sale-requests.photos.service.js";
import * as service from "./sale-requests.service.js";

/**
 * Toda resposta é privada e não cacheável.
 *
 * Vale especialmente para os 404: o `errorHandler` marca 404 operacional como
 * `public, max-age=60`, e uma resposta cacheável publicamente numa rota
 * autenticada é o tipo de coisa que um proxy no meio guarda.
 */
function applyPrivateHeaders(res) {
  res.set("Cache-Control", "private, no-store");
}

/**
 * O corpo carrega os dados do VEÍCULO e a lista de `images` (chaves de storage).
 *
 * `owner_user_id`, `status`, `fipe_reference_value` e `fipe_code` enviados pelo
 * cliente são ignorados: nenhum deles é lido em lugar nenhum do caminho de
 * escrita. O status é literal no INSERT, e o valor FIPE é resolvido pelo
 * servidor a partir dos CÓDIGOS — nunca do valor.
 */
export async function createSaleRequest(req, res) {
  const result = await service.createSaleRequest(req.user, req.body || {});
  applyPrivateHeaders(res);
  return res.status(201).json({ success: true, ...result });
}

export async function listMySaleRequests(req, res) {
  const result = await service.listMySaleRequests(req.user.id, {
    limit: req.query?.limit,
    cursor: req.query?.cursor,
  });
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function getMySaleRequest(req, res) {
  const result = await service.getMySaleRequest(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * POST e não DELETE: cancelar é mudança de estado, não remoção. A solicitação
 * continua no histórico do dono como "Cancelada".
 *
 * Sempre 200, inclusive no segundo clique — `changed: false` distingue os dois
 * casos para quem quiser mostrar um aviso, sem transformar um retry em erro.
 */
export async function cancelMySaleRequest(req, res) {
  const result = await service.cancelMySaleRequest(req.user.id, req.params.id);
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * Upload das fotos. `req.files` vem do multer em memória.
 *
 * Não recebe nem lê nenhum campo de texto do corpo: o destino no storage é
 * derivado inteiramente de `req.user.id` e de um UUID gerado no servidor.
 */
export async function uploadPhotos(req, res) {
  const result = await photosService.uploadSaleRequestPhotos(req.user, req.files || []);
  applyPrivateHeaders(res);
  return res.status(201).json({ success: true, ...result });
}
