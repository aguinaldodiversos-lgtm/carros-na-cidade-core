/**
 * "Qual é a loja deste lojista?" — a pergunta que TODA rota desta área faz
 * antes de qualquer outra coisa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É UM ARQUIVO, E NÃO UMA FUNÇÃO NO SERVICE DO FEED
 * ────────────────────────────────────────────────────────────────────────────
 * Dois services precisam dela: o do FEED (que lista e detalha) e o de PROPOSTAS
 * (que grava). Se ela morasse no primeiro, o segundo importaria o primeiro — e o
 * primeiro precisa importar o segundo para montar o estado de disputa de cada
 * card. Isso é um ciclo de imports.
 *
 * ESM tolera ciclos, mas o modo de falha quando ele quebra é péssimo: uma das
 * pontas recebe `undefined` no lugar da função, e o erro que chega ao log é
 * "X is not a function" numa linha que não tem nada de errado. Este projeto já
 * pagou por esse diagnóstico uma vez nesta mesma fase.
 *
 * Um terceiro arquivo que nenhum dos dois services conhece como "o outro"
 * elimina o ciclo por construção, em vez de administrá-lo.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { resolveDealerStore } from "../../shared/account/dealer-store.js";
import { SALE_OPPORTUNITY_CODE } from "./sale-requests.dealer.constants.js";

/**
 * A loja do lojista autenticado, ou 403 com código estável.
 *
 * Chegar aqui já significa conta CNPJ (o router garante). O que falta provar é
 * que existe UMA loja ativa com UMA cidade — sem isso não há como decidir o que
 * mostrar, e mostrar "alguma coisa" seria entregar demanda privada da cidade
 * errada.
 *
 * 403 e não 200-vazio: a diferença importa para o usuário. Lista vazia diz "não
 * há veículos"; este caso diz "há uma loja para regularizar". Uma tela que
 * mostra "nenhum veículo na sua cidade" para quem tem duas lojas em cidades
 * diferentes esconde o problema real e não dá o que fazer.
 *
 * @returns {Promise<{ advertiserId: number, cityId: number }>}
 */
export async function requireDealerStore(dealerUserId) {
  const store = await resolveDealerStore(dealerUserId, {
    action: "sale_request.dealer_store.resolve",
  });

  if (!store) {
    throw new AppError(
      "Não foi possível identificar a cidade da sua loja. Confira os dados da loja.",
      403,
      true,
      { code: SALE_OPPORTUNITY_CODE.STORE_UNRESOLVED }
    );
  }

  return store;
}

export default requireDealerStore;
