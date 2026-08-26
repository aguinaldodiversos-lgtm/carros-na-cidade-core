// Rota do RESUMO do hub de oportunidades. Montada em
// `/api/account/opportunities/summary`.
//
// Router próprio, e não uma rota dentro de `sale-requests.dealer.routes.js`,
// porque o resumo atravessa os DOIS produtos: procuras de compra e solicitações
// de venda. Pendurá-lo em um deles faria o outro passar a depender de um módulo
// que não é dele — e o primeiro `import` cruzado é como um módulo vira dois.
//
// A cadeia de guardas é a MESMA dos outros dois routers do lojista, declarada
// uma vez no topo: sessão + conta CNPJ. A cidade continua sendo resolvida no
// service, a partir do advertiser — sem ela, qualquer CNPJ contaria a cidade
// alheia.
import express from "express";

import { authMiddleware } from "../../shared/middlewares/auth.middleware.js";
import { requireDealerAccount } from "../../shared/middlewares/dealer.middleware.js";
import { getDealerOpportunitiesSummary } from "./dealer-opportunities-summary.service.js";

const router = express.Router();

function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// A ordem é obrigatória: `requireDealerAccount` lê `req.user.account_type`, que
// só existe depois do `authMiddleware`.
router.use(authMiddleware);
router.use(requireDealerAccount());

router.get(
  "/",
  asyncHandler(async (req, res) => {
    const payload = await getDealerOpportunitiesSummary(req.user?.id, req.query ?? {});
    // `no-store`: são contagens que mudam a cada publicação na cidade, e um
    // resumo em cache mostraria "0 veículos" numa tela cujo botão abre uma lista
    // com dez.
    res.set("Cache-Control", "private, no-store");
    res.json({ success: true, ...payload });
  })
);

export default router;
