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
import * as inspectionService from "./sale-requests.inspection.service.js";
import * as selectionService from "./sale-requests.selection.service.js";
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
 * Seleciona uma proposta recebida (Fase 4.4).
 *
 * O corpo carrega `offer_id` e NADA MAIS é lido dele. `owner_user_id`,
 * `advertiser_id`, `amount` e `status` enviados pelo cliente são ignorados: o
 * dono sai do Bearer, a loja e o valor são derivados da OFERTA dentro da
 * transação, e o status é literal no `UPDATE`. Não é uma checagem que alguém
 * possa esquecer de fazer — é a ausência do código que os leria.
 *
 * Em especial, o VALOR nunca vem do cliente. Mandá-lo faria a resposta parecer
 * confirmar um número que o proprietário escolheu na tela, e um cliente
 * malicioso poderia congelar na trilha um valor que loja nenhuma ofereceu.
 *
 * POST e não PATCH: a seleção é um FATO novo (uma linha em
 * `sale_request_offer_selections`), não a edição de um campo. 200 e não 201
 * porque o recurso que o cliente conhece — a solicitação — continua sendo o
 * mesmo, e a resposta descreve o estado NOVO dele.
 *
 * Sempre 200, inclusive no retry da mesma seleção. `changed: false` distingue os
 * dois casos para quem quiser mostrar um aviso, sem transformar um retry em
 * erro. Selecionar OUTRA proposta é 409 — aí a diferença não é de repetição, é
 * de intenção.
 */
export async function selectSaleRequestOffer(req, res) {
  const result = await selectionService.selectSaleRequestOffer(
    req.user.id,
    req.params.id,
    req.body || {}
  );
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * Confirma o horário da avaliação presencial (Fase 4.5).
 *
 * O corpo carrega `slot_id` e nada mais é lido dele. O instante NÃO vem do
 * cliente: ele é copiado da própria linha do horário, dentro da transação —
 * aceitá-lo do corpo permitiria confirmar um horário e gravar outro.
 *
 * Sempre 200. `changed: false` no retry do mesmo horário; escolher um horário
 * DIFERENTE depois de confirmado é 409, porque não existe reagendamento nesta
 * fase.
 */
export async function confirmInspectionSlot(req, res) {
  const result = await inspectionService.confirmInspectionSlot(
    req.user.id,
    req.params.id,
    req.body || {}
  );
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * "Não consigo nesses horários" (§12).
 *
 * NÃO lê corpo nenhum — nem precisa. A ação é um sinal, não uma mensagem: um
 * campo de texto aqui viraria o canal de conversa que o produto decidiu não ter,
 * e a primeira pessoa a escrever um telefone nele entregaria o contato que todo
 * o desenho evita.
 */
export async function requestNewInspectionSlots(req, res) {
  const result = await inspectionService.requestNewInspectionSlots(
    req.user.id,
    req.params.id
  );
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
