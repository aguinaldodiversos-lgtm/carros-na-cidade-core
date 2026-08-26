// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpportunityHubMetrics from "./OpportunityHubMetrics";
import {
  TREND_EXPLANATION,
  describeTrend,
  type DealerOpportunitiesSummary,
} from "@/lib/account/opportunities-summary";

/**
 * A faixa de métricas do hub.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O QUE ESTE ARQUIVO TRAVA
 * ════════════════════════════════════════════════════════════════════════════
 * As três decisões que separam "resumo honesto" de "etiqueta verde decorativa":
 *
 *   1. ausência de base NÃO vira "0%";
 *   2. falha de carregamento NÃO vira zero;
 *   3. a direção é comunicada por TEXTO, e não só por cor.
 *
 * A geometria (quatro numa linha, alinhamento dos números) é provada no
 * navegador, em `e2e/dealer-opportunities-hub.spec.ts` — jsdom não tem layout.
 */

const fetchOpportunitiesSummary = vi.fn();

vi.mock("@/lib/account/opportunities-summary", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/account/opportunities-summary")>();
  return {
    ...actual,
    fetchOpportunitiesSummary: (...args: unknown[]) => fetchOpportunitiesSummary(...args),
  };
});

function makeSummary(overrides: Partial<DealerOpportunitiesSummary> = {}): DealerOpportunitiesSummary {
  return {
    active_buyers: { total: 128, trend: { percent: 18, direction: "up" } },
    sale_requests: { total: 76, trend: { percent: 12, direction: "up" } },
    new_today: { total: 34, trend: { percent: 9, direction: "up" } },
    deals_in_progress: { total: 22, trend: { percent: 5, direction: "up" } },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchOpportunitiesSummary.mockResolvedValue(makeSummary());
});

afterEach(cleanup);

// ============================================================================
describe("os quatro números", () => {
  it("mostram o total e a variação", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain("128");
    expect(screen.getByTestId("dealer-hub-metric-vehicles").textContent).toContain("76");
    expect(screen.getByTestId("dealer-hub-metric-new-today").textContent).toContain("34");
    expect(screen.getByTestId("dealer-hub-metric-deals").textContent).toContain("22");
  });

  /**
   * §2 — O RÓTULO DO QUARTO CARTÃO.
   *
   * A fonte conta UMA coisa: solicitações de venda cuja oferta selecionada é
   * desta loja — o lado COMPRA. "Negócios" abrangeria também as ofertas
   * enviadas a compradores ativos, que não estão ali (e não podem estar:
   * `purchase_intent_offers` não tem ciclo de vida que distinga viva de
   * abandonada).
   *
   * A asserção negativa é a que trava a regressão: o rótulo antigo continuaria
   * "funcionando" na tela, apenas descrevendo mais do que conta.
   */
  it("§2 — o quarto cartão é 'Compras em andamento', nunca 'Negócios'", async () => {
    render(<OpportunityHubMetrics />);
    const strip = await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-deals").textContent).toContain(
      "Compras em andamento"
    );
    expect(strip.textContent).not.toContain("Negócios em andamento");
    expect(strip.textContent).not.toContain("Negociações em andamento");
    expect(strip.textContent).not.toContain("Vendas em andamento");
  });

  /**
   * §4/§5 — A TENDÊNCIA MEDE FLUXO, E O TEXTO PRECISA DIZER ISSO.
   *
   * "128 / +18% nos últimos 7 dias" se lia como "há 18% mais compradores ativos
   * do que há 7 dias". Falso: 128 é o ESTOQUE atual e os 18% comparam quantas
   * procuras ENTRARAM na janela contra a anterior. As duas podem andar em
   * direções opostas.
   */
  it("§5 — os cartões de estoque dizem 'novas entradas'", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain(
      "+18% novas entradas"
    );
    expect(screen.getByTestId("dealer-hub-metric-vehicles").textContent).toContain(
      "+12% novas entradas"
    );

    // A redação antiga não pode voltar por nenhum caminho.
    expect(
      screen.getByTestId("dealer-hub-metrics").textContent
    ).not.toContain("nos últimos 7 dias");
  });

  /**
   * §8 — "Novas oportunidades hoje" DECLARA a janela.
   *
   * É o único cartão em que número e tendência falam de períodos diferentes: o
   * número conta HOJE, a tendência compara semanas. Sem "em 7 dias", "+9% novas
   * entradas" embaixo de um número diário se leria como "9% a mais que ontem" —
   * e a conta não é essa.
   */
  it("§8 — o cartão de hoje declara a janela da tendência", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-new-today").textContent).toContain(
      "+9% novas entradas em 7 dias"
    );
    // E NÃO promete uma comparação com ontem, que o backend não faz.
    expect(screen.getByTestId("dealer-hub-metric-new-today").textContent).not.toContain(
      "ontem"
    );
  });

  /** §9 — o que entra em "Compras em andamento" são COMPRAS, não entradas. */
  it("§9 — o cartão de compras diz 'novas compras'", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    const card = screen.getByTestId("dealer-hub-metric-deals");
    expect(card.textContent).toContain("+5% novas compras");
    // "+5% compras em andamento" pareceria variação do ESTOQUE atual, e a conta
    // mede quantas ENTRARAM em andamento na janela.
    expect(card.textContent).not.toContain("+5% compras em andamento");
  });

  /** §6 — a janela da comparação fica explicada, sem biblioteca de tooltip. */
  it("§6 — a tendência carrega a explicação da janela", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    const card = screen.getByTestId("dealer-hub-metric-buyers");
    // Alvo explícito: o RÓTULO do cartão também carrega um `title` (o `hint` do
    // que o número conta), e um `querySelector("[title]")` pegaria o primeiro.
    const trend = card.querySelector('[data-testid="dealer-hub-trend"]');

    expect(trend?.getAttribute("title")).toBe(TREND_EXPLANATION);
    expect(trend?.getAttribute("aria-label")).toContain(TREND_EXPLANATION);
    expect(TREND_EXPLANATION).toContain("últimos 7 dias");
    expect(TREND_EXPLANATION).toContain("7 dias anteriores");
  });

  it("milhar sai formatado em pt-BR", async () => {
    fetchOpportunitiesSummary.mockResolvedValue(
      makeSummary({ active_buyers: { total: 1284, trend: null } })
    );

    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain("1.284");
  });

  it("só busca UMA vez ao montar", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    // A faixa resume a cidade inteira; uma busca por cartão seria quatro idas ao
    // servidor para montar uma régua de quatro números.
    expect(fetchOpportunitiesSummary).toHaveBeenCalledTimes(1);
  });
});

// ============================================================================
describe("ausência de base de comparação", () => {
  it("não desenha percentual nenhum — nem '0%'", async () => {
    fetchOpportunitiesSummary.mockResolvedValue(
      makeSummary({
        active_buyers: { total: 1, trend: null },
        sale_requests: { total: 0, trend: null },
        new_today: { total: 0, trend: null },
        deals_in_progress: { total: 0, trend: null },
      })
    );

    render(<OpportunityHubMetrics />);
    const strip = await screen.findByTestId("dealer-hub-metrics");

    expect(strip.textContent).toContain("sem base de comparação");
    // "0%" afirmaria estabilidade onde não existe medida nenhuma.
    expect(strip.textContent).not.toContain("%");
    expect(strip.textContent).not.toContain("▲");
  });

  it("estável é dito em palavras, sem seta verde", async () => {
    fetchOpportunitiesSummary.mockResolvedValue(
      makeSummary({ active_buyers: { total: 9, trend: { percent: 0, direction: "flat" } } })
    );

    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    const card = screen.getByTestId("dealer-hub-metric-buyers");
    // "novas entradas estáveis" — o sujeito continua sendo o FLUXO, e não o
    // estoque. "Estável nos últimos 7 dias" diria que o número 9 não mudou.
    expect(card.textContent).toContain("novas entradas estáveis");
    expect(card.textContent).not.toContain("▲");
  });
});

// ============================================================================
describe("falha de carregamento", () => {
  it("some com a faixa e oferece nova tentativa — nunca mostra zero", async () => {
    fetchOpportunitiesSummary.mockRejectedValue(new Error("503"));

    render(<OpportunityHubMetrics />);
    const error = await screen.findByTestId("dealer-hub-metrics-error");

    expect(error.textContent).toContain("Não foi possível carregar o resumo");
    /*
      Zero seria PIOR que ausência: o lojista leria "não há compradores na minha
      cidade" e fecharia a tela. A asserção é sobre a faixa inteira não existir.
    */
    expect(screen.queryByTestId("dealer-hub-metrics")).toBeNull();
    expect(error.textContent).not.toContain("0");
  });

  it("'Tentar novamente' refaz a busca e recupera a faixa", async () => {
    fetchOpportunitiesSummary.mockRejectedValueOnce(new Error("503"));
    fetchOpportunitiesSummary.mockResolvedValueOnce(makeSummary());

    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics-error");

    await userEvent.click(screen.getByRole("button", { name: "Tentar novamente" }));

    await waitFor(() => expect(screen.getByTestId("dealer-hub-metrics")).toBeTruthy());
    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain("128");
  });
});

// ============================================================================
describe("describeTrend", () => {
  it("alta ganha sinal, tom positivo e o rótulo do que ENTROU", () => {
    expect(describeTrend({ percent: 18, direction: "up" })).toEqual({
      label: "+18% novas entradas",
      tone: "positive",
    });
  });

  it("o rótulo do fluxo é parametrizável — cada cartão conta uma coisa", () => {
    expect(describeTrend({ percent: 5, direction: "up" }, "novas compras").label).toBe(
      "+5% novas compras"
    );
    expect(
      describeTrend({ percent: 9, direction: "up" }, "novas entradas em 7 dias").label
    ).toBe("+9% novas entradas em 7 dias");
  });

  it("queda usa o sinal de MENOS tipográfico, não o hífen", () => {
    const result = describeTrend({ percent: 7.5, direction: "down" });

    expect(result.tone).toBe("negative");
    // "−" (U+2212) e não "-": o hífen quebra linha entre o sinal e o número em
    // caixa estreita, e "−" alinha com os dígitos tabulares.
    expect(result.label).toBe("−7,5% novas entradas");
  });

  it("sem tendência a frase explica a ausência, e não a finge", () => {
    expect(describeTrend(null)).toEqual({
      label: "sem base de comparação",
      tone: "neutral",
    });
  });

  it("o percentual não carrega espaço estreito do Intl antes do '%'", () => {
    const label = describeTrend({ percent: 12, direction: "up" }).label;

    // `style: "percent"` do Intl insere U+202F em pt-BR, e ele já quebrou
    // asserção de texto neste projeto.
    expect(label).toContain("12%");
    expect(label).not.toMatch(/ | /);
  });
});
