/**
 * Autorização PROFISSIONAL (conta de lojista) no backend.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * Até a auditoria da Fase 0 (2026-08-10), a distinção "pessoa física" x
 * "lojista" existia em UM lugar só: o cookie `cnc_session` do frontend, lido
 * por `requireLojistaDashboardSession` para decidir quem entra em
 * `/dashboard-loja`.
 *
 * O backend SABE o tipo de conta — `authMiddleware` resolve `account_type` a
 * partir de `users.document_type` a cada request — mas nenhum guard usava esse
 * valor como AUTORIZAÇÃO. O único RBAC existente (`role.middleware.js`) só
 * conhece `role: user | admin`.
 *
 * Consequência prática: um endpoint reservado a lojistas protegido apenas por
 * `authMiddleware` aceitaria, direto pela API, uma conta `CPF` ou `pending` —
 * bastaria um Bearer válido. O painel do frontend não é barreira nenhuma para
 * quem fala HTTP.
 *
 * Este middleware fecha essa lacuna ANTES de existir o primeiro endpoint que
 * dependa dela (Motor de Oportunidades, Produtos A e B).
 *
 * ────────────────────────────────────────────────────────────────────────────
 * FONTE DE AUTORIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * SOMENTE `req.user.account_type`, populado por
 * `src/shared/middlewares/auth.middleware.js` a partir de uma consulta ao
 * banco pelo `id` do access token.
 *
 * NUNCA ler `cnc_session`, corpo da requisição, query string ou header
 * enviado pelo cliente. O frontend não é autoridade — é apenas mais um
 * consumidor da API.
 *
 * Por isso este guard precisa vir SEMPRE depois de `authMiddleware`:
 *
 *     router.use(authMiddleware);
 *     router.use(requireDealerAccount());
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ESCOPO DELIBERADAMENTE ESTREITO
 * ────────────────────────────────────────────────────────────────────────────
 * Responsabilidade única: "esta conta é de lojista?". Nada além disso.
 *
 * NÃO verifica plano, assinatura, entitlement, Start/Pro/Premium nem pagamento
 * — por decisão de produto, a diferenciação comercial só entra depois que o
 * mercado estiver formado. Quando entrar, será um middleware SEPARADO
 * (`requireEntitlement(...)`) composto com este, nunca um `if (plan.id === ...)`
 * enfiado aqui.
 */
import { AppError } from "./error.middleware.js";

/**
 * Os três valores que `authMiddleware` produz para `req.user.account_type`.
 *
 * Vocabulário fechado e derivado do servidor: `users.document_type` vazio/NULL
 * vira `pending`; `'cnpj'` vira `CNPJ`; QUALQUER outro valor não-vazio vira
 * `CPF`. Não existe um quarto valor legítimo.
 *
 * Declarado aqui (e não em `shared/constants/status.js`) para manter este
 * guard autocontido: `status.js` é consumido por dezenas de módulos de anúncio
 * e não deve crescer por causa de autorização.
 */
export const ACCOUNT_TYPE = Object.freeze({
  PENDING: "pending",
  CPF: "CPF",
  CNPJ: "CNPJ",
});

/**
 * Decisão PURA: este contexto autenticado é de uma conta de lojista?
 *
 * Comparação por IGUALDADE ESTRITA contra o único valor que o backend emite.
 * Sem `toUpperCase()`, sem `trim()`, sem aceitar sinônimos ("PJ", "dealer",
 * "lojista", "cnpj" minúsculo). Normalizar aqui seria inventar um vocabulário
 * que nenhum caminho de escrita produz — e cada sinônimo aceito é uma porta a
 * mais para um valor inesperado virar permissão.
 *
 * FAIL CLOSED: `undefined`, `null`, `""`, tipo desconhecido e objeto ausente
 * são todos NÃO-lojista.
 *
 * @param {{ account_type?: unknown } | null | undefined} user — tipicamente `req.user`
 * @returns {boolean}
 */
export function isDealerAccount(user) {
  return user?.account_type === ACCOUNT_TYPE.CNPJ;
}

/**
 * Factory de middleware — mesmo formato de `requireRole()` / `requireAdmin()`
 * em `role.middleware.js`, para que a composição em routers seja idêntica à
 * que o projeto já usa.
 *
 * Contrato de status (igual ao de `requireRole`):
 *   • sem contexto autenticado         → 401 (o pedido nem chegou autenticado)
 *   • autenticado, mas não é lojista   → 403 (autenticado e recusado)
 *
 * A resposta não revela `document_type`, plano nem nada do estado interno da
 * conta; carrega apenas `code` estável para o frontend discriminar o caso sem
 * fazer parsing de mensagem (mesmo padrão de `ad-ownership.js`).
 *
 * @returns {import('express').RequestHandler}
 */
export function requireDealerAccount() {
  return (req, _res, next) => {
    if (!req.user) {
      return next(new AppError("Autenticação necessária", 401));
    }

    if (!isDealerAccount(req.user)) {
      return next(
        new AppError("Acesso exclusivo para conta de lojista.", 403, true, {
          code: "DEALER_ACCOUNT_REQUIRED",
        })
      );
    }

    return next();
  };
}

export default requireDealerAccount;
