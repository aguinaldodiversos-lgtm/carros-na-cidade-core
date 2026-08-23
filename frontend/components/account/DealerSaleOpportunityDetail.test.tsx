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
    expect(
      screen.getByText("Analise as informações declaradas e envie sua oferta.")
    ).toBeTruthy();
  });

  it("renderiza a ficha inteira, agrupada", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-sale-opportunity-detail");

    // O resumo virou um cartão próprio e a ficha virou UM cartão com seções.
    // Os títulos mudaram junto; o que a asserção protege é que TODO grupo de
    // dados continua na tela, não como cada um se chama por dentro.
    for (const title of [
      "Resumo do veículo",
      "Situação declarada pelo proprietário",
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

    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6500000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    await waitFor(() => expect(submitSaleOffer).toHaveBeenCalled());
    expect(submitSaleOffer.mock.calls[0][1].amount).toBe("65000.00");
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
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6500000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    // A igualdade EXATA quebrou quando o badge ganhou um glifo de estado ao lado
    // do texto. O glifo existe para a posição não depender só de cor; a asserção
    // passa a ser sobre a MENSAGEM, que é o que o lojista lê.
    expect((await screen.findByTestId("dealer-offer-standing")).textContent).toContain(
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

    expect(standing.textContent).toContain("Existe uma proposta maior");
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

    // 62.000 SUPERA o líder que a tela conhece (60.000) — a checagem local
    // deixa passar, e é o servidor que recusa, porque enquanto isso outra loja
    // subiu para 61.000. É o cenário real de tela defasada, e é o que este teste
    // existe para provar.
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6200000");
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

  /*
    ────────────────────────────────────────────────────────────────────────
    AS DUAS BARREIRAS NA TELA (§24 da Fase 4.3.3)
    ────────────────────────────────────────────────────────────────────────
    A checagem local NÃO substitui o servidor — lá ela acontece dentro da
    transação que trava a solicitação, e é a única confiável. Aqui ela existe
    para transformar um 409 previsível em resposta imediata, com o alvo na tela.

    O que estes testes prendem é a ORDEM das barreiras: sem proposta, o piso e
    `>=`; com proposta, a maior atual e `>`. Invertê-las faria a tela recusar um
    valor que a API aceita — o pior tipo de divergência, porque o lojista não
    tem como saber quem está certo.
  */
  it("abaixo do piso: não chama a API e diz qual é o piso", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    // Piso da fixture: 62.500. Um centavo abaixo.
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6249999");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    expect(submitSaleOffer).not.toHaveBeenCalled();
    const error = screen.getByTestId("dealer-offer-error").textContent ?? "";
    expect(error).toContain("valor mínimo");
    expect(error).toMatch(/62\.500,00/);
  });

  it("EXATAMENTE o piso é aceito enquanto não existe proposta", async () => {
    submitSaleOffer.mockResolvedValue({
      offer: { id: 1, amount: "62500.00", note: null, created_at: new Date().toISOString() },
      current_highest_offer: "62500.00",
      my_offer: "62500.00",
      is_leading: true,
      offers_count: 1,
    });

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6250000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    await waitFor(() => expect(submitSaleOffer).toHaveBeenCalled());
    expect(submitSaleOffer.mock.calls[0][1].amount).toBe("62500.00");
  });

  it("com proposta na mesa, alcançar o piso já não basta: precisa superar o líder", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({ current_highest_offer: "64000.00", my_offer: null, offers_count: 1 })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    // Acima do piso (62.500) e abaixo do líder (64.000).
    await userEvent.type(screen.getByTestId("dealer-offer-amount"), "6300000");
    await userEvent.click(screen.getByTestId("dealer-offer-submit"));

    expect(submitSaleOffer).not.toHaveBeenCalled();
    expect(screen.getByTestId("dealer-offer-error").textContent).toContain(
      "superar a maior proposta atual"
    );
  });

  it("o detalhe mostra os QUATRO valores — é o card que mostra só o piso", async () => {
    fetchSaleOpportunity.mockResolvedValue(
      makeDetail({
        minimum_accepted_price: "62500.00",
        fipe_reference_value: "72000.00",
        current_highest_offer: "65000.00",
        my_offer: "64000.00",
        offers_count: 2,
      })
    );

    render(<DealerSaleOpportunityDetail id="1" />);
    const panel = await screen.findByTestId("dealer-offer-panel");

    // A tela de decisão tem largura para os quatro, e é onde eles servem: o
    // formulário de proposta está logo abaixo.
    expect(screen.getByTestId("dealer-offer-minimum").textContent).toMatch(/62\.500,00/);
    expect(screen.getByTestId("dealer-detail-minimum").textContent).toMatch(/62\.500,00/);
    expect(panel.textContent).toMatch(/65\.000,00/);
    expect(panel.textContent).toMatch(/64\.000,00/);
    expect(document.body.textContent).toMatch(/72\.000,00/);
  });

  it("legado sem piso: o painel não mostra linha de valor mínimo, e nada de R$ 0,00", async () => {
    fetchSaleOpportunity.mockResolvedValue(makeDetail({ minimum_accepted_price: null }));

    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-offer-panel");

    expect(screen.queryByTestId("dealer-offer-minimum")).toBeNull();
    // No resumo a linha existe, mas diz "não informado" — nunca zero.
    expect(screen.getByTestId("dealer-detail-minimum").textContent).not.toContain("R$ 0");
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
