// Handlers HTTP da área do lojista no Produto 2. Mesmo estilo do controller do
// dono: `(req, res)` sem `next` e sem try/catch — o `asyncHandler` do arquivo de
// rotas encaminha qualquer throw para o `errorHandler` global.
//
// REGRA ÚNICA E NÃO NEGOCIÁVEL DESTE ARQUIVO: a identidade e a CIDADE saem
// sempre de `req.user`. Nenhum handler lê `city_id`, `advertiser_id`,
// `dealer_user_id` ou qualquer outro identificador vindo do corpo, da query ou
// de header.
//
// A query string carrega só FILTROS — o que o lojista quer ver dentro do que já
// pode ver. Ela nunca decide o que ele pode ver.

import * as service from "./sale-requests.dealer.service.js";
import * as offersService from "./sale-requests.offers.service.js";

/**
 * Toda resposta é privada e não cacheável.
 *
 * Vale especialmente para os 404: o `errorHandler` marca 404 operacional como
 * `public, max-age=60`, e uma resposta cacheável publicamente numa rota
 * autenticada é o tipo de coisa que um proxy no meio guarda — e depois serve
 * para outra loja.
 */
function applyPrivateHeaders(res) {
  res.set("Cache-Control", "private, no-store");
}

/**
 * Feed de veículos disponíveis para avaliação.
 *
 * `req.query` inteiro é repassado ao service, que aplica a allowlist. Passar o
 * objeto cru mantém UM lugar (a validação) decidindo o que é filtro válido —
 * enumerar os campos aqui criaria uma segunda lista, e a que ficasse para trás
 * deixaria um filtro novo silenciosamente sem efeito.
 */
export async function listSaleOpportunities(req, res) {
  const result = await service.listDealerSaleOpportunities(req.user.id, req.query || {});
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

export async function getSaleOpportunity(req, res) {
  const result = await service.getDealerSaleOpportunity(req.user.id, req.params.id, req.query || {});
  applyPrivateHeaders(res);
  return res.json({ success: true, ...result });
}

/**
 * Envia uma proposta preliminar.
 *
 * O corpo carrega `amount` e, opcionalmente, `note`. NADA MAIS é lido dele.
 *
 * `advertiser_id`, `dealer_user_id` e `sale_request_id` enviados pelo cliente
 * são ignorados: os dois primeiros vêm de `req.user` + `resolveDealerStore`, e o
 * terceiro vem do caminho da URL. Não existe caminho de leitura para eles no
 * service — não é uma checagem que alguém possa esquecer de fazer, é a ausência
 * do código que leria.
 *
 * 201: a proposta é um recurso NOVO a cada envio (a tabela é append-only), e não
 * a atualização de uma proposta existente.
 */
export async function createSaleOffer(req, res) {
  // A loja escolhida viaja na QUERY, não no corpo. O corpo carrega o QUANTO
  // (amount, note); o EM NOME DE QUEM é contexto de atuação, e mantê-lo fora do
  // payload preserva literalmente a regra da fase anterior: nenhum ator é lido
  // do corpo. Em ambos os casos o servidor reconfirma a posse.
  const result = await offersService.createSaleOffer(
    req.user.id,
    req.params.id,
    req.body || {},
    { advertiserId: (req.query || {}).advertiser_id }
  );
  applyPrivateHeaders(res);
  return res.status(201).json({ success: true, ...result });
}
