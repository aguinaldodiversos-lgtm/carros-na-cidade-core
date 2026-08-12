// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerOpportunitiesList from "./DealerOpportunitiesList";
import PurchaseIntentsList from "./PurchaseIntentsList";
import type { DealerOpportunity, PurchaseIntent } from "@/lib/purchase-intents/api";

/**
 * Paginação "Carregar mais" nas duas listas (Fase 2.1).
 *
 * A API já paginava por cursor desde a Fase 2; o frontend consumia só a primeira
 * página. O que estes testes travam é o comportamento que faz a diferença entre
 * paginação e "some depois do 20º": APPEND (não substituição), dedup por id,
 * preservação da lista quando a página 2 falha, e um único request por clique.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMyPurchaseIntents = vi.fn();
const fetchDealerOpportunities = vi.fn();

vi.mock("@/lib/purchase-intents/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/api")>();
  return {
    ...actual,
    fetchMyPurchaseIntents: (...args: unknown[]) => fetchMyPurchaseIntents(...args),
    fetchDealerOpportunities: (...args: unknown[]) => fetchDealerOpportunities(...args),
  };
});

function makeIntent(id: number): PurchaseIntent {
  return {
    id,
    intent_type: "specific_model",
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: `Modelo ${id}`,
    model_slug: `modelo-${id}`,
    body_type: null,
    transmission: "automatico",
    max_price: "95000.00",
    purchase_timeframe: "within_30_days",
    status: "active",
    display_status: "active",
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
  };
}

function makeOpportunity(id: number): DealerOpportunity {
  return {
    id,
    intent_type: "specific_model",
    brand: "Volkswagen",
    model: `Modelo ${id}`,
    body_type: null,
    transmission: "automatico",
    max_price: "95000.00",
    purchase_timeframe: "within_30_days",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
  };
}

function range(from: number, count: number) {
  return Array.from({ length: count }, (_, i) => from + i);
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

/**
 * Os dois cenários são idênticos em comportamento — só mudam o componente, o
 * fetcher e o testid do card. Rodar a MESMA bateria nos dois é o ponto: PF e PJ
 * compartilham o hook, e um `it.each` prova que a partilha não quebrou nenhum
 * dos lados.
 */
const SCENARIOS = [
  {
    name: "PF — Minhas procuras",
    render: () => render(<PurchaseIntentsList />),
    fetcher: fetchMyPurchaseIntents,
    cardTestId: "purchase-intent-card",
    makeItem: (id: number) => makeIntent(id) as PurchaseIntent | DealerOpportunity,
  },
  {
    name: "PJ — Compradores ativos",
    render: () => render(<DealerOpportunitiesList />),
    fetcher: fetchDealerOpportunities,
    cardTestId: "dealer-opportunity-card",
    makeItem: (id: number) => makeOpportunity(id) as PurchaseIntent | DealerOpportunity,
  },
] as const;

describe.each(SCENARIOS)("$name — paginação", (scenario) => {
  function page(ids: number[], nextCursor: string | null) {
    return {
      purchase_intents: ids.map(scenario.makeItem),
      next_cursor: nextCursor,
      limit: 20,
    };
  }

  it("mostra o botão quando há next_cursor e busca a página 1 sem cursor", async () => {
    scenario.fetcher.mockResolvedValueOnce(page(range(1, 20), "cursor-p2"));
    scenario.render();

    expect(await screen.findByTestId("load-more")).toBeVisible();
    expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(20);
    // Primeira página vai sem cursor.
    expect(scenario.fetcher).toHaveBeenCalledWith(null);
  });

  it("clicar acrescenta a página 2 e remove o botão no fim (20 + 5 = 25)", async () => {
    const user = userEvent.setup();
    scenario.fetcher
      .mockResolvedValueOnce(page(range(1, 20), "cursor-p2"))
      .mockResolvedValueOnce(page(range(21, 5), null));

    scenario.render();
    await screen.findByTestId("load-more");

    await user.click(screen.getByTestId("load-more"));

    await waitFor(async () =>
      expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(25)
    );
    // O cursor da página 1 é repassado opaco.
    expect(scenario.fetcher).toHaveBeenLastCalledWith("cursor-p2");
    // next_cursor null → o botão some, não fica desabilitado para sempre.
    await waitFor(() => expect(screen.queryByTestId("load-more")).not.toBeInTheDocument());
  });

  it("APPEND, não substituição — os itens da página 1 continuam na tela", async () => {
    const user = userEvent.setup();
    scenario.fetcher
      .mockResolvedValueOnce(page(range(1, 20), "cursor-p2"))
      .mockResolvedValueOnce(page(range(21, 5), null));

    scenario.render();
    await screen.findByTestId("load-more");
    await user.click(screen.getByTestId("load-more"));

    await screen.findByText("Volkswagen Modelo 25");
    // O primeiro item da página 1 continua lá.
    expect(screen.getByText("Volkswagen Modelo 1")).toBeVisible();
  });

  it("DEDUP: id repetido na página 2 aparece uma única vez", async () => {
    const user = userEvent.setup();
    scenario.fetcher
      .mockResolvedValueOnce(page(range(1, 20), "cursor-p2"))
      // 20 já veio na página 1; 21 e 22 são novos.
      .mockResolvedValueOnce(page([20, 21, 22], null));

    scenario.render();
    await screen.findByTestId("load-more");
    await user.click(screen.getByTestId("load-more"));

    await waitFor(async () =>
      expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(22)
    );
    expect(screen.getAllByText("Volkswagen Modelo 20")).toHaveLength(1);
  });

  it("erro na página 2 PRESERVA a página 1 e oferece retry", async () => {
    const user = userEvent.setup();
    scenario.fetcher
      .mockResolvedValueOnce(page(range(1, 20), "cursor-p2"))
      .mockRejectedValueOnce(new Error("Erro 500"));

    scenario.render();
    await screen.findByTestId("load-more");
    await user.click(screen.getByTestId("load-more"));

    expect(await screen.findByTestId("load-more-error")).toHaveTextContent("Erro 500");
    // Os 20 itens continuam na tela — a lista não foi apagada.
    expect(screen.getAllByTestId(scenario.cardTestId)).toHaveLength(20);
    // E o estado de erro da tela INTEIRA não foi acionado.
    expect(screen.queryByTestId("purchase-intents-error")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dealer-opportunities-error")).not.toBeInTheDocument();

    // Retry no mesmo cursor funciona.
    scenario.fetcher.mockResolvedValueOnce(page(range(21, 5), null));
    await user.click(screen.getByTestId("load-more"));

    await waitFor(async () =>
      expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(25)
    );
    expect(screen.queryByTestId("load-more-error")).not.toBeInTheDocument();
  });

  it("clique duplo NÃO dispara duas requests concorrentes", async () => {
    const user = userEvent.setup();
    let resolvePage2: ((value: unknown) => void) | undefined;

    scenario.fetcher.mockResolvedValueOnce(page(range(1, 20), "cursor-p2")).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage2 = resolve;
        })
    );

    scenario.render();
    await screen.findByTestId("load-more");

    const button = screen.getByTestId("load-more");
    await user.click(button);
    // Enquanto a primeira request está pendente o botão fica desabilitado, e o
    // guard de request em voo cobre o caso em que o clique escapa mesmo assim.
    await waitFor(() => expect(button).toBeDisabled());
    await user.click(button);

    // 1 chamada da página 1 + 1 da página 2 = 2. Nunca 3.
    expect(scenario.fetcher).toHaveBeenCalledTimes(2);

    resolvePage2?.(page(range(21, 5), null));
    await waitFor(async () =>
      expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(25)
    );
  });

  it("lista vazia não mostra o botão", async () => {
    scenario.fetcher.mockResolvedValueOnce(page([], null));
    scenario.render();

    await waitFor(() => expect(scenario.fetcher).toHaveBeenCalled());
    expect(screen.queryByTestId("load-more")).not.toBeInTheDocument();
  });

  it("página única (next_cursor null) não mostra o botão", async () => {
    scenario.fetcher.mockResolvedValueOnce(page(range(1, 3), null));
    scenario.render();

    expect(await screen.findAllByTestId(scenario.cardTestId)).toHaveLength(3);
    expect(screen.queryByTestId("load-more")).not.toBeInTheDocument();
  });

  it("o botão é um <button> real, acessível e com largura confortável no mobile", async () => {
    scenario.fetcher.mockResolvedValueOnce(page(range(1, 20), "cursor-p2"));
    scenario.render();

    const button = await screen.findByTestId("load-more");
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();
    // 48px de altura, largura total no mobile e automática a partir de sm.
    expect(button.className).toContain("h-12");
    expect(button.className).toContain("w-full");
    expect(button.className).toContain("sm:w-auto");
  });

  it("durante o carregamento o botão fica desabilitado e anuncia o estado", async () => {
    const user = userEvent.setup();
    let resolvePage2: ((value: unknown) => void) | undefined;

    scenario.fetcher.mockResolvedValueOnce(page(range(1, 20), "cursor-p2")).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolvePage2 = resolve;
        })
    );

    scenario.render();
    await screen.findByTestId("load-more");
    await user.click(screen.getByTestId("load-more"));

    const button = screen.getByTestId("load-more");
    await waitFor(() => expect(button).toBeDisabled());
    expect(button).toHaveAttribute("aria-busy", "true");
    expect(button).toHaveTextContent(/Carregando/i);

    resolvePage2?.(page(range(21, 5), null));
    await waitFor(() => expect(screen.queryByTestId("load-more")).not.toBeInTheDocument());
  });
});
