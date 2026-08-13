// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReceivedVehicles from "./ReceivedVehicles";
import type { ReceivedOffer } from "@/lib/purchase-intents/offers";

/**
 * "Veículos enviados para você" — a área do comprador.
 *
 * O que este arquivo trava:
 *   • o card mostra o dado ATUAL do anúncio (o componente não guarda cópia);
 *   • indisponível NÃO some da lista e NÃO oferece link público;
 *   • vazio é acolhedor, não um erro;
 *   • erro da área não pretende ser erro da página;
 *   • nenhum contato: WhatsApp, agendar e chat são da próxima fase.
 */

const fetchReceivedOffers = vi.fn();

vi.mock("@/lib/purchase-intents/offers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/offers")>();
  return {
    ...actual,
    fetchReceivedOffers: (...args: unknown[]) => fetchReceivedOffers(...args),
  };
});

function makeOffer(overrides: Partial<ReceivedOffer> = {}): ReceivedOffer {
  return {
    offer_id: 1,
    sent_at: new Date().toISOString(),
    budget_relation: "within_budget",
    vehicle: {
      id: 1,
      slug: "honda-hr-v-2020-atibaia-sp-1",
      title: "Honda HR-V EX 2020",
      vehicle_name: "Honda HR-V",
      brand: "Honda",
      year: 2020,
      mileage: 72000,
      transmission: "automatico",
      price: "98900.00",
      main_image: "https://cdn.example.com/hrv.jpg",
      city: { name: "Atibaia", state: "SP" },
      available: true,
    },
    dealer: { name: "ittmotors" },
    ...overrides,
  };
}

/**
 * `Intl.NumberFormat("pt-BR", { style: "currency" })` separa "R$" do número com
 * ESPAÇO NÃO-QUEBRÁVEL (U+00A0), não com espaço comum. Comparar direto com um
 * "R$ 98.900" digitado no teclado falha por um caractere invisível — e o vitest
 * mostra as duas strings idênticas no relatório, o que custa meia hora.
 *
 * Normalizar aqui é melhor do que colar um NBSP cru no fonte: um byte invisível
 * no código-fonte é a mesma armadilha, só que sem aviso nenhum.
 */
const NBSP = String.fromCharCode(160);

function text(node: HTMLElement | null): string {
  return String(node?.textContent ?? "").split(NBSP).join(" ");
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchReceivedOffers.mockResolvedValue({ offers: [] });
});

afterEach(cleanup);

describe("ReceivedVehicles — estados", () => {
  it("esqueleto enquanto carrega", async () => {
    render(<ReceivedVehicles intentId={1} />);
    expect(screen.getByTestId("received-vehicles-loading")).toBeInTheDocument();
    expect(await screen.findByTestId("received-vehicles-empty")).toBeVisible();
  });

  it("vazio fala do que vai acontecer, sem linguagem negativa", async () => {
    render(<ReceivedVehicles intentId={1} />);

    const box = await screen.findByTestId("received-vehicles-empty");
    expect(box).toHaveTextContent("Nenhuma loja enviou um veículo para esta procura ainda.");
    expect(box).toHaveTextContent(/quando uma delas enviar/i);
    expect(screen.queryByTestId("received-vehicles-error")).not.toBeInTheDocument();
  });

  it("erro é discreto e re-tentável — a procura acima continua na página", async () => {
    const user = userEvent.setup();
    fetchReceivedOffers.mockRejectedValueOnce(new Error("boom"));
    render(<ReceivedVehicles intentId={1} />);

    const box = await screen.findByTestId("received-vehicles-error");
    expect(box).toHaveTextContent("Não foi possível carregar os veículos recebidos.");
    // Detalhe técnico do erro não vaza para o comprador.
    expect(box).not.toHaveTextContent("boom");

    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    await user.click(within(box).getByRole("button", { name: /tentar novamente/i }));
    expect(await screen.findByTestId("received-vehicle-card")).toBeVisible();
  });

  it("conta as opções recebidas no singular e no plural", async () => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    const { unmount } = render(<ReceivedVehicles intentId={1} />);
    expect(await screen.findByTestId("received-vehicles-count")).toHaveTextContent(
      "1 opção recebida"
    );
    unmount();

    fetchReceivedOffers.mockResolvedValue({
      offers: [makeOffer(), makeOffer({ offer_id: 2 })],
    });
    render(<ReceivedVehicles intentId={1} />);
    expect(await screen.findByTestId("received-vehicles-count")).toHaveTextContent(
      "2 opções recebidas"
    );
  });
});

describe("ReceivedVehicles — card disponível", () => {
  beforeEach(() => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
  });

  it("mostra veículo, atributos, preço e o nome da loja", async () => {
    render(<ReceivedVehicles intentId={1} />);

    expect(await screen.findByTestId("received-vehicle-name")).toHaveTextContent("Honda HR-V");
    expect(screen.getByText("2020 · 72.000 km · Automático")).toBeVisible();
    // `Intl` usa espaço não-quebrável depois de "R$".
    expect(text(screen.getByTestId("received-vehicle-price"))).toBe("R$ 98.900");
    expect(screen.getByTestId("received-vehicle-dealer")).toHaveTextContent("ittmotors");
  });

  it("'Ver anúncio' aponta para a rota pública do veículo", async () => {
    render(<ReceivedVehicles intentId={1} />);

    const link = await screen.findByTestId("received-vehicle-link");
    expect(link).toHaveAttribute("href", "/veiculo/honda-hr-v-2020-atibaia-sp-1");
  });

  it("badge de orçamento fala na voz do comprador", async () => {
    render(<ReceivedVehicles intentId={1} />);
    expect(await screen.findByTestId("received-vehicle-budget")).toHaveTextContent(
      "Dentro do seu orçamento"
    );
  });

  it("acima do orçamento é mostrado, não escondido", async () => {
    fetchReceivedOffers.mockResolvedValue({
      offers: [
        makeOffer({
          budget_relation: "above_budget",
          vehicle: { ...makeOffer().vehicle, price: "103900.00" },
        }),
      ],
    });
    render(<ReceivedVehicles intentId={1} />);

    expect(await screen.findByTestId("received-vehicle-card")).toBeVisible();
    expect(screen.getByTestId("received-vehicle-budget")).toHaveTextContent(
      "Acima do seu orçamento"
    );
  });

  it("reflete o preço ATUAL que a API devolveu", async () => {
    // O componente não guarda snapshot: o valor que aparece é o que veio no
    // fetch. Se o lojista baixar o preço, o próximo carregamento mostra o novo.
    fetchReceivedOffers.mockResolvedValue({
      offers: [makeOffer({ vehicle: { ...makeOffer().vehicle, price: "96900.00" } })],
    });
    render(<ReceivedVehicles intentId={1} />);

    expect(text(await screen.findByTestId("received-vehicle-price"))).toBe("R$ 96.900");
  });
});

describe("ReceivedVehicles — card indisponível", () => {
  beforeEach(() => {
    fetchReceivedOffers.mockResolvedValue({
      offers: [makeOffer({ vehicle: { ...makeOffer().vehicle, available: false } })],
    });
  });

  it("continua na lista, marcado como indisponível", async () => {
    render(<ReceivedVehicles intentId={1} />);

    expect(await screen.findByTestId("received-vehicle-card")).toBeVisible();
    expect(screen.getByTestId("received-vehicle-unavailable")).toHaveTextContent("Indisponível");
  });

  it("NÃO oferece o link público — a URL levaria a uma página que não existe mais", async () => {
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(screen.queryByTestId("received-vehicle-link")).not.toBeInTheDocument();
    expect(screen.getByTestId("received-vehicle-gone")).toHaveTextContent(
      "Este veículo não está mais disponível."
    );
  });

  it("não mostra badge de orçamento num veículo que saiu", async () => {
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(screen.queryByTestId("received-vehicle-budget")).not.toBeInTheDocument();
  });
});

describe("ReceivedVehicles — o que NÃO existe", () => {
  it("nenhum contato: sem WhatsApp, agendar, chat ou proposta", async () => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agendar|visita/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversar|chat|mensagem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/proposta|lance|leil[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
  });

  it("nenhum dado privado da loja além do nome público", async () => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    const { container } = render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(container.textContent).not.toMatch(/e-?mail|telefone|cnpj/i);
  });
});
