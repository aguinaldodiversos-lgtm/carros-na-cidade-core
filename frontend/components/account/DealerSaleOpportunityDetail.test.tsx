// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerSaleOpportunityDetail from "./DealerSaleOpportunityDetail";
import {
  DealerSaleOpportunityError,
  type DealerSaleOpportunityDetail as Detail,
} from "@/lib/sale-requests/dealer-api";

/**
 * Detalhe + painel de proposta.
 *
 * Este arquivo trava o que o produto DECIDIU NÃO TER, e é aí que está o valor
 * dele: ausência não deixa rastro em teste de caminho feliz. Um `<a href="wa.me">`
 * acrescentado por engano numa fase futura passaria despercebido por qualquer
 * suíte que só verificasse o que a tela mostra.
 */

const fetchSaleOpportunity = vi.fn();
const submitSaleOffer = vi.fn();

vi.mock("@/lib/sale-requests/dealer-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/dealer-api")>();
  return {
    ...actual,
    fetchSaleOpportunity: (...args: unknown[]) => fetchSaleOpportunity(...args),
    submitSaleOffer: (...args: unknown[]) => submitSaleOffer(...args),
  };
});

function makeDetail(overrides: Partial<Detail> = {}): Detail {
  return {
    id: 1,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    evaluation: {
      tire_condition: "good",
      financing_status: "no",
      financing_balance: null,
      fines_status: "yes",
      fines_amount: "480.00",
      ipva_status: "paid",
      ipva_amount_due: null,
      licensing_status: "ok",
      caution_report_status: "approved",
      auction_history: "no",
      collision_history: "no",
      engine_condition: "issue",
      engine_notes: "Barulho leve na partida a frio.",
      gearbox_condition: "ok",
      gearbox_notes: null,
      suspension_condition: "ok",
      suspension_notes: null,
      body_paint_status: "issues",
      body_paint_issues: ["scratches", "dents"],
      body_paint_notes: "Porta dianteira direita.",
    },
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    image: "https://cdn.example.com/1.webp",
    images: ["https://cdn.example.com/1.webp", "https://cdn.example.com/2.webp"],
    known_issues: null,
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    status: "receiving_offers",
    created_at: new Date().toISOString(),
    current_highest_offer: null,
    my_offer: null,
    is_leading: false,
    offers_count: 0,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchSaleOpportunity.mockResolvedValue(makeDetail());
});

afterEach(cleanup);

// ============================================================================
describe("cabeçalho e ficha", () => {
  it("o título fala de AVALIAÇÃO, e o subtítulo não promete contato com o vendedor", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);

    expect(await screen.findByText("Avaliação de veículo para compra")).toBeTruthy();
    expect(
      screen.getByText("Analise as informações declaradas e envie sua proposta preliminar.")
    ).toBeTruthy();
  });

  it("renderiza a ficha inteira, agrupada", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    for (const title of [
      "Dados do veículo",
      "Estado geral e pneus",
      "Pendências e documentação",
      "Histórico do veículo",
      "Mecânica",
      "Lataria e pintura",
    ]) {
      expect(screen.getByText(title)).toBeTruthy();
    }
  });

  it("valor monetário acompanha a resposta que o justifica", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    // fines_status = 'yes' com fines_amount → "Sim (R$ 480,00)".
    expect(screen.getByText(/Sim \(R\$\s?480,00\)/)).toBeTruthy();
  });

  it("nota mecânica aparece junto da condição que a permite", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getByText("Barulho leve na partida a frio.")).toBeTruthy();
  });

  it("NULL legado vira 'Não informado', nunca 'Não'", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        evaluation: {
          ...makeDetail().evaluation,
          tire_condition: null,
          auction_history: null,
          licensing_status: null,
        },
      })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getAllByText("Não informado").length).toBeGreaterThanOrEqual(3);
  });

  it("'unknown' explícito mostra 'Não sei informar' — diferente de ausência", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        evaluation: { ...makeDetail().evaluation, auction_history: "unknown" },
      })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getByText("Não sei informar")).toBeTruthy();
  });

  it("a FIPE é rotulada como REFERÊNCIA e traz a data do snapshot", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getByText("Referência FIPE")).toBeTruthy();
    // Mês em UTC: o snapshot de 01/08 não pode aparecer como julho.
    expect(screen.getByText(/R\$\s?92\.000,00 \(ago de 2026\)/)).toBeTruthy();
  });

  it("FIPE não resolvida mostra 'Não informado', nunca um número inventado", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ fipe_reference_value: null, fipe_reference_at: null })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const rows = screen.getByText("Referência FIPE").closest("div");
    expect(rows?.textContent).toContain("Não informado");
  });
});

// ============================================================================
describe("galeria", () => {
  it("mostra a capa, o contador e as miniaturas", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    expect(screen.getByText("1/2")).toBeTruthy();
    expect(screen.getAllByTestId("dealer-detail-thumb")).toHaveLength(2);
  });

  it("clicar numa miniatura troca a foto principal", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    await userEvent.click(screen.getAllByTestId("dealer-detail-thumb")[1]);
    expect(screen.getByText("2/2")).toBeTruthy();
  });

  it("sem fotos mostra um estado próprio, não uma imagem quebrada", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ images: [] }));
    render(<DealerSaleOpportunityDetail id="1" />);

    expect(await screen.findByTestId("dealer-detail-no-photos")).toBeTruthy();
  });
});

// ============================================================================
describe("painel de proposta", () => {
  it("sem proposta nenhuma mostra travessão, e não R$ 0,00", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const panel = await screen.findByTestId("dealer-offer-panel");

    expect(within(panel).getAllByText("—").length).toBeGreaterThanOrEqual(2);
    expect(within(panel).queryByText("R$ 0,00")).toBeNull();
    expect(within(panel).getByTestId("dealer-offer-count").textContent).toContain(
      "Nenhuma proposta recebida"
    );
  });

  it("enviar uma proposta chama a API com o valor em reais", async () => {
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "50000.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "50000.00",
      my_offer: "50000.00",
      is_leading: true,
      offers_count: 1,
    });

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "5000000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    await waitFor(() => expect(submitSaleOffer).toHaveBeenCalled());
    expect(submitSaleOffer.mock.calls[0][1].amount).toBe("50000.00");
  });

  it("depois de enviar, o painel mostra a liderança sem nova request", async () => {
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "50000.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "50000.00",
      my_offer: "50000.00",
      is_leading: true,
      offers_count: 1,
    });

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    fetchSaleOpportunity.mockClear();
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "5000000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    expect(await screen.findByTestId("dealer-offer-standing")).toHaveProperty(
      "textContent",
      "Você está liderando"
    );
    expect(fetchSaleOpportunity).not.toHaveBeenCalled();
  });

  it("quando outra loja lidera, o aviso não tem nome", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        current_highest_offer: "60000.00",
        my_offer: "50000.00",
        is_leading: false,
        offers_count: 2,
      })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    const standing = await screen.findByTestId("dealer-offer-standing");

    expect(standing.textContent).toBe("Existe uma proposta maior");
    expect(standing.textContent).not.toMatch(/loja|dealer|concorrente/i);
  });

  it("a recusa por não superar atualiza o líder na tela", async () => {
    // O erro REAL do módulo, e não um sósia com a mesma propriedade.
    // `readRejectedHighest` só reconhece `DealerSaleOpportunityError` — e essa
    // é a checagem certa: um objeto qualquer com um campo `currentHighest`
    // poderia vir de qualquer lugar, inclusive de uma resposta malformada.
    submitSaleOffer.mockRejectedValue(
      new DealerSaleOpportunityError(
        "A sua proposta precisa ser maior que a maior proposta atual.",
        409,
        "SALE_OPPORTUNITY_OFFER_NOT_LEADING",
        "61000.00"
      )
    );

    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ current_highest_offer: "60000.00", my_offer: "50000.00", offers_count: 2 })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "5500000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    expect(await screen.findByTestId("dealer-offer-error")).toBeTruthy();
    // O painel passa a mostrar 61.000 — o lojista não precisa recarregar para
    // descobrir quanto falta.
    await waitFor(() => expect(screen.getByText(/R\$\s?61\.000,00/)).toBeTruthy());
  });

  it("valor vazio não chama a API", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    expect(submitSaleOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId("dealer-offer-error").textContent).toContain("Informe o valor");
  });

  it("os atalhos partem da maior proposta atual e apenas PREENCHEM o campo", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ current_highest_offer: "50000.00", my_offer: null, offers_count: 1 })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.click(screen.getByTestId("dealer-offer-bump-1000"));

    expect((screen.getByTestId("dealer-offer-amount") as HTMLInputElement).value).toContain(
      "51.000,00"
    );
    // Preencher não envia.
    expect(submitSaleOffer).not.toHaveBeenCalled();
  });

  it("sem disputa nenhuma não há atalho de incremento — não há de onde partir", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    expect(screen.queryByTestId("dealer-offer-bump-1000")).toBeNull();
  });

  it("a distância para a FIPE é rotulada como distância, nunca como margem", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ my_offer: "70000.00", current_highest_offer: "70000.00", is_leading: true })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    const distance = await screen.findByTestId("dealer-offer-fipe-distance");

    expect(distance.textContent).toContain("Distância para a referência FIPE");
    expect(distance.textContent).toContain("22.000,00");
    expect(distance.textContent).toContain("abaixo");
  });

  it("sem proposta não há distância — exibir a FIPE sozinha seria enganoso", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    expect(screen.queryByTestId("dealer-offer-fipe-distance")).toBeNull();
  });

  it("o campo de observação NÃO se parece com mensagem", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    expect(screen.getByLabelText(/Observações para avaliação/)).toBeTruthy();
    expect(screen.queryByLabelText(/mensagem/i)).toBeNull();
    expect(screen.queryByPlaceholderText(/mensagem/i)).toBeNull();
  });
});

// ============================================================================
describe("o que esta fase decidiu NÃO ter", () => {
  it("nenhum canal de contato direto", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of [
      "whatsapp",
      "telefone",
      "falar com",
      "entrar em contato",
      "chat",
      "e-mail",
      "agendar",
      "visita",
    ]) {
      expect(text).not.toContain(term);
    }

    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("nenhuma identidade do vendedor", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of ["cpf", "documento", "endereço", "vendedor:"]) {
      expect(text).not.toContain(term);
    }
  });

  it("nenhum cronômetro, prazo ou expiração", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of ["expira", "encerra em", "faltam", "tempo restante", "prazo"]) {
      expect(text).not.toContain(term);
    }
  });

  it("nenhuma métrica inventada nem a palavra 'Confidencial'", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ current_highest_offer: "60000.00", my_offer: "50000.00", offers_count: 3 })
    );
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of [
      "confidencial",
      "margem",
      "lucro",
      "nível de interesse",
      "bom potencial",
      "urgente",
    ]) {
      expect(text).not.toContain(term);
    }
  });

  it("nenhum stepper de fases futuras", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of [
      "avaliação presencial",
      "documentação e transferência",
      "negociação",
      "checklist",
    ]) {
      expect(text).not.toContain(term);
    }
  });

  it("nenhuma ação de dono: não existe cancelar aqui", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.queryByText(/Cancelar solicitação/i)).toBeNull();
  });
});

// ============================================================================
describe("erro", () => {
  it("404 da API vira estado de erro com retry, nunca a ficha vazia", async () => {
    fetchSaleOpportunity.mockRejectedValueOnce(new Error("Oportunidade não encontrada."));
    render(<DealerSaleOpportunityDetail id="999" />);

    const box = await screen.findByTestId("dealer-detail-error");
    expect(within(box).getByText("Oportunidade não encontrada.")).toBeTruthy();

    fetchSaleOpportunity.mockResolvedValue(makeDetail());
    await userEvent.click(within(box).getByRole("button", { name: /Tentar novamente/i }));

    expect(await screen.findByTestId("dealer-sale-opportunity-detail")).toBeTruthy();
  });
});
