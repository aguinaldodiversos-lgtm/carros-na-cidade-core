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
    return res.status(404).json({ success: false, error: "not_found" });
  }

  return next(error);
});

export default router;
