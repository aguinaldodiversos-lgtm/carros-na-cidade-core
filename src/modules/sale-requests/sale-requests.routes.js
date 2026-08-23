// Rotas do DONO (pessoa física). Montadas em `/api/account/sale-requests`.
//
// Guarda: `authMiddleware` e nada mais. Deliberadamente SEM
// `requireDealerAccount` — quem vende o próprio carro é conta CPF ou `pending`,
// e o guard de lojista recusaria exatamente o público-alvo. A regra inversa
// (CNPJ NÃO vende por aqui) vive no service, porque é regra de produto e não de
// autorização de área: a mensagem precisa dizer ao lojista para onde ir.
//
// ────────────────────────────────────────────────────────────────────────────
// NÃO EXISTE ROTA DE LOJISTA NESTE ARQUIVO
// ────────────────────────────────────────────────────────────────────────────
// A Fase 4.1 não distribui solicitação para ninguém. Quando a 4.2 chegar, as
// rotas do lojista nascem num router SEPARADO (como
// `purchase-intents.dealer.routes.js`), porque a cadeia de guardas é outra —
// e guarda diferente no mesmo router significa `if` por rota, o tipo de coisa
// que uma rota nova esquece.
//
// ────────────────────────────────────────────────────────────────────────────
// NÃO EXISTE PATCH/PUT
// ────────────────────────────────────────────────────────────────────────────
// Publicou, não edita campo economicamente relevante (§24 da especificação). Um
// PATCH genérico aberto agora permitiria, depois que os lances existirem, mudar
// a quilometragem debaixo de uma oferta já feita.

import express from "express";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import * as controller from "./sale-requests.controller.js";
import {
  saleRequestCreateRateLimit,
  saleRequestPhotoRateLimit,
} from "./sale-requests.rate-limit.js";
import { saleRequestPhotoUpload } from "./sale-requests.upload.middleware.js";
import { SALE_REQUEST_PHOTOS } from "./sale-requests.constants.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

router.use(authMiddleware);

router.get("/", asyncHandler(controller.listMySaleRequests));

// Os limitadores vêm DEPOIS do `authMiddleware` (montado acima) para que
// `req.user.id` já exista quando a chave for calculada.
router.post("/", saleRequestCreateRateLimit, asyncHandler(controller.createSaleRequest));

// `photos` é declarado ANTES de `/:id` de propósito. Sem isso, o Express casaria
// `/photos` como `/:id` e o `parseSaleRequestId` devolveria 404 para um upload
// legítimo — falha silenciosa e difícil de ler no log, porque o 404 pareceria
// "solicitação inexistente".
router.post(
  "/photos",
  saleRequestPhotoRateLimit,
  saleRequestPhotoUpload.array("photos", SALE_REQUEST_PHOTOS.MAX),
  asyncHandler(controller.uploadPhotos)
);

router.get("/:id", asyncHandler(controller.getMySaleRequest));

router.post("/:id/cancel", asyncHandler(controller.cancelMySaleRequest));

/**
 * Seleção de proposta (Fase 4.4). O segundo — e último — verbo de escrita de
 * estado desta área.
 *
 * Sem rate limit próprio, pela mesma razão do POST de propostas do lojista: o
 * DOMÍNIO já limita o custo de um cliente insistente. A transição é única e
 * irreversível (§8), então a partir do segundo request a resposta é 200
 * idempotente (mesma oferta) ou 409 (outra) — sem escrita, sem notificação e sem
 * trabalho além de um `SELECT ... FOR UPDATE` numa linha que o próprio usuário
 * possui. Um limitador aqui protegeria contra uma pressão que não existe e
 * poderia recusar o retry legítimo de quem perdeu a resposta na rede.
 *
 * Declarada DEPOIS de `/photos` como todas as rotas com `:id` deste router — ver
 * o comentário lá em cima sobre o Express casar `/photos` como `/:id`.
 */
router.post("/:id/select-offer", asyncHandler(controller.selectSaleRequestOffer));

/**
 * Fase 4.5 — a escolha do horário da avaliação presencial.
 *
 * Duas rotas para duas intenções OPOSTAS do proprietário: confirmar um horário
 * ou dizer que nenhum serve. Um endpoint só, com um flag no corpo, faria a
 * segunda parecer um caso particular da primeira — e ela não é: uma avança o
 * negócio (`offer_selected → inspection_scheduled`), a outra devolve a bola para
 * a loja sem mudar o estado da oportunidade.
 *
 * Sem rate limit próprio, pela mesma razão do `select-offer`: as duas transições
 * são idempotentes ou 409 a partir do segundo request, sem escrita e sem
 * notificação. Um limitador protegeria contra uma pressão que não existe e
 * recusaria o retry legítimo de quem perdeu a resposta na rede.
 */
router.post("/:id/inspection/confirm", asyncHandler(controller.confirmInspectionSlot));
router.post(
  "/:id/inspection/request-slots",
  asyncHandler(controller.requestNewInspectionSlots)
);

/**
 * Fase 4.6 — a resposta do proprietário à proposta final.
 *
 * UM endpoint para as duas respostas, e não `/accept` + `/reject`: aceitar e
 * recusar são o MESMO fato de domínio (o proprietário respondeu) com valores
 * opostos, gravado na mesma linha da mesma trilha, com a mesma transação e o
 * mesmo UNIQUE. Duas rotas duplicariam guard, lock e idempotência — e a segunda
 * cópia é onde o `fromStatus` acaba esquecido.
 *
 * É o oposto da escolha feita logo acima, em `inspection/confirm` ×
 * `inspection/request-slots`, e a diferença é real: lá são dois FATOS distintos
 * (um avança o negócio, o outro devolve a bola sem mudar o estado). Aqui é um
 * fato com duas faces.
 *
 * POST e não PATCH: fato novo e auditável, não edição livre da solicitação.
 *
 * Sem rate limit próprio, pela mesma razão do `select-offer`: a transição é
 * única, e a partir do segundo request a resposta é 200 idempotente (mesma
 * decisão) ou 409 (a oposta) — sem escrita, sem notificação e sem trabalho além
 * de um `SELECT ... FOR UPDATE` numa linha que o próprio usuário possui. Um
 * limitador aqui recusaria o retry legítimo de quem perdeu a resposta na rede.
 */
router.post("/:id/final-offer-decision", asyncHandler(controller.decideFinalOffer));

/**
 * Cache-Control nos caminhos de ERRO deste router.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O PROBLEMA QUE ISTO RESOLVE
 * ────────────────────────────────────────────────────────────────────────────
 * `applyPrivateHeaders` no controller só roda no caminho de SUCESSO — quando o
 * service lança, a resposta é montada pelo `errorHandler` global, que marca todo
 * 404 operacional como `public, max-age=60` (uma otimização legítima, escrita
 * para 404 de bot em rota PÚBLICA).
 *
 * Aqui a rota é autenticada. `public` autoriza explicitamente um cache
 * compartilhado a guardar a resposta de uma request com `Authorization` — e o
 * 404 que o dono recebe hoje ("esta solicitação não é sua") passaria a ser
 * servido de cache depois, para requests que já não deveriam recebê-lo.
 *
 * Este handler roda ANTES do global (a ordem de montagem é a ordem da cadeia) e
 * fecha o caso: reafirma `private, no-store` e responde ele mesmo ao 404, com o
 * MESMO corpo enxuto do handler global. Erros não-404 seguem adiante — o global
 * não mexe em Cache-Control neles, então o valor definido aqui sobrevive.
 *
 * Não corrigido globalmente de propósito: `errorHandler` é infraestrutura
 * compartilhada por todas as rotas públicas do portal, e mudar a política de
 * cache de 404 do projeto inteiro não é escopo da Fase 4.1. O mesmo padrão
 * existe hoje nas rotas do Produto 1 — registrado no relatório da fase.
 */
router.use((error, _req, res, next) => {
  if (res.headersSent) return next(error);

  res.set("Cache-Control", "private, no-store");

  if (error?.statusCode === 404 && error?.isOperational) {
    /**
     * O corpo continua enxuto — sem mensagem, sem campo, sem id.
     *
     * O `code`, quando existe, viaja junto. Ele NÃO afrouxa nada: os 404 que
     * este router produz sobre a SOLICITAÇÃO ("não é sua", "não existe") não
     * carregam código nenhum e continuam indistinguíveis entre si, que é a
     * propriedade que protege quem sonda ids.
     *
     * Quem carrega código é o 404 de dentro de um recurso que o usuário JÁ
     * provou possuir — hoje só `OFFER_NOT_FOUND`, a proposta que não pertence a
     * esta solicitação (Fase 4.4). A tela precisa distinguir esse caso do outro,
     * porque as reações são opostas: uma manda recarregar a lista de propostas,
     * a outra manda sair da página. Discriminar por status HTTP é impossível (os
     * dois são 404), e por texto de mensagem quebraria na primeira melhoria de
     * redação — que é justamente o motivo de os códigos existirem.
     *
     * Sem esta linha, `SALE_REQUEST_OFFER_NOT_FOUND` seria uma constante que
     * nenhum cliente jamais veria: código morto nascendo já morto.
     */
    const code = error?.details?.code ?? null;
    return res.status(404).json({
      success: false,
      error: "not_found",
      ...(code ? { details: { code } } : {}),
    });
  }

  return next(error);
});

export default router;
