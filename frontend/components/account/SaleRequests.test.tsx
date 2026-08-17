// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestDetail from "./SaleRequestDetail";
import SaleRequestsList from "./SaleRequestsList";
import type { SaleRequest } from "@/lib/sale-requests/api";

/**
 * "Vender para lojas" — listagem e detalhe do dono.
 *
 * Mocka o MÓDULO de dados (`@/lib/sale-requests/api`), não o `fetch`, e preserva
 * os helpers puros com `importOriginal`. É a convenção da casa: o teste passa a
 * falar de estados de tela, e os formatadores continuam sendo os de verdade — se
 * `formatFipe` quebrar, isto aqui acusa.
 */

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const listSaleRequests = vi.fn();
const getSaleRequest = vi.fn();
const cancelSaleRequest = vi.fn();

vi.mock("@/lib/sale-requests/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/api")>();
  return {
    ...actual,
    listSaleRequests: (...args: unknown[]) => listSaleRequests(...args),
    getSaleRequest: (...args: unknown[]) => getSaleRequest(...args),
    cancelSaleRequest: (...args: unknown[]) => cancelSaleRequest(...args),
  };
});

function makeRequest(overrides: Partial<SaleRequest> = {}): SaleRequest {
  return {
    id: 1,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: "005340-6",
    fipe_reference_value: "92450.00",
    fipe_reference_at: "2026-08-16T12:00:00.000Z",
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    status: "receiving_offers",
    images: ["/api/vehicle-images?key=sale-requests%2F7%2Fs%2Fa.webp"],
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    created_at: "2026-08-16T12:00:00.000Z",
    updated_at: "2026-08-16T12:00:00.000Z",
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

describe("listagem", () => {
  it("mostra estado de carregamento e depois os cards", async () => {
    listSaleRequests.mockResolvedValue({
      sale_requests: [makeRequest()],
      next_cursor: null,
      limit: 20,
    });

    render(<SaleRequestsList />);
    expect(screen.getByTestId("sale-requests-loading")).toBeInTheDocument();

    await waitFor(() => expect(screen.getByTestId("sale-requests-list")).toBeInTheDocument());
    expect(screen.getByText(/Volkswagen T-Cross/i)).toBeInTheDocument();
    expect(screen.getByText(/Atibaia/)).toBeInTheDocument();
  });

  it("mostra o estado vazio com CTA quando não há solicitações", async () => {
    listSaleRequests.mockResolvedValue({ sale_requests: [], next_cursor: null, limit: 20 });

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-empty")).toBeInTheDocument());

    expect(screen.getByRole("link", { name: /Enviar meu carro para as lojas/i })).toHaveAttribute(
      "href",
      "/dashboard/vender-para-lojas/nova"
    );
  });

  it("mostra erro sem derrubar a tela", async () => {
    listSaleRequests.mockRejectedValue(new Error("backend fora"));

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-error")).toBeInTheDocument());
    expect(screen.getByRole("alert")).toHaveTextContent(/backend fora/i);
  });

  it("formata a referência FIPE em BRL", async () => {
    listSaleRequests.mockResolvedValue({
      sale_requests: [makeRequest()],
      next_cursor: null,
      limit: 20,
    });

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-list")).toBeInTheDocument());

    // `formatFipe` é o helper REAL (preservado por importOriginal).
    expect(screen.getByText(/R\$\s?92\.450/)).toBeInTheDocument();
  });

  it("omite a FIPE quando não foi resolvida", async () => {
    listSaleRequests.mockResolvedValue({
      sale_requests: [makeRequest({ fipe_reference_value: null })],
      next_cursor: null,
      limit: 20,
    });

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-list")).toBeInTheDocument());

    // Sem valor não existe linha de FIPE — nada de "R$ 0" nem "indisponível".
    expect(screen.queryByText(/Referência FIPE/i)).not.toBeInTheDocument();
  });

  it("pagina com 'Carregar mais' e acumula sem repetir", async () => {
    listSaleRequests
      .mockResolvedValueOnce({
        sale_requests: [makeRequest({ id: 1 })],
        next_cursor: "cursor-1",
        limit: 20,
      })
      .mockResolvedValueOnce({
        sale_requests: [makeRequest({ id: 2, model: "Polo" })],
        next_cursor: null,
        limit: 20,
      });

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-list")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("sale-requests-load-more"));

    await waitFor(() => expect(screen.getByText(/Volkswagen Polo/i)).toBeInTheDocument());
    expect(screen.getAllByTestId("sale-request-card")).toHaveLength(2);
    expect(screen.queryByTestId("sale-requests-load-more")).not.toBeInTheDocument();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // O que a Fase 4.1 NÃO pode prometer
  // ─────────────────────────────────────────────────────────────────────────
  it("não mostra contagem de ofertas, maior lance nem loja", async () => {
    listSaleRequests.mockResolvedValue({
      sale_requests: [makeRequest()],
      next_cursor: null,
      limit: 20,
    });

    render(<SaleRequestsList />);
    await waitFor(() => expect(screen.getByTestId("sale-requests-list")).toBeInTheDocument());

    // "0 ofertas" faria a pessoa concluir que ninguém se interessou, quando na
    // verdade a distribuição para lojistas nem foi construída.
    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/ofertas?\b.*\d|\d.*\bofertas?\b/i);
    expect(text).not.toMatch(/maior lance|proposta|whatsapp/i);
  });
});

describe("detalhe", () => {
  it("mostra os dados do veículo e a galeria", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    expect(screen.getByText(/T-Cross 200 TSI/)).toBeInTheDocument();
    expect(screen.getByText("45.000 km")).toBeInTheDocument();
    expect(screen.getByText("Automático")).toBeInTheDocument();
    expect(screen.getByText("Flex")).toBeInTheDocument();
    expect(screen.getByText("Bom")).toBeInTheDocument();
    expect(screen.getByTestId("sale-request-gallery")).toBeInTheDocument();
  });

  it("mostra problemas conhecidos quando existem", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ known_issues: "Ar-condicionado precisa de reparo." }),
    });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());
    expect(screen.getByText(/Ar-condicionado precisa de reparo/)).toBeInTheDocument();
  });

  it("mostra erro quando a solicitação não é do usuário", async () => {
    getSaleRequest.mockRejectedValue(new Error("Solicitação não encontrada."));

    render(<SaleRequestDetail id="99" />);
    await waitFor(() =>
      expect(screen.getByTestId("sale-request-detail-error")).toBeInTheDocument()
    );
    expect(screen.getByRole("alert")).toHaveTextContent(/não encontrada/i);
  });

  it("não mostra placeholder de features futuras", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    const text = document.body.textContent ?? "";
    expect(text).not.toMatch(/0 ofertas|maior lance|aguardando avaliação|avaliação presencial/i);
  });

  it("NÃO mostra nenhum campo de placa", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    expect(document.body.textContent ?? "").not.toMatch(/placa/i);
  });
});

describe("cancelamento", () => {
  it("pede confirmação antes de cancelar", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("sale-request-cancel-button"));

    expect(screen.getByTestId("sale-request-cancel-confirm")).toBeInTheDocument();
    expect(cancelSaleRequest).not.toHaveBeenCalled();
  });

  it("cancela e passa a mostrar o estado cancelado", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });
    cancelSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "cancelled" }),
      changed: true,
    });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("sale-request-cancel-button"));
    await userEvent.click(screen.getByTestId("sale-request-cancel-confirm-button"));

    await waitFor(() =>
      expect(screen.getByTestId("sale-request-cancelled-note")).toBeInTheDocument()
    );

    const badge = screen.getByTestId("sale-request-detail-status");
    expect(within(badge).getByText(/Cancelada/i)).toBeInTheDocument();
    // Cancelada não oferece o botão de novo — não há o que cancelar duas vezes.
    expect(screen.queryByTestId("sale-request-cancel-button")).not.toBeInTheDocument();
  });

  it("permite desistir do cancelamento", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("sale-request-cancel-button"));
    await userEvent.click(screen.getByRole("button", { name: /Manter recebendo ofertas/i }));

    expect(screen.queryByTestId("sale-request-cancel-confirm")).not.toBeInTheDocument();
    expect(cancelSaleRequest).not.toHaveBeenCalled();
  });

  it("mostra erro de cancelamento sem perder os dados da tela", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest() });
    cancelSaleRequest.mockRejectedValue(new Error("Falha de rede."));

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    await userEvent.click(screen.getByTestId("sale-request-cancel-button"));
    await userEvent.click(screen.getByTestId("sale-request-cancel-confirm-button"));

    await waitFor(() =>
      expect(screen.getByTestId("sale-request-detail-cancel-error")).toBeInTheDocument()
    );
    // Os dados continuam na tela: o erro é de uma ação, não da página.
    expect(screen.getByText(/T-Cross 200 TSI/)).toBeInTheDocument();
  });

  it("solicitação já cancelada não oferece a ação", async () => {
    getSaleRequest.mockResolvedValue({ sale_request: makeRequest({ status: "cancelled" }) });

    render(<SaleRequestDetail id="1" />);
    await waitFor(() => expect(screen.getByTestId("sale-request-detail")).toBeInTheDocument());

    expect(screen.queryByTestId("sale-request-cancel-button")).not.toBeInTheDocument();
    expect(screen.getByTestId("sale-request-cancelled-note")).toBeInTheDocument();
  });
});
