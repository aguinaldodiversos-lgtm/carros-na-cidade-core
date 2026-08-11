// Rotas do LOJISTA (CNPJ). Montadas em
// `/api/account/opportunities/purchase-intents`.
//
// Router separado do de comprador porque a GUARDA é diferente, e guarda
// diferente no mesmo router significa `if` por rota — o tipo de coisa que uma
// rota nova esquece. Aqui a cadeia inteira é declarada uma vez, no topo, e vale
// para tudo que for adicionado depois.
//
// Esta é a PRIMEIRA montagem de `requireDealerAccount` em rota de produção. O
// middleware existe desde a Fase 0.1 e até agora só era exercitado por teste —
// e teste de pureza não prova alcance. A partir daqui ele está no caminho real:
// conta CPF ou `pending` recebe 403 antes de qualquer consulta.
//
// A autorização tem DUAS camadas, e as duas são necessárias:
//   1. `requireDealerAccount()` — só CNPJ entra na área;
//   2. cidade resolvida no service a partir do advertiser — decide O QUE ele vê.
// Sem a segunda, qualquer CNPJ veria as procuras de qualquer cidade.

import express from "express";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { requireDealerAccount } from "../../shared/middlewares/dealer.middleware.js";
import * as controller from "./purchase-intents.controller.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// A ordem é obrigatória: `requireDealerAccount` lê `req.user.account_type`, que
// só existe depois do `authMiddleware`. Invertida, ela devolveria 401 para todo
// mundo, inclusive lojista legítimo.
router.use(authMiddleware);
router.use(requireDealerAccount());

router.get("/", asyncHandler(controller.listDealerOpportunities));
router.get("/:id", asyncHandler(controller.getDealerOpportunity));

export default router;
