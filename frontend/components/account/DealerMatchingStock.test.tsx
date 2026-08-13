// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerMatchingStock from "./DealerMatchingStock";
import type { MatchingAd } from "@/lib/purchase-intents/offers";

/**
 * "Veículos do seu estoque" — a seção de envio do lojista.
 *
 * Mocka o MÓDULO de dados e preserva os helpers puros com `importOriginal`:
 * `formatVehiclePrice` e `vehicleAttributes` continuam sendo os de verdade, então
 * um defeito neles é acusado aqui.
 *
 * O que este arquivo trava, além dos estados de tela:
 *   • o clique duplo não dispara dois envios;
 *   • o card vira "Enviado" SEM recarregar a lista;
 *   • um erro de envio não apaga a lista já carregada;
 *   • nada de WhatsApp/agendar/chat aparece.
 */

const fetchMatchingAds = vi.fn();
const sendVehicleToBuyer = vi.fn();

vi.mock("@/lib/purchase-intents/offers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/offers")>();
  return {
    ...actual,
    fetchMatchingAds: (...args: unknown[]) => fetchMatchingAds(...args),
    sendVehicleToBuyer: (...args: unknown[]) => sendVehicleToBuyer(...args),
  };
});

function makeAd(overrides: Partial<MatchingAd> = {}): MatchingAd {
  return {
    ad_id: 1,
    slug: "honda-hr-v-2020-atibaia-sp-1",
    title: "Honda HR-V EX 2020",
    vehicle_name: "Honda HR-V",
    brand: "Honda",
    year: 2020,
    mileage: 72000,
    transmission: "automatico",
    price: "98900.00",
    main_image: "https://cdn.example.com/hrv.jpg",
    budget_relation: "within_budget",
    already_sent: false,
    ...overrides,
  };
}

function page(ads: MatchingAd[], used = 0) {
  return {
    matching_ads: ads,
    limit: { max_per_dealer: 3, used, remaining: Math.max(0, 3 - used) },
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
  fetchMatchingAds.mockResolvedValue(page([makeAd()]));
  sendVehicleToBuyer.mockResolvedValue({
    offer: { id: 1, ad_id: 1, sent_at: new Date().toISOString() },
    created: true,
  });
});

afterEach(cleanup);

describe("DealerMatchingStock — estados", () => {
  it("mostra esqueleto enquanto carrega e depois o card", async () => {
    render(<DealerMatchingStock intentId={1} />);
    expect(screen.getByTestId("dealer-matching-stock-loading")).toBeInTheDocument();

    expect(await screen.findByTestId("matching-ad-card")).toBeVisible();
    expect(screen.queryByTestId("dealer-matching-stock-loading")).not.toBeInTheDocument();
  });

  it("estoque sem carro compatível é estado VAZIO, não erro", async () => {
    fetchMatchingAds.mockResolvedValue(page([]));
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("dealer-matching-stock-empty")).toBeVisible();
    expect(screen.queryByTestId("dealer-matching-stock-error")).not.toBeInTheDocument();
  });

  it("erro da lista mostra caixa própria e permite tentar de novo", async () => {
    const user = userEvent.setup();
    fetchMatchingAds.mockRejectedValueOnce(new Error("Falha ao falar com o servidor."));
    render(<DealerMatchingStock intentId={1} />);

    const box = await screen.findByTestId("dealer-matching-stock-error");
    expect(box).toHaveTextContent("Falha ao falar com o servidor.");

    fetchMatchingAds.mockResolvedValue(page([makeAd()]));
    await user.click(within(box).getByRole("button", { name: /tentar novamente/i }));
    expect(await screen.findByTestId("matching-ad-card")).toBeVisible();
  });

  it("renderiza nome comercial, atributos e preço do anúncio", async () => {
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("matching-ad-name")).toHaveTextContent("Honda HR-V");
    expect(screen.getByText("2020 · 72.000 km · Automático")).toBeVisible();
    expect(text(screen.getByTestId("matching-ad-price"))).toBe("R$ 98.900");
  });

  it("classifica dentro e acima do orçamento", async () => {
    fetchMatchingAds.mockResolvedValue(
      page([
        makeAd({ ad_id: 1 }),
        makeAd({ ad_id: 2, price: "105000.00", budget_relation: "above_budget" }),
      ])
    );
    render(<DealerMatchingStock intentId={1} />);

    const badges = await screen.findAllByTestId("matching-ad-budget");
    expect(badges.map((node) => node.textContent)).toEqual([
      "Dentro do orçamento",
      "Acima do orçamento",
    ]);
  });
});

describe("DealerMatchingStock — envio", () => {
  it("envia, mostra 'Enviando…' e troca para '✓ Enviado' sem recarregar", async () => {
    const user = userEvent.setup();
    let resolveSend: (value: unknown) => void = () => {};
    sendVehicleToBuyer.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    render(<DealerMatchingStock intentId={1} />);
    await user.click(await screen.findByTestId("matching-ad-send"));

    expect(screen.getByTestId("matching-ad-send")).toHaveTextContent("Enviando…");
    expect(screen.getByTestId("matching-ad-send")).toBeDisabled();

    resolveSend({ offer: { id: 1, ad_id: 1, sent_at: "x" }, created: true });

    expect(await screen.findByTestId("matching-ad-sent")).toHaveTextContent("✓ Enviado");
    // A lista NÃO foi buscada de novo: o lojista continua onde estava.
    expect(fetchMatchingAds).toHaveBeenCalledTimes(1);
  });

  it("clique duplo dispara UM envio só", async () => {
    const user = userEvent.setup();
    let resolveSend: (value: unknown) => void = () => {};
    sendVehicleToBuyer.mockReturnValue(
      new Promise((resolve) => {
        resolveSend = resolve;
      })
    );

    render(<DealerMatchingStock intentId={1} />);
    const button = await screen.findByTestId("matching-ad-send");

    await user.click(button);
    await user.click(button);

    expect(sendVehicleToBuyer).toHaveBeenCalledTimes(1);
    resolveSend({ offer: { id: 1, ad_id: 1, sent_at: "x" }, created: true });
    await screen.findByTestId("matching-ad-sent");
  });

  it("manda apenas o par (intentId, adId) — nada de identidade no corpo", async () => {
    const user = userEvent.setup();
    render(<DealerMatchingStock intentId={42} />);
    await user.click(await screen.findByTestId("matching-ad-send"));

    await waitFor(() => expect(sendVehicleToBuyer).toHaveBeenCalledWith(42, 1));
  });

  it("erro no envio aparece em alerta e NÃO apaga a lista", async () => {
    const user = userEvent.setup();
    sendVehicleToBuyer.mockRejectedValue(
      new Error("Este veículo não corresponde ao que o comprador procura.")
    );

    render(<DealerMatchingStock intentId={1} />);
    await user.click(await screen.findByTestId("matching-ad-send"));

    const alert = await screen.findByTestId("dealer-matching-stock-send-error");
    expect(alert).toHaveTextContent("não corresponde");
    // O card continua lá, e o botão volta a ficar clicável.
    expect(screen.getByTestId("matching-ad-card")).toBeVisible();
    expect(screen.getByTestId("matching-ad-send")).toBeEnabled();
  });

  it("já enviado não oferece botão de enviar de novo", async () => {
    fetchMatchingAds.mockResolvedValue(page([makeAd({ already_sent: true })], 1));
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("matching-ad-sent")).toBeVisible();
    expect(screen.queryByTestId("matching-ad-send")).not.toBeInTheDocument();
  });
});

describe("DealerMatchingStock — limite de 3", () => {
  it("mostra quantas vagas restam", async () => {
    fetchMatchingAds.mockResolvedValue(page([makeAd()], 1));
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("dealer-matching-stock-remaining")).toHaveTextContent(
      "ainda pode enviar 2 veículos"
    );
  });

  it("singular quando resta uma vaga", async () => {
    fetchMatchingAds.mockResolvedValue(page([makeAd()], 2));
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("dealer-matching-stock-remaining")).toHaveTextContent(
      "ainda pode enviar 1 veículo"
    );
  });

  it("limite atingido avisa e desabilita o botão", async () => {
    fetchMatchingAds.mockResolvedValue(page([makeAd({ ad_id: 9 })], 3));
    render(<DealerMatchingStock intentId={1} />);

    expect(await screen.findByTestId("dealer-matching-stock-limit")).toHaveTextContent(
      /já enviou 3 veículos disponíveis/i
    );
    expect(screen.getByTestId("matching-ad-send")).toBeDisabled();
  });

  it("o contador anda depois de um envio bem-sucedido", async () => {
    const user = userEvent.setup();
    fetchMatchingAds.mockResolvedValue(page([makeAd({ ad_id: 1 }), makeAd({ ad_id: 2 })], 0));

    render(<DealerMatchingStock intentId={1} />);
    const buttons = await screen.findAllByTestId("matching-ad-send");
    await user.click(buttons[0]);

    await waitFor(() =>
      expect(screen.getByTestId("dealer-matching-stock-remaining")).toHaveTextContent(
        "ainda pode enviar 2 veículos"
      )
    );
  });
});

describe("DealerMatchingStock — o que NÃO existe", () => {
  it("nenhum botão de WhatsApp, agendar, chat ou lance", async () => {
    render(<DealerMatchingStock intentId={1} />);
    await screen.findByTestId("matching-ad-card");

    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agendar|visita/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversar|chat|mensagem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lance|leil[ãa]o|proposta/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
  });

  it("nada do comprador aparece na tela do lojista", async () => {
    const { container } = render(<DealerMatchingStock intentId={1} />);
    await screen.findByTestId("matching-ad-card");

    expect(container.textContent).not.toMatch(/e-?mail|telefone|whatsapp|cpf/i);
  });
});
