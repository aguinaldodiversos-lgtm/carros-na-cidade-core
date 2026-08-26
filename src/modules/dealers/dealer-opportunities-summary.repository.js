/**
 * As CONTAGENS do hub de oportunidades do lojista.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * TODO NÚMERO DAQUI É CONTADO, NENHUM É ESTIMADO
 * ════════════════════════════════════════════════════════════════════════════
 * O hub mostra quatro números grandes e quatro variações percentuais. Nenhum
 * deles é derivado, arredondado para parecer melhor, nem "calibrado". Cada um é
 * um `COUNT(*)` sobre a MESMA partição que a listagem correspondente usa — se o
 * cartão diz 76, a tela de veículos para avaliação abre com 76.
 *
 * A regra vale especialmente para a variação. "+18% nos últimos 7 dias" é a
 * comparação entre o que ENTROU nos últimos 7 dias e o que entrou nos 7 dias
 * anteriores, lida de `created_at`. Não existe tabela de histórico neste
 * produto, e inventar uma série temporal para preencher uma etiqueta verde
 * seria exatamente o tipo de número que faz alguém decidir errado com
 * confiança.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * A CIDADE ESTÁ SEMPRE NO `WHERE`
 * ════════════════════════════════════════════════════════════════════════════
 * Mesma regra de ouro de `sale-requests.dealer.repository.js`: nenhuma função
 * aceita "conte para mim" sem `cityId`. A autorização territorial acontece
 * DENTRO da query — apagar a cláusula faz o teste de escopo falhar, em vez de
 * fazer um `if` esquecido passar despercebido.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AS JANELAS SÃO CALCULADAS NO BANCO
 * ════════════════════════════════════════════════════════════════════════════
 * `NOW() - INTERVAL '7 days'`, e não uma data vinda da aplicação. O servidor de
 * aplicação e o banco podem divergir de relógio, e uma janela de 7 dias que
 * começa num fuso e termina noutro produziria variação percentual fantasma —
 * o tipo de defeito que só aparece na virada do horário de verão e some antes
 * de alguém investigar.
 */
import { query } from "../../infrastructure/database/db.js";
import { SALE_REQUEST_SELECTED_STATUSES, SALE_REQUEST_STATUS } from "../sale-requests/sale-requests.constants.js";

/**
 * Compradores ativos na cidade — e as duas janelas de 7 dias.
 *
 * O predicado do `total` é IDÊNTICO ao de `listActiveByCity`
 * (`purchase-intents.repository.js`): mesma cidade, `status = 'active'`,
 * `expires_at > NOW()`. Copiar o predicado é o risco conhecido aqui — por isso
 * o teste compara o número do resumo com o tamanho da lista, e não com um
 * literal.
 */
export async function countActiveBuyers(cityId) {
  const result = await query(
    `
    SELECT
      COUNT(*) FILTER (
        WHERE pi.status = 'active' AND pi.expires_at > NOW()
      )::int AS total,

      COUNT(*) FILTER (
        WHERE pi.created_at >= NOW() - INTERVAL '7 days'
      )::int AS last_7d,

      -- A janela ANTERIOR é fechada dos dois lados. Sem o limite superior ela
      -- incluiria os últimos 7 dias e a comparação seria de um conjunto com ele
      -- mesmo — que nunca cai, e por isso pareceria funcionar.
      COUNT(*) FILTER (
        WHERE pi.created_at >= NOW() - INTERVAL '14 days'
          AND pi.created_at <  NOW() - INTERVAL '7 days'
      )::int AS previous_7d,

      COUNT(*) FILTER (
        WHERE pi.created_at >= date_trunc('day', NOW())
      )::int AS today

    FROM purchase_intents pi
    WHERE pi.city_id = $1
    `,
    [cityId]
  );

  return result.rows[0] ?? { total: 0, last_7d: 0, previous_7d: 0, today: 0 };
}

/**
 * Veículos para avaliação na cidade — e as duas janelas.
 *
 * `receiving_offers` por IGUALDADE, como o feed. Um `<> 'cancelled'` passaria a
 * contar automaticamente todo estado novo que uma fase seguinte criasse, e o
 * cartão do hub divergiria da lista sem que ninguém tivesse mexido no hub.
 */
export async function countOpenSaleRequests(cityId) {
  const result = await query(
    `
    SELECT
      COUNT(*) FILTER (WHERE sr.status = $2)::int AS total,

      COUNT(*) FILTER (
        WHERE sr.created_at >= NOW() - INTERVAL '7 days'
      )::int AS last_7d,

      COUNT(*) FILTER (
        WHERE sr.created_at >= NOW() - INTERVAL '14 days'
          AND sr.created_at <  NOW() - INTERVAL '7 days'
      )::int AS previous_7d,

      COUNT(*) FILTER (
        WHERE sr.created_at >= date_trunc('day', NOW())
      )::int AS today

    FROM sale_requests sr
    WHERE sr.city_id = $1
    `,
    [cityId, SALE_REQUEST_STATUS.RECEIVING_OFFERS]
  );

  return result.rows[0] ?? { total: 0, last_7d: 0, previous_7d: 0, today: 0 };
}

/**
 * Negócios em andamento DESTA loja.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE CONTA COMO "EM ANDAMENTO"
 * ────────────────────────────────────────────────────────────────────────────
 * Uma solicitação de venda cuja oferta SELECIONADA é desta loja, e cujo estado
 * está em `SALE_REQUEST_SELECTED_STATUSES`. É o mesmo conjunto que decide se a
 * loja continua enxergando a oportunidade no detalhe — então o número do hub e
 * a lista que ele resume não podem discordar por construção.
 *
 * `advertiser_id` (a loja), e não `dealer_user_id` (a pessoa): o número descreve
 * o negócio da LOJA. Uma conta com duas lojas vê o painel de uma por vez, e
 * misturar as duas somaria negócios que a tela ao lado não mostra.
 *
 * A janela usa `selected_offer_at` — a data em que o negócio ENTROU em
 * andamento. `created_at` da solicitação seria a data em que o proprietário
 * publicou, que não é um evento desta loja.
 */
export async function countDealsInProgress({ cityId, advertiserId }) {
  const result = await query(
    `
    SELECT
      COUNT(*)::int AS total,

      COUNT(*) FILTER (
        WHERE sr.selected_offer_at >= NOW() - INTERVAL '7 days'
      )::int AS last_7d,

      COUNT(*) FILTER (
        WHERE sr.selected_offer_at >= NOW() - INTERVAL '14 days'
          AND sr.selected_offer_at <  NOW() - INTERVAL '7 days'
      )::int AS previous_7d,

      COUNT(*) FILTER (
        WHERE sr.selected_offer_at >= date_trunc('day', NOW())
      )::int AS today

    FROM sale_requests sr
    JOIN sale_request_offers sel ON sel.id = sr.selected_offer_id
    WHERE sr.city_id = $1
      AND sel.advertiser_id = $2
      AND sr.status = ANY($3::text[])
    `,
    [cityId, advertiserId, SALE_REQUEST_SELECTED_STATUSES]
  );

  return result.rows[0] ?? { total: 0, last_7d: 0, previous_7d: 0, today: 0 };
}
