// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import OpportunityHubMetrics from "./OpportunityHubMetrics";
import {
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
  it("mostram o total e a variação de 7 dias", async () => {
    render(<OpportunityHubMetrics />);
    await screen.findByTestId("dealer-hub-metrics");

    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain("128");
    expect(screen.getByTestId("dealer-hub-metric-buyers").textContent).toContain(
      "+18% nos últimos 7 dias"
    );
    expect(screen.getByTestId("dealer-hub-metric-vehicles").textContent).toContain("76");
    expect(screen.getByTestId("dealer-hub-metric-new-today").textContent).toContain("34");
    expect(screen.getByTestId("dealer-hub-metric-deals").textContent).toContain("22");
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
    expect(card.textContent).toContain("estável nos últimos 7 dias");
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
  it("alta ganha sinal e tom positivo", () => {
    expect(describeTrend({ percent: 18, direction: "up" })).toEqual({
      label: "+18% nos últimos 7 dias",
      tone: "positive",
    });
  });

  it("queda usa o sinal de MENOS tipográfico, não o hífen", () => {
    const result = describeTrend({ percent: 7.5, direction: "down" });

    expect(result.tone).toBe("negative");
    // "−" (U+2212) e não "-": o hífen quebra linha entre o sinal e o número em
    // caixa estreita, e "−" alinha com os dígitos tabulares.
    expect(result.label).toBe("−7,5% nos últimos 7 dias");
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
