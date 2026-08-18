// Rotas do LOJISTA (CNPJ) no Produto 2. Montadas em
// `/api/account/opportunities/sale-requests` — o caminho que
// `sale-requests.routes.js` e `app.js` já reservavam em comentário desde a
// Fase 4.1.
//
// Router SEPARADO do router do dono porque a cadeia de guardas é OUTRA, e guarda
// diferente no mesmo router significa `if` por rota — o tipo de coisa que uma
// rota nova esquece. Aqui a cadeia inteira é declarada uma vez, no topo, e vale
// para tudo que for adicionado depois.
//
// A autorização tem DUAS camadas, e as duas são necessárias:
//   1. `requireDealerAccount()` — só conta CNPJ entra na área;
//   2. a cidade da loja, resolvida no service — decide O QUE ele vê.
// Sem a segunda, qualquer CNPJ veria as solicitações de qualquer cidade.
//
// ────────────────────────────────────────────────────────────────────────────
// O QUE NÃO EXISTE AQUI
// ────────────────────────────────────────────────────────────────────────────
// Nenhuma rota de contato: sem WhatsApp, sem telefone, sem e-mail, sem chat.
// O Produto 1 tem `/:id/whatsapp` porque lá o lojista fala com um comprador que
// pediu para ser encontrado. Aqui o vendedor é uma pessoa física que publicou a
// ficha do próprio carro para AVALIAÇÃO — o portal controla o fluxo, e um canal
// direto nesta fase entregaria a ela ligações que ela não pediu.

import express from "express";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { requireDealerAccount } from "../../shared/middlewares/dealer.middleware.js";
import * as controller from "./sale-requests.dealer.controller.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// A ordem é obrigatória: `requireDealerAccount` lê `req.user.account_type`, que
// só existe depois do `authMiddleware`. Invertida, ela devolveria 401 para todo
// mundo, inclusive lojista legítimo.
router.use(authMiddleware);
router.use(requireDealerAccount());

router.get("/", asyncHandler(controller.listSaleOpportunities));
router.get("/:id", asyncHandler(controller.getSaleOpportunity));

// POST — o único verbo de ESCRITA desta área.
//
// Sem rate limit próprio, pela mesma razão do envio de veículos do Produto 1: o
// domínio já limita o custo de um cliente insistente. Cada proposta precisa
// SUPERAR a maior atual, então uma repetição do mesmo valor é recusada dentro da
// transação, e escalar de verdade custa dinheiro real ao lojista a cada tentativa.
router.post("/:id/offers", asyncHandler(controller.createSaleOffer));

/**
 * Cache-Control nos caminhos de ERRO deste router.
 *
 * `applyPrivateHeaders` no controller só roda no caminho de SUCESSO — quando o
 * service lança, a resposta é montada pelo `errorHandler` global, que marca todo
 * 404 operacional como `public, max-age=60` (otimização legítima, escrita para
 * 404 de bot em rota PÚBLICA).
 *
 * Aqui a rota é autenticada, e o 404 é uma AFIRMAÇÃO SOBRE A CIDADE de quem
 * perguntou: "esta oportunidade não é sua". `public` autoriza explicitamente um
 * cache compartilhado a guardar a resposta de uma request com `Authorization` e
 * servi-la depois para outra loja — que talvez pudesse ver aquela solicitação.
 *
 * Este handler roda ANTES do global (a ordem de montagem é a ordem da cadeia),
 * reafirma `private, no-store` e responde ele mesmo ao 404, com o MESMO corpo
 * enxuto do handler global. Erros não-404 seguem adiante — o global não mexe em
 * Cache-Control neles, então o valor definido aqui sobrevive.
 *
 * Mesmo padrão de `sale-requests.routes.js` e das rotas do Produto 1.
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
