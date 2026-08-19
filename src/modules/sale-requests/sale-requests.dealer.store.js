/**
 * "Em nome de qual loja este lojista está agindo?" — a pergunta que TODA rota
 * desta área faz antes de qualquer outra coisa.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ISTO É UM ARQUIVO, E NÃO UMA FUNÇÃO NO SERVICE DO FEED
 * ────────────────────────────────────────────────────────────────────────────
 * Dois services precisam dela: o do FEED (que lista e detalha) e o de PROPOSTAS
 * (que grava). Se ela morasse no primeiro, o segundo importaria o primeiro — e o
 * primeiro precisa importar o segundo para montar o estado de disputa de cada
 * card. Isso é um ciclo de imports.
 *
 * ESM tolera ciclos, mas o modo de falha quando um quebra é péssimo: uma das
 * pontas recebe `undefined` no lugar da função, e o erro que chega ao log é
 * "X is not a function" numa linha que não tem nada de errado. Este projeto já
 * pagou por esse diagnóstico uma vez nesta mesma fase.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A LOJA NÃO É ESCOLHIDA POR CONVENIÊNCIA
 * ────────────────────────────────────────────────────────────────────────────
 * Uma versão anterior desta fase resolvia duas lojas na mesma cidade pegando a
 * de MENOR id. Era determinístico — e errado: a proposta grava `advertiser_id`,
 * então essa escolha atribui uma oferta comercial a uma empresa que talvez não a
 * tenha feito. O lojista com duas lojas veria a proposta dele registrada em nome
 * da outra, sem nunca ser perguntado.
 *
 * Estabilidade não é correção. Quando há mais de uma loja elegível, quem escolhe
 * é o lojista.
 */
import { AppError } from "../../shared/middlewares/error.middleware.js";
import {
  DEALER_STORE_RESOLUTION,
  resolveDealerStoreSelection,
} from "../../shared/account/dealer-store.js";
import { SALE_OPPORTUNITY_CODE } from "./sale-requests.dealer.constants.js";

/**
 * As lojas do próprio usuário, no formato que o seletor consome.
 *
 * Isto NÃO é vazamento: são as lojas de quem perguntou, montadas a partir de
 * `req.user.id`. O `advertiser_id` aparece porque é o valor que o cliente
 * devolve na escolha — e devolvê-lo não autoriza nada, já que toda resolução
 * seguinte confronta o valor com o conjunto do servidor de novo.
 */
function serializeStores(stores) {
  return stores.map((store) => ({
    advertiser_id: store.advertiserId,
    name: store.name,
    city: store.city,
  }));
}

/**
 * A loja do lojista autenticado, ou o erro HTTP correspondente.
 *
 * Chegar aqui já significa conta CNPJ (o router garante). O que falta decidir é
 * em nome de QUAL loja a request acontece:
 *
 *   NONE               → 403. Não há em nome de quem agir. A ação do usuário não
 *                        é "procurar veículo", é regularizar a loja — e uma
 *                        lista vazia dizendo "nenhum veículo na sua cidade"
 *                        esconderia isso.
 *
 *   SELECTION_REQUIRED → 409, com a lista das lojas. Não é erro do usuário nem
 *                        falha do servidor: é uma decisão que só ele pode tomar,
 *                        e o 409 carrega exatamente o que a tela precisa para
 *                        oferecê-la. 400 diria "você mandou algo errado"; 403
 *                        diria "você não pode" — nenhum dos dois é verdade.
 *
 *   INVALID_SELECTION  → 403. Loja de outro usuário, suspensa, sem cidade ou
 *                        inexistente. Mesma resposta para os quatro, para não
 *                        contar a quem sonda ids qual deles existe.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CIDADE VEM JUNTO, E É O QUE TORNA "COMPRAR FORA DA CIDADE" IMPOSSÍVEL
 * ────────────────────────────────────────────────────────────────────────────
 * O objeto devolvido carrega o `cityId` DA LOJA RESOLVIDA, e é esse valor que
 * entra no `WHERE` de toda query seguinte — a listagem, o detalhe e o
 * `SELECT ... FOR UPDATE` da proposta.
 *
 * Por isso não existe (nem faria falta) uma checagem separada de "esta loja
 * atende esta cidade?": um lojista que escolhe a loja de Bragança e abre um
 * carro de Atibaia não recebe um 403 de uma validação — a linha simplesmente não
 * casa o `WHERE`, e a resposta é 404. A regra não é um `if` que alguém possa
 * esquecer de escrever; é a ausência de qualquer outra origem para o `cityId`.
 *
 * @param {string|number} dealerUserId — `req.user.id`
 * @param {{ advertiserId?: unknown }} [options] — a PREFERÊNCIA do cliente
 * @returns {Promise<{ advertiserId: number, cityId: number, name: string|null }>}
 */
export async function requireDealerStore(dealerUserId, { advertiserId = null } = {}) {
  const resolution = await resolveDealerStoreSelection(dealerUserId, {
    advertiserId,
    action: "sale_request.dealer_store.resolve",
  });

  if (resolution.status === DEALER_STORE_RESOLUTION.OK) {
    return resolution.store;
  }

  if (resolution.status === DEALER_STORE_RESOLUTION.SELECTION_REQUIRED) {
    throw new AppError("Escolha a loja que vai comprar.", 409, true, {
      code: SALE_OPPORTUNITY_CODE.STORE_SELECTION_REQUIRED,
      stores: serializeStores(resolution.stores),
    });
  }

  if (resolution.status === DEALER_STORE_RESOLUTION.INVALID_SELECTION) {
    throw new AppError("Loja inválida para esta conta.", 403, true, {
      code: SALE_OPPORTUNITY_CODE.STORE_INVALID,
    });
  }

  throw new AppError(
    "Não foi possível identificar a cidade da sua loja. Confira os dados da loja.",
    403,
    true,
    { code: SALE_OPPORTUNITY_CODE.STORE_UNRESOLVED }
  );
}


export default requireDealerStore;
