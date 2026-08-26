/**
 * Contrato do RESUMO do hub de oportunidades (topo da tela do lojista).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * `trend` PODE SER `null`, E A TELA PRECISA SABER DISSO
 * ════════════════════════════════════════════════════════════════════════════
 * O tipo é `Trend | null` de propósito. `null` significa "não há base de
 * comparação" — a janela anterior de 7 dias foi zero, e qualquer percentual
 * seria divisão por zero ou um "+100%" que descreve 0 → 1 como crescimento de
 * mercado.
 *
 * Um `percent: 0` no lugar do `null` seria pior que errado: a tela desenharia
 * uma etiqueta dizendo "0% nos últimos 7 dias", afirmando estabilidade onde não
 * existe medida nenhuma.
 */

const BASE = "/api/account/opportunities/summary";

export type OpportunityTrendDirection = "up" | "down" | "flat";

export type OpportunityTrend = {
  /** SEMPRE positivo — o sinal vive em `direction`. */
  percent: number;
  direction: OpportunityTrendDirection;
};

export type OpportunityMetric = {
  total: number;
  trend: OpportunityTrend | null;
};

export type DealerOpportunitiesSummary = {
  /** Procuras ativas e não vencidas na cidade da loja. */
  active_buyers: OpportunityMetric;
  /** Solicitações de venda em `receiving_offers` na cidade da loja. */
  sale_requests: OpportunityMetric;
  /** Entradas de HOJE nos dois produtos, somadas. */
  new_today: OpportunityMetric;
  /** Negócios em que a oferta selecionada é DESTA loja. */
  deals_in_progress: OpportunityMetric;
};

export class OpportunitiesSummaryError extends Error {
  status: number;
  code: string | null;

  constructor(message: string, status: number, code: string | null) {
    super(message);
    this.name = "OpportunitiesSummaryError";
    this.status = status;
    this.code = code;
  }
}

export async function fetchOpportunitiesSummary(
  advertiserId?: string | number | null
): Promise<DealerOpportunitiesSummary> {
  const suffix =
    advertiserId != null && String(advertiserId) !== ""
      ? `?advertiser_id=${encodeURIComponent(String(advertiserId))}`
      : "";

  const response = await fetch(`${BASE}${suffix}`, { cache: "no-store" });
  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; message?: string; code?: string; details?: { code?: string }; summary?: DealerOpportunitiesSummary }
    | null;

  if (!response.ok || payload?.success === false || !payload?.summary) {
    throw new OpportunitiesSummaryError(
      payload?.message || "Não foi possível carregar o resumo.",
      response.status,
      payload?.details?.code ?? payload?.code ?? null
    );
  }

  return payload.summary;
}

/**
 * A explicação da tendência, para `title` / leitor de tela.
 *
 * Uma frase, e a mesma para os quatro cartões: o que muda entre eles é O QUE
 * entrou, não COMO a comparação é feita.
 */
export const TREND_EXPLANATION =
  "Compara as novas oportunidades recebidas nos últimos 7 dias com os 7 dias anteriores.";

/**
 * "+18% novas entradas" — ou a frase neutra, quando não há base.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE NÃO "+18% NOS ÚLTIMOS 7 DIAS"
 * ════════════════════════════════════════════════════════════════════════════
 * Era a redação anterior, e ela dizia algo falso ao lado do número principal.
 *
 * "Compradores ativos / 128 / +18% nos últimos 7 dias" se lê como "há 18% mais
 * compradores ativos do que havia há 7 dias". Não é isso que a conta faz: 128 é
 * o ESTOQUE atual (procuras ativas e não vencidas), e os 18% comparam quantas
 * procuras ENTRARAM nesta janela contra a janela anterior. As duas coisas podem
 * andar em direções opostas — o estoque cai enquanto a entrada acelera, se
 * muitas vencerem no mesmo período.
 *
 * `entriesLabel` diz explicitamente que a variação é de FLUXO, não de estoque. E
 * é parâmetro, e não constante, porque o que entra é diferente em cada cartão:
 * procuras e solicitações são "novas entradas"; negócios fechados são "novas
 * compras". Um rótulo único obrigaria o de compras a mentir por generalidade.
 *
 * A frase de ausência NÃO é "0%" nem "—": ela diz por que não há número. Um
 * traço obrigaria o lojista a adivinhar se a métrica caiu a zero ou se o
 * sistema não conseguiu calcular, e as duas leituras levam a decisões opostas.
 */
export function describeTrend(
  trend: OpportunityTrend | null,
  entriesLabel = "novas entradas"
): {
  label: string;
  tone: "positive" | "negative" | "neutral";
} {
  if (!trend) {
    return { label: "sem base de comparação", tone: "neutral" };
  }

  if (trend.direction === "flat") {
    return { label: `${entriesLabel} estáveis`, tone: "neutral" };
  }

  // O "%" é concatenado à mão em vez de `style: "percent"`: o formatador do Intl
  // insere um espaço estreito inseparável antes do símbolo em pt-BR, e ele já
  // quebrou asserção de texto neste projeto.
  const value = trend.percent.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });

  return {
    label: `${trend.direction === "up" ? "+" : "−"}${value}% ${entriesLabel}`,
    tone: trend.direction === "up" ? "positive" : "negative",
  };
}
