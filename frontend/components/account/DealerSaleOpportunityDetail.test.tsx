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


/**
 * `next/navigation` mockado com um leitor de query REAL.
 *
 * `useSearchParams` não é decoração aqui: é por onde a loja escolhida chega à
 * tela. Um mock que devolvesse sempre vazio esconderia a regra que este arquivo
 * precisa exercitar — por isso o valor é controlável por teste.
 */
let currentSearch = "";
const routerReplace = vi.fn((url: string) => {
  currentSearch = String(url).replace(/^\?/, "");
});

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: routerReplace, push: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(currentSearch),
}));

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
    minimum_accepted_price: "62500.00",
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
    // O bloco de seleção (Fase 4.4). O padrão é a disputa ABERTA — a API devolve
    // `is_selected: false` em todo detalhe, e não só quando verdadeiro, para que
    // a tela não precise distinguir "não selecionada" de "campo ausente".
    is_selected: false,
    selected_amount: null,
    selected_at: null,
    // Fase 4.5. `null` é o estado normal antes da seleção: a inspeção só nasce
    // quando a loja escolhida envia a primeira rodada de horários.
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = "";
  fetchSaleOpportunity.mockResolvedValue(makeDetail());
});

afterEach(cleanup);

// ============================================================================
describe("cabeçalho e ficha", () => {
  it("o título fala de AVALIAÇÃO, e o subtítulo não promete contato com o vendedor", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);

    expect(await screen.findByText("Avaliação de veículo para compra")).toBeTruthy();
    // 4.11A — "pelo vendedor" entrou no subtítulo. A frase continua descrevendo
    // LEITURA e OFERTA, e continua sem prometer contato: é o portal que conduz.
    expect(
      screen.getByText("Analise as informações declaradas pelo vendedor e faça seu lance.")
    ).toBeTruthy();
  });

  it("renderiza a ficha inteira, agrupada", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    // O resumo virou um cartão próprio e a ficha virou UM cartão com seções.
    // Os títulos mudaram junto; o que a asserção protege é que TODO grupo de
    // dados continua na tela, não como cada um se chama por dentro.
    // 4.11A — "Resumo do veículo" saiu: os cinco dados dele viraram
    // "Informações do veículo", e o piso subiu para o cartão de negociação. A
    // ficha declarada ganhou título próprio na tela do lojista.
    for (const title of [
      "Informações do veículo",
      "Condição declarada pelo vendedor",
      "Conservação",
      "Financeiro e documentação",
      "Histórico",
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

    // 4.11A — a referência virou um cartão próprio: o rótulo (com a época) e o
    // valor agora são elementos distintos, em vez de uma string só.
    //
    // Mês em UTC: o snapshot de 01/08 não pode aparecer como julho.
    expect(screen.getByText("Referência FIPE (ago de 2026)")).toBeTruthy();
    expect(screen.getByTestId("dealer-detail-fipe-value").textContent).toMatch(
      /92\.000,00/
    );
  });

  it("FIPE não resolvida mostra 'Não informado', nunca um número inventado", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ fipe_reference_value: null, fipe_reference_at: null })
    );
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.getByTestId("dealer-detail-fipe-missing").textContent).toContain(
      "Não informado"
    );
    // E nenhum número aparece no lugar — nem o piso, que está logo ao lado e
    // seria o candidato natural a ser confundido com a tabela.
    expect(screen.queryByTestId("dealer-detail-fipe-value")).toBeNull();
  });
});

// ============================================================================
describe("galeria", () => {
  it("mostra a capa, o contador e as miniaturas", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    expect(screen.getByText("1 / 2")).toBeTruthy();
    expect(screen.getAllByTestId("dealer-detail-thumb")).toHaveLength(2);
  });

  it("clicar numa miniatura troca a foto principal", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-detail-gallery");

    await userEvent.click(screen.getAllByTestId("dealer-detail-thumb")[1]);
    expect(screen.getByText("2 / 2")).toBeTruthy();
  });

  it("sem fotos mostra um estado próprio, não uma imagem quebrada", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ images: [] }));
    render(<DealerSaleOpportunityDetail id="1" />);

    expect(await screen.findByTestId("dealer-detail-no-photos")).toBeTruthy();
  });
});

// ============================================================================
describe("painel de lances com incremento fixo", () => {
  it("sem propostas exibe o piso da rodada como lance inicial, nunca zero fictício", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const panel = await screen.findByTestId("dealer-offer-panel");
    expect(within(panel).getByTestId("dealer-offer-current").textContent).toContain("62.500,00");
    expect(panel.textContent).toContain("Lance inicial · mínimo do vendedor");
    expect(screen.getByTestId("dealer-offer-count").textContent).toContain("Nenhuma proposta");
    expect(panel.textContent).not.toMatch(/R\$\s?0,00/);
  });

  it("quatro incrementos fixos e nenhum campo manual com uma referência válida", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    for (const increment of [100, 300, 500, 1000]) {
      expect(screen.getByTestId(`dealer-offer-bump-${increment}")).toBeTruthy();
    }
    expect(screen.queryByTestId("dealer-offer-bump-2000")).toBeNull();
    expect(screen.queryByTestId("dealer-offer-amount")).toBeNull();
    expect((screen.getByTestId("dealer-offer-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("selecionar incremento prepara lance, sem disparar requisição", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ current_highest_offer: "63000.00", offers_count: 1 }));
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    await userEvent.click(screen.getByTestId("dealer-offer-bump-300"));
    expect(screen.getByTestId("dealer-offer-preview").textContent).toContain("63.300,00");
    expect(screen.getByTestId("dealer-offer-submit").textContent).toContain("63.300,00");
    expect(submitSaleOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId("dealer-offer-bump-300").getAttribute("aria-pressed")).toBe("true");
  });

  it("envia exatamente o valor da referência acrescido de R$ 100 e atualiza o lance líder", async () => {
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "62600.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "62600.00",
      my_offer: "62600.00",
      is_leading: true,
      offers_count: 1,
    });
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    fetchSaleOpportunity.mockClear();
    await userEvent.click(screen.getByTestId("dealer-offer-bump-100"));
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));
    await waitFor(() => expect(submitSaleOffer).toHaveBeenCalled());
    expect(submitSaleOffer.mock.calls[0][1]).toMatchObject({ amount: "62600.00", note: null });
    expect((await screen.findByTestId("dealer-offer-standing")).textContent).toContain("Você está liderando");
    expect(screen.getByTestId("dealer-offer-current").textContent).toContain("62.600,00");
    expect(fetchSaleOpportunity).not.toHaveBeenCalled();
    expect((screen.getByTestId("dealer-offer-submit") as HTMLButtonElement).disabled).toBe(true);
  });

  it("após envio, próximos incrementos partem do novo maior lance", async () => {
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "62600.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "62600.00", my_offer: "62600.00", is_leading: true, offers_count: 1,
    });
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    await userEvent.click(screen.getByTestId("dealer-offer-bump-100"));
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));
    await screen.findByTestId("dealer-offer-success");
    await userEvent.click(screen.getByTestId("dealer-offer-bump-500"));
    expect(screen.getByTestId("dealer-offer-preview").textContent).toContain("63.100,00");
  });

  it("rejeição 409 de outra loja atualiza a base, mas nunca envia um lance novo sem confirmação", async () => {
    submitSaleOffer.mockRejectedValue(
      new DealerSaleOpportunityError(
        "A sua proposta precisa ser maior que a maior proposta atual.",
        409,
        "SALE_OPPORTUNITY_OFFER_NOT_LEADING",
        "64500.00"
      )
    );
    fetchSaleOpportunity.mockResolvedValue(makeDetail({
      current_highest_offer: "64000.00", my_offer: "63000.00", offers_count: 2,
    }));
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    await userEvent.click(screen.getByTestId("dealer-offer-bump-100"));
    expect(screen.getByTestId("dealer-offer-preview").textContent).toContain("64.100,00");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));
    await screen.findByTestId("dealer-offer-error");
    expect(screen.getByTestId("dealer-offer-current").textContent).toContain("64.500,00");
    expect(screen.getByTestId("dealer-offer-preview").textContent).toContain("64.600,00");
    expect(submitSaleOffer).toHaveBeenCalledTimes(1);
  });

  it("liderança e valor pessoal aparecem sem identidade da loja concorrente", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({
      current_highest_offer: "65000.00", my_offer: "64000.00", offers_count: 2, is_leading: false,
    }));
    render(<DealerSaleOpportunityDetail id="1" />);
    const standing = await screen.findByTestId("dealer-offer-standing");
    expect(standing.textContent).toContain("Existe uma proposta maior");
    expect(standing.textContent).not.toMatch(/loja|dealer|concorrente/i);
    expect(screen.getByTestId("dealer-offer-current").textContent).toContain("65.000,00");
    expect(screen.getByTestId("dealer-offer-panel").textContent).toContain("64.000,00");
  });

  it("sem mínimo e sem líder preserva entrada manual para veículos legados", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ minimum_accepted_price: null }));
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "50000.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "50000.00", my_offer: "50000.00", is_leading: true, offers_count: 1,
    });
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-legacy-entry");
    expect(screen.getByTestId("dealer-offer-current").textContent).toContain("Não informado");
    expect(screen.getByTestId("dealer-offer-panel").textContent).not.toMatch(/R\$\s?0,00/);
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "5000000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));
    await waitFor(() => expect(submitSaleOffer).toHaveBeenCalled());
    expect(submitSaleOffer.mock.calls[0][1].amount).toBe("50000.00");
  });

  it("sem valor manual em legado, não envia requisição", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ minimum_accepted_price: null }));
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-legacy-entry");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));
    expect(submitSaleOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId("dealer-offer-error").textContent).toContain("Informe o valor");
  });

  it("observação opcional só aparece depois do clique", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    expect(screen.queryByTestId("dealer-offer-note")).toBeNull();
    await userEvent.click(screen.getByTestId("dealer-offer-note-toggle"));
    expect(screen.getByLabelText(/Observações para avaliação/)).toBeTruthy();
  });

  it("comparação com FIPE não se apresenta como lucro ou margem", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({
      current_highest_offer: "70000.00", my_offer: "70000.00", is_leading: true, offers_count: 1,
    }));
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    const difference = screen.getByTestId("dealer-offer-fipe-distance").textContent ?? "";
    expect(difference).toContain("22.000,00");
    expect(difference).toContain("abaixo");
    expect(difference.toLowerCase()).not.toMatch(/lucro|margem/);
  });

  it("as condições permanecem disponíveis, com o compromisso visível", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");
    expect(screen.getByTestId("dealer-offer-commitment").textContent?.length).toBeGreaterThan(20);
    await userEvent.click(screen.getByTestId("dealer-offer-terms-toggle"));
    expect(screen.getByTestId("dealer-offer-inspection-notice").textContent?.length).toBeGreaterThan(20);
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

  /**
   * FASE 4.7 — "avaliação presencial" SAIU desta lista.
   *
   * O teste proibia a expressão porque, na 4.3, ela só poderia aparecer como
   * PROMESSA: um stepper anunciando uma etapa que nenhum código escrevia.
   *
   * Agora ela aparece por outro motivo — o oposto. O texto diz que a avaliação
   * acontece DIRETAMENTE entre as partes, fora da plataforma. Continuar
   * proibindo a expressão obrigaria a explicar o handoff sem nomear a coisa que
   * está sendo combinada.
   *
   * O que a lista ainda proíbe é o que continua sendo promessa vazia:
   * documentação, transferência e checklist. Nenhum deles tem writer, e nenhum
   * vai ganhar um nesta fase.
   */
  it("nenhum stepper de fases que a plataforma não executa", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of ["documentação e transferência", "checklist", "pagamento"]) {
      expect(text, term).not.toContain(term);
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
