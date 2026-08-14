// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ReceivedVehicles from "./ReceivedVehicles";
import { OffersApiError, type ReceivedOffer } from "@/lib/purchase-intents/offers";

/**
 * "Veículos enviados para você" — a área do comprador.
 *
 * O que este arquivo trava:
 *   • o card mostra o dado ATUAL do anúncio (o componente não guarda cópia);
 *   • indisponível NÃO some da lista, NÃO oferece link público e NÃO oferece
 *     o botão de WhatsApp;
 *   • vazio é acolhedor, não um erro;
 *   • erro da área não pretende ser erro da página;
 *   • o CTA de WhatsApp pede a URL ao SERVIDOR a cada clique, um clique por vez,
 *     e distingue "veículo saiu do ar" de "loja sem WhatsApp" de "rede caiu";
 *   • nenhum telefone aparece na tela, antes ou depois do clique;
 *   • nada de chat, agenda ou promessa de "visita agendada".
 *
 * O WhatsApp NUNCA é aberto de verdade: `window.open` é espionado e o que se
 * valida é a URL entregue a ele.
 */

const fetchReceivedOffers = vi.fn();
const requestOfferWhatsapp = vi.fn();

vi.mock("@/lib/purchase-intents/offers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/offers")>();
  return {
    ...actual,
    fetchReceivedOffers: (...args: unknown[]) => fetchReceivedOffers(...args),
    requestOfferWhatsapp: (...args: unknown[]) => requestOfferWhatsapp(...args),
  };
});

/**
 * URL que o BACKEND devolveria. O teste nunca abre o WhatsApp de verdade:
 * `window.open` é espionado, então o que se valida é a URL entregue a ele.
 */
const WHATSAPP_URL =
  "https://wa.me/5511999999999?text=Ol%C3%A1%21%20Recebi%20pelo%20Carros%20na%20Cidade";

/**
 * jsdom não implementa `window.open` — chamá-lo lança "Not implemented". O spy
 * o substitui e, de quebra, é o que garante §53: nenhum teste abre o WhatsApp
 * de verdade, só observa a URL que teria sido aberta.
 *
 * O tipo vem da própria fábrica em vez de `ReturnType<typeof vi.spyOn>`: a
 * forma genérica perde a assinatura de `window.open` e o TypeScript recusa a
 * atribuição.
 */
function spyOnWindowOpen() {
  return vi.spyOn(window, "open").mockImplementation(() => null);
}

let openSpy: ReturnType<typeof spyOnWindowOpen>;

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
  requestOfferWhatsapp.mockResolvedValue({ url: WHATSAPP_URL });
  openSpy = spyOnWindowOpen();
});

afterEach(() => {
  openSpy.mockRestore();
  cleanup();
});

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
  it("nenhum chat, proposta ou leilão — o WhatsApp é o canal", async () => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(screen.queryByText(/conversar|chat/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByText(/proposta|lance|leil[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
  });

  it("NÃO promete agendamento — o botão só abre a conversa", async () => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(
      screen.queryByText(/visita agendada|agendamento confirmado|hor[áa]rio reservado/i)
    ).not.toBeInTheDocument();
  });

  it("nenhum telefone na tela, nem antes nem depois do clique", async () => {
    const user = userEvent.setup();
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    requestOfferWhatsapp.mockResolvedValue({ url: WHATSAPP_URL });

    const { container } = render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    // §27: o objetivo é abrir o WhatsApp, não publicar o número da loja.
    expect(container.textContent).not.toMatch(/e-?mail|telefone|cnpj/i);
    expect(container.textContent).not.toMatch(/\d{4,5}-?\d{4}/);

    await user.click(screen.getByTestId("received-vehicle-whatsapp"));
    await waitFor(() => expect(openSpy).toHaveBeenCalled());

    // O número existe só DENTRO da URL entregue ao window.open.
    expect(container.textContent).not.toMatch(/5511999999999/);
  });
});

// ---------------------------------------------------------------------------
// Fase 3.1 — Agendar visita pelo WhatsApp
// ---------------------------------------------------------------------------

describe("ReceivedVehicles — CTA de WhatsApp", () => {
  beforeEach(() => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
    requestOfferWhatsapp.mockResolvedValue({ url: WHATSAPP_URL });
  });

  it("mostra os dois CTAs, com o WhatsApp em primeiro", async () => {
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    const whatsapp = screen.getByTestId("received-vehicle-whatsapp");
    const link = screen.getByTestId("received-vehicle-link");

    expect(whatsapp).toHaveTextContent("Agendar visita pelo WhatsApp");
    expect(link).toHaveTextContent("Ver anúncio");

    // §49: o comprador já está na etapa de interesse — falar com a loja é a
    // ação principal, ver o anúncio é a consulta.
    expect(whatsapp.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("é um <button> de verdade, não um link disfarçado", async () => {
    // §50: a ação chama a API antes de navegar; um <a> daria menu de contexto
    // com "copiar endereço" apontando para lugar nenhum.
    render(<ReceivedVehicles intentId={1} />);
    const button = await screen.findByTestId("received-vehicle-whatsapp");

    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
  });

  it("pede a URL ao servidor com (intentId, offerId) e abre em nova aba", async () => {
    const user = userEvent.setup();
    render(<ReceivedVehicles intentId={7} />);
    await user.click(await screen.findByTestId("received-vehicle-whatsapp"));

    await waitFor(() => expect(requestOfferWhatsapp).toHaveBeenCalledWith(7, 1));
    expect(openSpy).toHaveBeenCalledWith(WHATSAPP_URL, "_blank", "noopener,noreferrer");
  });

  it("mostra 'Abrindo WhatsApp…' e desabilita durante a resolução", async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: unknown) => void = () => {};
    requestOfferWhatsapp.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    render(<ReceivedVehicles intentId={1} />);
    await user.click(await screen.findByTestId("received-vehicle-whatsapp"));

    const button = screen.getByTestId("received-vehicle-whatsapp");
    expect(button).toHaveTextContent("Abrindo WhatsApp…");
    expect(button).toBeDisabled();

    resolveRequest({ url: WHATSAPP_URL });
    await waitFor(() => expect(screen.getByTestId("received-vehicle-whatsapp")).toBeEnabled());
  });

  it("clique duplo NÃO abre duas conversas", async () => {
    const user = userEvent.setup();
    let resolveRequest: (value: unknown) => void = () => {};
    requestOfferWhatsapp.mockReturnValue(
      new Promise((resolve) => {
        resolveRequest = resolve;
      })
    );

    render(<ReceivedVehicles intentId={1} />);
    const button = await screen.findByTestId("received-vehicle-whatsapp");

    await user.click(button);
    await user.click(button);

    expect(requestOfferWhatsapp).toHaveBeenCalledTimes(1);
    resolveRequest({ url: WHATSAPP_URL });
    await waitFor(() => expect(openSpy).toHaveBeenCalledTimes(1));
  });

  it("veículo indisponível NÃO oferece o botão", async () => {
    fetchReceivedOffers.mockResolvedValue({
      offers: [makeOffer({ vehicle: { ...makeOffer().vehicle, available: false } })],
    });
    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");

    expect(screen.queryByTestId("received-vehicle-whatsapp")).not.toBeInTheDocument();
  });
});

describe("ReceivedVehicles — erros do WhatsApp", () => {
  beforeEach(() => {
    fetchReceivedOffers.mockResolvedValue({ offers: [makeOffer()] });
  });

  it("falha genérica mostra 'tente novamente' e mantém o card", async () => {
    const user = userEvent.setup();
    requestOfferWhatsapp.mockRejectedValue(new Error("network down"));

    render(<ReceivedVehicles intentId={1} />);
    await user.click(await screen.findByTestId("received-vehicle-whatsapp"));

    const alert = await screen.findByTestId("received-vehicle-whatsapp-error");
    expect(alert).toHaveTextContent("Não foi possível abrir o WhatsApp da loja. Tente novamente.");
    // O card continua e o botão volta a funcionar — não fica carregando para sempre.
    expect(screen.getByTestId("received-vehicle-card")).toBeVisible();
    expect(screen.getByTestId("received-vehicle-whatsapp")).toBeEnabled();
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("veículo indisponível tem texto próprio e RECARREGA a lista", async () => {
    const user = userEvent.setup();
    requestOfferWhatsapp.mockRejectedValue(
      new OffersApiError("x", 409, "PURCHASE_INTENT_OFFER_UNAVAILABLE")
    );

    render(<ReceivedVehicles intentId={1} />);
    await screen.findByTestId("received-vehicle-card");
    expect(fetchReceivedOffers).toHaveBeenCalledTimes(1);

    await user.click(screen.getByTestId("received-vehicle-whatsapp"));

    const alert = await screen.findByTestId("received-vehicle-whatsapp-error");
    expect(alert).toHaveTextContent("Este veículo não está mais disponível.");
    // O backend acabou de dizer que saiu do ar: a lista é recarregada para o
    // card parar de oferecer uma ação que não funciona.
    await waitFor(() => expect(fetchReceivedOffers).toHaveBeenCalledTimes(2));
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("loja sem WhatsApp tem texto próprio e NÃO recarrega", async () => {
    const user = userEvent.setup();
    requestOfferWhatsapp.mockRejectedValue(
      new OffersApiError("x", 409, "DEALER_WHATSAPP_UNAVAILABLE")
    );

    render(<ReceivedVehicles intentId={1} />);
    await user.click(await screen.findByTestId("received-vehicle-whatsapp"));

    const alert = await screen.findByTestId("received-vehicle-whatsapp-error");
    expect(alert).toHaveTextContent(
      "Esta loja não possui WhatsApp disponível para contato no momento."
    );
    // Nada mudou no veículo — recarregar só piscaria a tela à toa.
    expect(fetchReceivedOffers).toHaveBeenCalledTimes(1);
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("o erro é POR CARD, não da seção inteira", async () => {
    const user = userEvent.setup();
    fetchReceivedOffers.mockResolvedValue({
      offers: [makeOffer({ offer_id: 1 }), makeOffer({ offer_id: 2 })],
    });
    requestOfferWhatsapp.mockRejectedValue(
      new OffersApiError("x", 409, "DEALER_WHATSAPP_UNAVAILABLE")
    );

    render(<ReceivedVehicles intentId={1} />);
    const buttons = await screen.findAllByTestId("received-vehicle-whatsapp");
    await user.click(buttons[1]);

    // Com uma mensagem global, quem tem três veículos não saberia qual falhou.
    await waitFor(() =>
      expect(screen.getAllByTestId("received-vehicle-whatsapp-error")).toHaveLength(1)
    );
    expect(screen.getAllByTestId("received-vehicle-card")).toHaveLength(2);
  });

  it("um novo clique limpa o erro anterior", async () => {
    const user = userEvent.setup();
    requestOfferWhatsapp.mockRejectedValueOnce(new Error("boom"));

    render(<ReceivedVehicles intentId={1} />);
    await user.click(await screen.findByTestId("received-vehicle-whatsapp"));
    await screen.findByTestId("received-vehicle-whatsapp-error");

    requestOfferWhatsapp.mockResolvedValue({ url: WHATSAPP_URL });
    await user.click(screen.getByTestId("received-vehicle-whatsapp"));

    await waitFor(() =>
      expect(screen.queryByTestId("received-vehicle-whatsapp-error")).not.toBeInTheDocument()
    );
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});
