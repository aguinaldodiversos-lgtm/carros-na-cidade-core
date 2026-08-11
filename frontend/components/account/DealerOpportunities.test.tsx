// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerOpportunitiesList from "./DealerOpportunitiesList";
import DealerOpportunityDetail from "./DealerOpportunityDetail";
import type { DealerOpportunity } from "@/lib/purchase-intents/api";

/**
 * "Compradores ativos" — a superfície do lojista.
 *
 * Além dos estados de tela, este arquivo trava duas coisas que definem o
 * produto: a ausência TOTAL de identidade do comprador na tela, e a ausência
 * dos elementos da Fase 3 (enviar veículo, WhatsApp, agendar). Um botão desses
 * aparecendo aqui prometeria um fluxo inexistente.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchDealerOpportunities = vi.fn();
const fetchDealerOpportunity = vi.fn();

vi.mock("@/lib/purchase-intents/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/api")>();
  return {
    ...actual,
    fetchDealerOpportunities: (...args: unknown[]) => fetchDealerOpportunities(...args),
    fetchDealerOpportunity: (...args: unknown[]) => fetchDealerOpportunity(...args),
  };
});

function makeOpportunity(overrides: Partial<DealerOpportunity> = {}): DealerOpportunity {
  return {
    id: 1,
    intent_type: "specific_model",
    brand: "Volkswagen",
    model: "T-Cross",
    body_type: null,
    transmission: "automatico",
    max_price: "95000.00",
    purchase_timeframe: "within_30_days",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchDealerOpportunities.mockResolvedValue({
    purchase_intents: [],
    next_cursor: null,
    limit: 20,
  });
  fetchDealerOpportunity.mockResolvedValue(makeOpportunity());
});

afterEach(cleanup);

describe("DealerOpportunitiesList — estados", () => {
  it("carrega e some o spinner", async () => {
    render(<DealerOpportunitiesList />);
    expect(screen.getByText(/Carregando compradores/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchDealerOpportunities).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Carregando compradores/i)).not.toBeInTheDocument()
    );
  });

  it("cidade sem comprador mostra estado vazio, não erro", async () => {
    render(<DealerOpportunitiesList />);
    const empty = await screen.findByTestId("dealer-opportunities-empty");
    expect(empty).toHaveTextContent(/Nenhum comprador ativo na sua cidade no momento/i);
    expect(screen.queryByTestId("dealer-opportunities-error")).not.toBeInTheDocument();
  });

  it("lista os cards com o veículo procurado e a cidade", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      purchase_intents: [makeOpportunity()],
      next_cursor: null,
      limit: 20,
    });
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("dealer-opportunity-card");
    expect(card).toHaveTextContent("Volkswagen T-Cross");
    expect(card).toHaveTextContent("Automático");
    expect(card).toHaveTextContent("Até R$ 95.000");
    expect(card).toHaveTextContent("Atibaia - SP");
    expect(screen.getByRole("link", { name: /Ver oportunidade/i })).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/compradores/1"
    );
  });

  it("modo aberto mostra a carroceria", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      purchase_intents: [
        makeOpportunity({
          intent_type: "open_category",
          brand: null,
          model: null,
          body_type: "suv",
        }),
      ],
      next_cursor: null,
      limit: 20,
    });
    render(<DealerOpportunitiesList />);
    expect(await screen.findByTestId("dealer-opportunity-card")).toHaveTextContent("SUV");
  });

  it("erro mostra retry e o retry refaz a busca", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockRejectedValueOnce(new Error("backend fora"));
    render(<DealerOpportunitiesList />);

    expect(await screen.findByTestId("dealer-opportunities-error")).toHaveTextContent(
      "backend fora"
    );

    fetchDealerOpportunities.mockResolvedValue({
      purchase_intents: [makeOpportunity()],
      next_cursor: null,
      limit: 20,
    });
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(await screen.findByTestId("dealer-opportunity-card")).toBeVisible();
  });

  it("NÃO envia city_id — quem decide a cidade é o backend", async () => {
    render(<DealerOpportunitiesList />);
    await waitFor(() => expect(fetchDealerOpportunities).toHaveBeenCalled());

    // O único argumento é o CURSOR de paginação (null na primeira página).
    // Nenhuma cidade sai do cliente — se saísse, o lojista escolheria o que vê.
    expect(fetchDealerOpportunities).toHaveBeenCalledWith(null);
    for (const call of fetchDealerOpportunities.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/city|cidade/i);
    }
  });

  it("mobile: card trunca o título e o CTA tem 44px", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      purchase_intents: [makeOpportunity({ model: "Modelo Muito Longo Para Estourar A Largura" })],
      next_cursor: null,
      limit: 20,
    });
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("dealer-opportunity-card");
    expect(card.querySelector("h3")?.className).toContain("truncate");
    expect(screen.getByRole("link", { name: /Ver oportunidade/i }).className).toContain("h-11");
  });
});

describe("privacidade do comprador na TELA do lojista", () => {
  const PII = /nome|e-?mail|telefone|whatsapp|cpf|contato|falar com/i;

  it("o card não exibe nada que identifique o comprador", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      purchase_intents: [makeOpportunity()],
      next_cursor: null,
      limit: 20,
    });
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("dealer-opportunity-card");
    expect(card.textContent || "").not.toMatch(PII);
  });

  it("o detalhe não exibe nada que identifique o comprador", async () => {
    render(<DealerOpportunityDetail id={1} />);
    const detail = await screen.findByTestId("dealer-opportunity-detail");
    expect(detail.textContent || "").not.toMatch(PII);
  });
});

describe("DealerOpportunityDetail", () => {
  it("mostra os dados da procura", async () => {
    render(<DealerOpportunityDetail id={1} />);

    expect(await screen.findByTestId("dealer-opportunity-detail")).toBeVisible();
    expect(screen.getByText(/Comprador procura/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Volkswagen T-Cross");
    expect(screen.getByText("Até R$ 95.000")).toBeVisible();
    expect(screen.getByText("Atibaia - SP")).toBeVisible();
    expect(screen.getByText("Em até 30 dias")).toBeVisible();
  });

  it("NÃO traz nada da Fase 3 — sem enviar veículo, sem WhatsApp, sem agendar", async () => {
    render(<DealerOpportunityDetail id={1} />);
    await screen.findByTestId("dealer-opportunity-detail");

    expect(screen.queryByText(/enviar ve[íi]culo/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agendar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pr[óo]xima etapa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
    // Nem contagem de estoque compatível (matching é Fase 3).
    expect(screen.queryByText(/compat[íi]ve/i)).not.toBeInTheDocument();
  });

  it("404 de outra cidade vira estado de erro sem revelar existência", async () => {
    fetchDealerOpportunity.mockRejectedValue(new Error("Oportunidade não encontrada."));
    render(<DealerOpportunityDetail id={999} />);

    const box = await screen.findByTestId("dealer-opportunity-error");
    expect(box).toHaveTextContent("Oportunidade não encontrada.");
    // A mensagem não diz "de outra cidade".
    expect(box.textContent || "").not.toMatch(/cidade|Atibaia|Bragan/i);
    expect(screen.getByRole("link", { name: /Voltar para compradores ativos/i })).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/compradores"
    );
  });
});
