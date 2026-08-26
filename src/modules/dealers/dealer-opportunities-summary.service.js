/**
 * O RESUMO do hub de oportunidades do lojista.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE UM ENDPOINT SÓ, E NÃO DOIS
 * ════════════════════════════════════════════════════════════════════════════
 * O hub mostra quatro cartões que atravessam DOIS produtos (procuras de compra e
 * solicitações de venda). Buscá-los em dois endpoints faria a tela renderizar
 * pela metade duas vezes, e obrigaria o cliente a decidir o que fazer quando um
 * responde e o outro falha — decisão que ele não tem como tomar bem.
 *
 * Aqui as três contagens saem em paralelo, sob a MESMA loja resolvida, e a tela
 * recebe um objeto pronto ou um erro. Não existe meio-resumo.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A VARIAÇÃO PODE SER `null`, E ISSO É O PONTO
 * ════════════════════════════════════════════════════════════════════════════
 * Quando a janela anterior é ZERO, não existe variação percentual: qualquer
 * número novo seria divisão por zero, e "+100%" para 0 → 1 é uma etiqueta verde
 * que descreve uma cidade com uma única solicitação como se fosse crescimento
 * de mercado.
 *
 * Este produto roda hoje com uma cidade e poucas dezenas de registros. É
 * exatamente a faixa em que percentual engana mais: 1 → 2 é "+100%". Devolver
 * `null` deixa a decisão de exibição na tela, que mostra uma frase neutra em vez
 * de um número que promete uma tendência inexistente.
 */
import * as repo from "./dealer-opportunities-summary.repository.js";
import { requireDealerStore } from "../sale-requests/sale-requests.dealer.store.js";
import { AppError } from "../../shared/middlewares/error.middleware.js";
import { logger } from "../../shared/logger.js";
import { buildDomainFields } from "../../shared/domainLog.js";

function requireUserId(userId) {
  const value = String(userId ?? "").trim();
  if (!value) throw new AppError("Sessão inválida.", 401, true);
  return value;
}

/**
 * Variação percentual entre duas janelas de 7 dias.
 *
 * @returns `{ percent, direction }` ou `null` quando não há base de comparação.
 *
 * `percent` é sempre POSITIVO — o sinal vive em `direction`. A tela precisa
 * escolher cor e seta a partir da direção, e um número negativo obrigaria cada
 * chamador a lembrar de tirar o sinal antes de escrever "-12% de queda".
 */
export function computeTrend(current, previous) {
  const now = Number(current ?? 0);
  const before = Number(previous ?? 0);

  if (!Number.isFinite(now) || !Number.isFinite(before)) return null;
  // Sem base não há variação. Ver o cabeçalho: "+100%" para 0 → 1 é ruído
  // vendido como tendência.
  if (before <= 0) return null;

  const change = ((now - before) / before) * 100;

  return {
    // Uma casa decimal, como a comparação com a FIPE do detalhe. Mais casas
    // dariam ares de precisão a uma contagem de dezenas.
    percent: Math.abs(Math.round(change * 10) / 10),
    direction: change > 0 ? "up" : change < 0 ? "down" : "flat",
  };
}

/** Um cartão do topo: valor, tendência e a janela que a tendência descreve. */
function metric(total, window) {
  return {
    total: Number(total ?? 0),
    trend: computeTrend(window?.last_7d, window?.previous_7d),
  };
}

/**
 * O resumo completo.
 *
 * `advertiser_id` é PREFERÊNCIA do lojista, não autorização: `requireDealerStore`
 * confronta o valor com as lojas que o servidor montou a partir da sessão, e
 * devolve 409 quando a conta tem mais de uma e nenhuma foi escolhida — o mesmo
 * contrato do feed, para que a tela não precise de um segundo caminho de erro.
 */
export async function getDealerOpportunitiesSummary(userId, rawQuery = {}) {
  const dealerUserId = requireUserId(userId);

  const { advertiserId, cityId } = await requireDealerStore(dealerUserId, {
    advertiserId: rawQuery.advertiser_id,
  });

  const [buyers, saleRequests, deals] = await Promise.all([
    repo.countActiveBuyers(cityId),
    repo.countOpenSaleRequests(cityId),
    repo.countDealsInProgress({ cityId, advertiserId }),
  ]);

  /*
    "Novas oportunidades hoje" é a SOMA das duas entradas do dia.

    É o único cartão composto, e ele existe porque a pergunta que responde
    ("apareceu algo novo desde ontem?") não distingue de qual dos dois produtos
    a novidade veio — quem abre o painel de manhã quer saber se vale olhar.

    A tendência dele compara as mesmas somas nas duas janelas de 7 dias, e não a
    soma das duas tendências: média de percentuais não é o percentual da soma, e
    a diferença aparece justamente quando um dos lados é pequeno.
  */
  const newToday = {
    total: Number(buyers.today ?? 0) + Number(saleRequests.today ?? 0),
    trend: computeTrend(
      Number(buyers.last_7d ?? 0) + Number(saleRequests.last_7d ?? 0),
      Number(buyers.previous_7d ?? 0) + Number(saleRequests.previous_7d ?? 0)
    ),
  };

  logger.info(
    {
      ...buildDomainFields({
        action: "dealer.opportunities_summary",
        result: "success",
        userId: dealerUserId,
      }),
      cityId,
      advertiserId,
    },
    "[dealers] resumo de oportunidades calculado"
  );

  return {
    summary: {
      active_buyers: metric(buyers.total, buyers),
      sale_requests: metric(saleRequests.total, saleRequests),
      new_today: newToday,
      deals_in_progress: metric(deals.total, deals),
    },
  };
}
