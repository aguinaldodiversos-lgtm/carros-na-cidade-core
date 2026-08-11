// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PurchaseIntentDetail from "./PurchaseIntentDetail";
import PurchaseIntentsList from "./PurchaseIntentsList";
import type { PurchaseIntent } from "@/lib/purchase-intents/api";

/**
 * "Minhas procuras" — listagem e detalhe do comprador.
 *
 * Mocka o MÓDULO de dados (`@/lib/purchase-intents/api`), não o `fetch`, e
 * preserva os helpers puros com `importOriginal`. É a convenção da casa: o
 * teste passa a falar de estados de tela, e os formatadores continuam sendo os
 * de verdade — se `formatMaxPrice` quebrar, isto aqui acusa.
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
}));

const fetchMyPurchaseIntents = vi.fn();
const fetchMyPurchaseIntent = vi.fn();
const closePurchaseIntent = vi.fn();

vi.mock("@/lib/purchase-intents/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/api")>();
  return {
    ...actual,
    fetchMyPurchaseIntents: (...args: unknown[]) => fetchMyPurchaseIntents(...args),
    fetchMyPurchaseIntent: (...args: unknown[]) => fetchMyPurchaseIntent(...args),
    closePurchaseIntent: (...args: unknown[]) => closePurchaseIntent(...args),
  };
});

function makeIntent(overrides: Partial<PurchaseIntent> = {}): PurchaseIntent {
  return {
    id: 1,
    intent_type: "specific_model",
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
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
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchMyPurchaseIntents.mockResolvedValue({
    purchase_intents: [],
    next_cursor: null,
    limit: 20,
  });
  fetchMyPurchaseIntent.mockResolvedValue(makeIntent());
  closePurchaseIntent.mockResolvedValue(makeIntent({ status: "closed", display_status: "closed" }));
});

afterEach(cleanup);

describe("PurchaseIntentsList — estados", () => {
  it("mostra o carregamento e depois some", async () => {
    render(<PurchaseIntentsList />);
    expect(screen.getByText(/Carregando suas procuras/i)).toBeInTheDocument();
    await waitFor(() => expect(fetchMyPurchaseIntents).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByText(/Carregando suas procuras/i)).not.toBeInTheDocument()
    );
  });

  it("vazio traz a copy e o CTA — ausência não é erro", async () => {
    render(<PurchaseIntentsList />);
    expect(await screen.findByTestId("purchase-intents-empty")).toBeVisible();
    expect(screen.getByText(/Você ainda não publicou nenhuma procura/i)).toBeVisible();
    expect(screen.getByTestId("purchase-intents-new")).toHaveAttribute(
      "href",
      "/dashboard/minhas-procuras/nova"
    );
    // Estado vazio não pode ser confundido com falha.
    expect(screen.queryByTestId("purchase-intents-error")).not.toBeInTheDocument();
  });

  it("lista os cards com critérios, cidade e status", async () => {
    fetchMyPurchaseIntents.mockResolvedValue({
      purchase_intents: [makeIntent()],
      next_cursor: null,
      limit: 20,
    });
    render(<PurchaseIntentsList />);

    const card = await screen.findByTestId("purchase-intent-card");
    expect(card).toHaveTextContent("Volkswagen T-Cross");
    expect(card).toHaveTextContent("Automático");
    expect(card).toHaveTextContent("Até R$ 95.000");
    expect(card).toHaveTextContent("Atibaia - SP");
    expect(card).toHaveTextContent("Ativa");
    expect(screen.getByRole("link", { name: /Ver procura/i })).toHaveAttribute(
      "href",
      "/dashboard/minhas-procuras/1"
    );
  });

  it("NÃO promete veículos recebidos — purchase_intent_offers não existe", async () => {
    fetchMyPurchaseIntents.mockResolvedValue({
      purchase_intents: [makeIntent()],
      next_cursor: null,
      limit: 20,
    });
    render(<PurchaseIntentsList />);
    await screen.findByTestId("purchase-intent-card");
    expect(screen.queryByText(/veículos? recebidos?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/ofertas?/i)).not.toBeInTheDocument();
  });

  it("erro mostra caixa com retry, e o retry refaz a busca", async () => {
    const user = userEvent.setup();
    fetchMyPurchaseIntents.mockRejectedValueOnce(new Error("backend fora"));
    render(<PurchaseIntentsList />);

    const box = await screen.findByTestId("purchase-intents-error");
    expect(box).toHaveTextContent("backend fora");

    fetchMyPurchaseIntents.mockResolvedValue({
      purchase_intents: [makeIntent()],
      next_cursor: null,
      limit: 20,
    });
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(await screen.findByTestId("purchase-intent-card")).toBeVisible();
  });

  it.each([
    ["closed", "Encerrada"],
    ["expired", "Expirada"],
  ] as const)("card com display_status=%s mostra '%s'", async (status, label) => {
    fetchMyPurchaseIntents.mockResolvedValue({
      purchase_intents: [makeIntent({ display_status: status })],
      next_cursor: null,
      limit: 20,
    });
    render(<PurchaseIntentsList />);
    expect(await screen.findByTestId("purchase-intent-status")).toHaveTextContent(label);
  });

  it("mobile: CTA ocupa a largura toda e vira automático a partir de sm", async () => {
    // jsdom não aplica CSS; o contrato responsivo é verificado na classe.
    render(<PurchaseIntentsList />);
    const cta = await screen.findByTestId("purchase-intents-new");
    expect(cta.className).toContain("w-full");
    expect(cta.className).toContain("sm:w-auto");
    expect(cta.className).toContain("h-12");
  });

  it("mobile: o card trunca o título em vez de vazar a largura", async () => {
    fetchMyPurchaseIntents.mockResolvedValue({
      purchase_intents: [makeIntent({ model: "Modelo Absurdamente Longo Para Testar Overflow" })],
      next_cursor: null,
      limit: 20,
    });
    render(<PurchaseIntentsList />);
    const card = await screen.findByTestId("purchase-intent-card");
    const title = card.querySelector("h3");
    expect(title?.className).toContain("truncate");
    expect(card.querySelector(".min-w-0")).not.toBeNull();
  });
});

describe("PurchaseIntentDetail", () => {
  it("mostra os critérios e a mensagem de procura ativa", async () => {
    render(<PurchaseIntentDetail id={1} />);

    expect(await screen.findByTestId("purchase-intent-detail")).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Volkswagen T-Cross");
    expect(screen.getByText("Até R$ 95.000")).toBeVisible();
    expect(screen.getByText("Atibaia - SP")).toBeVisible();
    expect(screen.getByText("Em até 30 dias")).toBeVisible();
    expect(screen.getByTestId("purchase-intent-active-note")).toHaveTextContent(
      /ativa para lojas da cidade selecionada/i
    );
  });

  it("não cria área falsa de veículos recebidos nem botão de contato", async () => {
    render(<PurchaseIntentDetail id={1} />);
    await screen.findByTestId("purchase-intent-detail");
    expect(screen.queryByText(/veículos? recebidos?/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agendar/i)).not.toBeInTheDocument();
  });

  it("encerrar pede confirmação antes de chamar a API", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentDetail id={1} />);

    await user.click(await screen.findByTestId("purchase-intent-close"));
    expect(closePurchaseIntent).not.toHaveBeenCalled();

    await user.click(screen.getByTestId("purchase-intent-close-confirm"));
    await waitFor(() => expect(closePurchaseIntent).toHaveBeenCalledWith(1));
  });

  it("depois de encerrar mostra o estado encerrado e some o botão", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentDetail id={1} />);

    await user.click(await screen.findByTestId("purchase-intent-close"));
    await user.click(screen.getByTestId("purchase-intent-close-confirm"));

    expect(await screen.findByTestId("purchase-intent-inactive-note")).toHaveTextContent(
      /Você encerrou esta procura/i
    );
    expect(screen.queryByTestId("purchase-intent-close")).not.toBeInTheDocument();
    expect(screen.getByTestId("purchase-intent-status")).toHaveTextContent("Encerrada");
  });

  it("procura expirada não oferece encerrar", async () => {
    fetchMyPurchaseIntent.mockResolvedValue(
      makeIntent({
        display_status: "expired",
        expires_at: new Date(Date.now() - 86400000).toISOString(),
      })
    );
    render(<PurchaseIntentDetail id={1} />);

    expect(await screen.findByTestId("purchase-intent-status")).toHaveTextContent("Expirada");
    expect(screen.queryByTestId("purchase-intent-close")).not.toBeInTheDocument();
    expect(screen.getByTestId("purchase-intent-inactive-note")).toHaveTextContent(/expirou/i);
  });

  it("404 do backend vira estado de erro com volta para a listagem", async () => {
    fetchMyPurchaseIntent.mockRejectedValue(new Error("Procura não encontrada."));
    render(<PurchaseIntentDetail id={999} />);

    const box = await screen.findByTestId("purchase-intent-detail-error");
    expect(box).toHaveTextContent("Procura não encontrada.");
    expect(screen.getByRole("link", { name: /Voltar para minhas procuras/i })).toHaveAttribute(
      "href",
      "/dashboard/minhas-procuras"
    );
  });

  it("falha ao encerrar mantém a procura ativa e mostra o erro", async () => {
    const user = userEvent.setup();
    closePurchaseIntent.mockRejectedValue(new Error("rede caiu"));
    render(<PurchaseIntentDetail id={1} />);

    await user.click(await screen.findByTestId("purchase-intent-close"));
    await user.click(screen.getByTestId("purchase-intent-close-confirm"));

    expect(await screen.findByRole("alert")).toHaveTextContent("rede caiu");
    expect(screen.getByTestId("purchase-intent-status")).toHaveTextContent("Ativa");
  });

  it("mobile: botões de ação têm 48px e viram automáticos no desktop", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentDetail id={1} />);

    const close = await screen.findByTestId("purchase-intent-close");
    expect(close.className).toContain("h-12");
    expect(close.className).toContain("w-full");
    expect(close.className).toContain("sm:w-auto");

    await user.click(close);
    expect(screen.getByTestId("purchase-intent-close-confirm").className).toContain("h-12");
  });
});
