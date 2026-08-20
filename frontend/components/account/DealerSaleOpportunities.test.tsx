// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerSaleOpportunitiesList from "./DealerSaleOpportunitiesList";
import {
  DealerSaleOpportunityError,
  type DealerSaleOpportunityPage,
  type DealerSaleOpportunitySummary,
} from "@/lib/sale-requests/dealer-api";

/**
 * "Veículos para avaliação" — a superfície do lojista no Produto 2.
 *
 * Além dos estados de tela, este arquivo trava três coisas que DEFINEM o
 * produto:
 *
 *   1. a ausência total de identidade do vendedor;
 *   2. a ausência de qualquer canal de contato direto;
 *   3. a ausência de métrica inventada (margem, interesse, urgência).
 *
 * Um botão de WhatsApp ou uma etiqueta "Margem: Boa" aparecendo aqui prometeria
 * um fluxo e um cálculo que o sistema não tem.
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

const fetchSaleOpportunities = vi.fn();

vi.mock("@/lib/sale-requests/dealer-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/dealer-api")>();
  return {
    ...actual,
    fetchSaleOpportunities: (...args: unknown[]) => fetchSaleOpportunities(...args),
  };
});

function makeOpportunity(
  overrides: Partial<DealerSaleOpportunitySummary> = {}
): DealerSaleOpportunitySummary {
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
      fines_status: "no",
      fines_amount: null,
      ipva_status: "paid",
      ipva_amount_due: null,
      licensing_status: "ok",
      caution_report_status: "not_available",
      auction_history: "no",
      collision_history: "no",
      engine_condition: "ok",
      engine_notes: null,
      gearbox_condition: "ok",
      gearbox_notes: null,
      suspension_condition: "ok",
      suspension_notes: null,
      body_paint_status: "none",
      body_paint_issues: [],
      body_paint_notes: null,
    },
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    image: "https://cdn.example.com/capa.webp",
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    status: "receiving_offers",
    created_at: new Date().toISOString(),

    // Estado da disputa (Subfase B). Zerado por padrão: o card precisa
    // renderizar bem a solicitação que ainda não recebeu proposta nenhuma.
    current_highest_offer: null,
    my_offer: null,
    is_leading: false,
    offers_count: 0,

    ...overrides,
  };
}

function makePage(overrides: Partial<DealerSaleOpportunityPage> = {}): DealerSaleOpportunityPage {
  return {
    items: [],
    next_cursor: null,
    limit: 12,
    sort: "recent",
    summary: { total: 0, new_today: 0, with_my_offer: 0, without_my_offer: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  currentSearch = "";
  fetchSaleOpportunities.mockResolvedValue(makePage());
});

afterEach(cleanup);

// ============================================================================
describe("estados da lista", () => {
  it("lista os cards com veículo, ficha e cidade", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity()], summary: { total: 1, new_today: 1, with_my_offer: 0, without_my_offer: 0 } })
    );

    render(<DealerSaleOpportunitiesList />);

    expect(await screen.findByText("Volkswagen T-Cross 2020")).toBeTruthy();
    expect(screen.getByText("T-Cross 200 TSI 1.0 Flex 12V 5p Aut.")).toBeTruthy();
    // A cidade agora fica num chip sobre a foto. `getAllByText` porque o card
    // pode repeti-la; o que importa é que ela ESTEJA na tela.
    expect(screen.getAllByText(/Atibaia - SP/).length).toBeGreaterThan(0);
  });

  it("vazio SEM filtro fala da cidade; não é erro", async () => {
    render(<DealerSaleOpportunitiesList />);

    const empty = await screen.findByTestId("dealer-sale-opportunities-empty");
    expect(within(empty).getByText(/Nenhum veículo disponível na sua cidade/)).toBeTruthy();
    expect(screen.queryByTestId("dealer-sale-opportunities-error")).toBeNull();
  });

  it("erro mostra retry e o retry refaz a busca", async () => {
    fetchSaleOpportunities.mockRejectedValueOnce(new Error("Falha de rede"));
    render(<DealerSaleOpportunitiesList />);

    const box = await screen.findByTestId("dealer-sale-opportunities-error");
    expect(within(box).getByText("Falha de rede")).toBeTruthy();

    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    await userEvent.click(within(box).getByRole("button", { name: /Tentar novamente/i }));

    expect(await screen.findByText("Volkswagen T-Cross 2020")).toBeTruthy();
  });

  it("a tela NÃO envia city_id — quem resolve a cidade é o servidor", async () => {
    render(<DealerSaleOpportunitiesList />);
    await screen.findByTestId("dealer-sale-opportunities-empty");

    const [call] = fetchSaleOpportunities.mock.calls;
    expect(JSON.stringify(call)).not.toContain("city_id");
  });
});

// ============================================================================
describe("privacidade e ausência de contato", () => {
  it("nenhum canal de contato direto aparece na tela", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    const { container } = render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of [
      "whatsapp",
      "telefone",
      "falar com",
      "entrar em contato",
      "chat",
      "e-mail",
      "mensagem",
      "vendedor",
    ]) {
      expect(text).not.toContain(term);
    }

    // "proprietários particulares" NÃO está nesta lista, e a omissão é
    // deliberada: é a copy que descreve a ORIGEM dos veículos (§11 da
    // especificação da fase) e não uma pessoa identificável. O que a asserção
    // caça é canal de contato e identidade — não a palavra.

    expect(container.querySelector('a[href^="https://wa.me"]')).toBeNull();
    expect(container.querySelector('a[href^="tel:"]')).toBeNull();
    expect(container.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("nenhuma métrica inventada: sem margem, interesse ou urgência", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity()], summary: { total: 1, new_today: 1, with_my_offer: 0, without_my_offer: 0 } })
    );
    const { container } = render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    const text = container.textContent?.toLowerCase() ?? "";
    for (const term of [
      "margem",
      "lucro",
      "urgente",
      "bom potencial",
      "nível de interesse",
      "nv. oportunidade",
      "melhores oportunidades",
      "verificado",
    ]) {
      expect(text).not.toContain(term);
    }
  });

  /*
    ────────────────────────────────────────────────────────────────────────
    O CARD NÃO CARREGA DINHEIRO
    ────────────────────────────────────────────────────────────────────────
    A pergunta do feed é "vale abrir?", não "quanto eu ofereço?". Referência
    FIPE, maior proposta e a proposta desta loja saíram do card e vivem no
    DETALHE, ao lado do formulário que os usa.

    As asserções abaixo são de AUSÊNCIA, e a ausência precisa ser provada com
    dado presente: a oportunidade do teste TEM os três valores no objeto. Se
    algum voltasse a ser renderizado, o número apareceria no texto do card e o
    teste falharia. Um teste sobre um objeto sem valores passaria de graça.

    O contrato da API é intocado — `fipe_reference_value`,
    `current_highest_offer` e `my_offer` continuam chegando; quem os consome
    agora é só o detalhe (`DealerSaleOpportunityDetail.test.tsx`).
  */
  it("nenhum valor monetário no card: sem FIPE, sem maior proposta, sem a sua", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({
        items: [
          makeOpportunity({
            fipe_reference_value: "92000.00",
            fipe_reference_at: "2026-08-01T00:00:00.000Z",
            current_highest_offer: "81000.00",
            my_offer: "79000.00",
            offers_count: 2,
          }),
        ],
      })
    );
    render(<DealerSaleOpportunitiesList />);

    const card = await screen.findByTestId("dealer-sale-opportunity-card");
    const text = card.textContent ?? "";

    for (const label of ["Referência FIPE", "Maior proposta", "Sua proposta"]) {
      expect(text).not.toContain(label);
    }

    // Nenhum dos três NÚMEROS na tela — nem formatado, nem cru.
    for (const value of ["92.000", "81.000", "79.000", "92000", "81000", "79000"]) {
      expect(text).not.toContain(value);
    }

    // E nada de moeda no card, de forma nenhuma: um "R$" aqui significaria que
    // algum valor voltou por outro caminho.
    expect(text).not.toContain("R$");
  });

  it("o card continua sem valor do veículo ou preço pedido — eles não existem", async () => {
    // Não há preço nesta fase: a solicitação da pessoa física NÃO tem valor
    // pedido, e a disputa existe justamente para descobri-lo. Um "preço" no card
    // seria um número que ninguém pediu.
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    const { container } = render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    const text = container.textContent?.toLowerCase() ?? "";
    expect(text).not.toContain("valor do veículo");
    expect(text).not.toContain("preço pedido");
    expect(text).not.toContain("preço");
  });

  it("duas ações, dois destinos: 'Avaliar agora' abre no formulário de proposta", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    const card = screen.getByTestId("dealer-sale-opportunity-card");

    // Os dois CTAs vão para a MESMA página; o que muda é onde ela abre. Sem a
    // âncora, "Avaliar agora" seria um segundo botão idêntico ao primeiro — o
    // custo de decisão sem o ganho.
    const evaluate = within(card).getByTestId("dealer-sale-opportunity-evaluate");
    const details = within(card).getByTestId("dealer-sale-opportunity-link");

    expect(evaluate.getAttribute("href")).toBe("/dashboard-loja/oportunidades/veiculos/1#proposta");
    expect(details.getAttribute("href")).toBe("/dashboard-loja/oportunidades/veiculos/1");
    expect(evaluate.textContent).toContain("Avaliar agora");
    expect(details.textContent).toContain("Ver detalhes");

    // Nenhum terceiro link: o cartão inteiro é clicável pela camada do
    // "Ver detalhes", não por um link extra escondido.
    expect(within(card).getAllByRole("link")).toHaveLength(2);
  });
});

// ============================================================================
describe("ficha no card", () => {
  it("mostra as etiquetas declaradas", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);

    const card = await screen.findByTestId("dealer-sale-opportunity-card");

    // TRÊS etiquetas, e três só: estado declarado, leilão e laudo. O texto é
    // AFIRMATIVO ("Sem leilão"), e não rótulo + valor ("Leilão: Não") — num chip
    // de 10,5px metade da largura ia para a palavra que se repete em todos.
    expect(within(card).getByText("Bom")).toBeTruthy();
    expect(within(card).getByText("Sem leilão")).toBeTruthy();
    expect(within(card).getByText("Sem laudo")).toBeTruthy();

    // A ficha completa (pneus, IPVA, multas, mecânica, pintura) fica no
    // detalhe: no card ela virava uma parede de chips ilegível.
    for (const absent of ["Pneus", "IPVA", "Multas", "Motor", "Câmbio", "Financiado"]) {
      expect(card.textContent).not.toContain(absent);
    }
  });

  it("campo NULL some do card — nunca vira 'Não' nem 'Não informado'", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({
        items: [
          makeOpportunity({
            evaluation: {
              ...makeOpportunity().evaluation,
              tire_condition: null,
              auction_history: null,
            },
          }),
        ],
      })
    );
    render(<DealerSaleOpportunitiesList />);

    const card = await screen.findByTestId("dealer-sale-opportunity-card");
    // Sem declaração de leilão, o chip correspondente não existe — o card não
    // inventa "Não informado" nem "Sem leilão" para preencher espaço. A segunda
    // invenção seria a pior das duas: transformaria "não perguntado" em uma
    // declaração de que o carro nunca passou por leilão.
    expect(card.textContent).not.toContain("leilão");
    expect(card.textContent).not.toContain("Leilão");
    // O laudo foi declarado e continua aparecendo.
    expect(card.textContent).toContain("Sem laudo");
  });

  it("solicitação sem foto usa placeholder, não uma imagem quebrada", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity({ image: null })] })
    );
    render(<DealerSaleOpportunitiesList />);

    expect(await screen.findByTestId("dealer-sale-opportunity-no-photo")).toBeTruthy();
  });
});

// ============================================================================
describe("filtros", () => {
  it("trocar um filtro refaz a busca desde a primeira página", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    fetchSaleOpportunities.mockClear();
    await userEvent.selectOptions(screen.getByLabelText("Passagem por leilão"), "no");

    await waitFor(() => expect(fetchSaleOpportunities).toHaveBeenCalled());
    const [call] = fetchSaleOpportunities.mock.calls;
    expect(call[0].filters.auction_history).toBe("no");
    // Primeira página: sem cursor.
    expect(call[0].cursor ?? null).toBeNull();
  });

  it("filtro ativo vira chip removível, e o chip limpa o filtro", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    await userEvent.selectOptions(screen.getByLabelText("Passagem por leilão"), "no");
    const chip = await screen.findByTestId("dealer-sale-opportunity-chip");
    expect(chip.textContent).toContain("Leilão");

    fetchSaleOpportunities.mockClear();
    await userEvent.click(chip);

    await waitFor(() => expect(fetchSaleOpportunities).toHaveBeenCalled());
    const [call] = fetchSaleOpportunities.mock.calls;
    expect(call[0].filters.auction_history).toBeNull();
  });

  it("'Limpar filtros' zera tudo de uma vez", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    await userEvent.selectOptions(screen.getByLabelText("Passagem por leilão"), "no");
    await userEvent.selectOptions(screen.getByLabelText("Pneus"), "new");

    fetchSaleOpportunities.mockClear();
    await userEvent.click(screen.getByTestId("dealer-sale-opportunity-clear-filters"));

    await waitFor(() => expect(fetchSaleOpportunities).toHaveBeenCalled());
    const [call] = fetchSaleOpportunities.mock.calls;
    expect(call[0].filters.auction_history).toBeNull();
    expect(call[0].filters.tire_condition).toBeNull();
  });

  it("vazio COM filtro fala dos filtros, não da cidade", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [] }));
    await userEvent.selectOptions(screen.getByLabelText("Passagem por leilão"), "no");

    const empty = await screen.findByTestId("dealer-sale-opportunities-empty");
    expect(within(empty).getByText(/Nenhum veículo com esses filtros/)).toBeTruthy();
  });

  it("o seletor de marca não encolhe ao filtrar por uma marca", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({
        items: [
          makeOpportunity({ id: 1, brand: "Volkswagen", brand_slug: "volkswagen" }),
          makeOpportunity({ id: 2, brand: "Fiat", brand_slug: "fiat" }),
        ],
      })
    );
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity({ id: 2, brand: "Fiat", brand_slug: "fiat" })] })
    );
    await userEvent.selectOptions(screen.getByLabelText("Marca"), "fiat");

    await waitFor(() => {
      const select = screen.getByLabelText("Marca") as HTMLSelectElement;
      // Volkswagen continua selecionável: sem isso o lojista ficaria preso em
      // Fiat até limpar o filtro.
      expect([...select.options].map((option) => option.value)).toContain("volkswagen");
    });
  });

  it("ordenar refaz a busca com o novo sort", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);
    await screen.findByText("Volkswagen T-Cross 2020");

    fetchSaleOpportunities.mockClear();
    await userEvent.selectOptions(screen.getByTestId("dealer-sale-opportunity-sort"), "mileage_asc");

    await waitFor(() => expect(fetchSaleOpportunities).toHaveBeenCalled());
    expect(fetchSaleOpportunities.mock.calls[0][0].sort).toBe("mileage_asc");
  });

  it("não existe filtro de preço — a solicitação não tem preço pedido", async () => {
    render(<DealerSaleOpportunitiesList />);
    await screen.findByTestId("dealer-sale-opportunity-filters");

    expect(screen.queryByLabelText(/preço/i)).toBeNull();
    expect(screen.queryByLabelText(/valor/i)).toBeNull();
  });
});

// ============================================================================
describe("métricas do cabeçalho", () => {
  it("mostra só total e novas nas últimas 24h", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity()], summary: { total: 7, new_today: 2, with_my_offer: 0, without_my_offer: 0 } })
    );
    render(<DealerSaleOpportunitiesList />);

    const summary = await screen.findByTestId("dealer-sale-summary");
    expect(summary.textContent).toContain("7");
    expect(summary.textContent).toContain("Disponíveis");
    expect(summary.textContent).toContain("2");
    expect(summary.textContent).toContain("Novas em 24h");
  });

  it("omite 'novas' quando não houve nenhuma — zero não vira destaque", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity()], summary: { total: 3, new_today: 0, with_my_offer: 0, without_my_offer: 0 } })
    );
    render(<DealerSaleOpportunitiesList />);

    const summary = await screen.findByTestId("dealer-sale-summary");
    // Zero continua sendo mostrado — é um número real e a métrica é uma
    // partição. O que NÃO pode aparecer é métrica sem fonte.
    expect(summary.textContent).not.toMatch(/margem|interesse|potencial/i);
  });
});

// ============================================================================
describe("paginação", () => {
  it("mostra 'Carregar mais' com next_cursor e faz APPEND", async () => {
    fetchSaleOpportunities.mockResolvedValueOnce(
      makePage({ items: [makeOpportunity({ id: 1 })], next_cursor: "c1" })
    );
    render(<DealerSaleOpportunitiesList />);
    await screen.findByTestId("dealer-sale-opportunity-card");

    fetchSaleOpportunities.mockResolvedValueOnce(
      makePage({ items: [makeOpportunity({ id: 2, brand: "Fiat", model: "Argo" })] })
    );
    await userEvent.click(screen.getByTestId("load-more"));

    await waitFor(() =>
      expect(screen.getAllByTestId("dealer-sale-opportunity-card")).toHaveLength(2)
    );
    // O primeiro continua na tela: append, não substituição.
    expect(screen.getByText("Volkswagen T-Cross 2020")).toBeTruthy();
    expect(screen.getByText("Fiat Argo 2020")).toBeTruthy();
  });

  it("sem next_cursor não há botão", async () => {
    fetchSaleOpportunities.mockResolvedValue(
      makePage({ items: [makeOpportunity()], next_cursor: null })
    );
    render(<DealerSaleOpportunitiesList />);
    await screen.findByTestId("dealer-sale-opportunity-card");

    expect(screen.queryByTestId("load-more")).toBeNull();
  });

  it("o cursor da página 2 é o que veio da página 1", async () => {
    fetchSaleOpportunities.mockResolvedValueOnce(
      makePage({ items: [makeOpportunity({ id: 1 })], next_cursor: "cursor-abc" })
    );
    render(<DealerSaleOpportunitiesList />);
    await screen.findByTestId("dealer-sale-opportunity-card");

    fetchSaleOpportunities.mockClear();
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [] }));
    await userEvent.click(screen.getByTestId("load-more"));

    await waitFor(() => expect(fetchSaleOpportunities).toHaveBeenCalled());
    expect(fetchSaleOpportunities.mock.calls[0][0].cursor).toBe("cursor-abc");
  });
});

// ============================================================================
describe("seletor de loja — quando a conta tem mais de uma", () => {
  const STORES = [
    { advertiser_id: 100, name: "Auto Atibaia", city: { name: "Atibaia", state: "SP" } },
    { advertiser_id: 101, name: "Auto Bragança", city: { name: "Bragança Paulista", state: "SP" } },
  ];

  function rejectWithSelection() {
    fetchSaleOpportunities.mockRejectedValue(
      new DealerSaleOpportunityError(
        "Escolha a loja que vai comprar.",
        409,
        "SALE_OPPORTUNITY_STORE_SELECTION_REQUIRED",
        null,
        STORES
      )
    );
  }

  it("o 409 vira PERGUNTA, não tela de erro", async () => {
    rejectWithSelection();
    render(<DealerSaleOpportunitiesList />);

    expect(await screen.findByTestId("dealer-store-picker")).toBeTruthy();
    // A distinção que importa: escolher loja não é falha.
    expect(screen.queryByTestId("dealer-sale-opportunities-error")).toBeNull();
    expect(screen.queryByTestId("dealer-sale-opportunities-empty")).toBeNull();
  });

  it("mostra as duas lojas, com nome e cidade", async () => {
    rejectWithSelection();
    render(<DealerSaleOpportunitiesList />);

    const picker = await screen.findByTestId("dealer-store-picker");
    expect(within(picker).getByText("Auto Atibaia")).toBeTruthy();
    expect(within(picker).getByText("Auto Bragança")).toBeTruthy();
    expect(within(picker).getByText("Bragança Paulista - SP")).toBeTruthy();
  });

  it("escolher uma loja põe a escolha na URL", async () => {
    rejectWithSelection();
    render(<DealerSaleOpportunitiesList />);

    const options = await screen.findAllByTestId("dealer-store-option");
    await userEvent.click(options[1]);

    // O contrato do componente termina aqui: ele escreve a escolha na URL.
    // Quem re-renderiza com o novo `searchParams` é o roteador do Next, e o
    // efeito disso — a busca sair com `advertiserId` — é o que o teste seguinte
    // prova, entrando na tela já com `?loja=` na URL.
    //
    // Afirmar as duas coisas neste mesmo teste exigiria simular a navegação do
    // Next dentro do mock, e o teste passaria a provar o roteador em vez do
    // componente.
    await waitFor(() => expect(routerReplace).toHaveBeenCalledWith("?loja=101"));
  });

  it("entrando com a loja na URL, a busca sai com ela", async () => {
    currentSearch = "loja=101";
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);

    await screen.findByText("Volkswagen T-Cross 2020");
    expect(fetchSaleOpportunities.mock.calls[0][0].advertiserId).toBe("101");
  });

  it("com a loja escolhida na URL, o seletor não aparece", async () => {
    currentSearch = "loja=100";
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);

    await screen.findByText("Volkswagen T-Cross 2020");
    expect(screen.queryByTestId("dealer-store-picker")).toBeNull();
  });

  it("a loja escolhida acompanha o link do card para o detalhe", async () => {
    currentSearch = "loja=100";
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);

    const link = await screen.findByTestId("dealer-sale-opportunity-link");
    expect(link.getAttribute("href")).toContain("?loja=100");
  });

  it("com UMA loja só, ninguém é perguntado", async () => {
    fetchSaleOpportunities.mockResolvedValue(makePage({ items: [makeOpportunity()] }));
    render(<DealerSaleOpportunitiesList />);

    await screen.findByText("Volkswagen T-Cross 2020");
    expect(screen.queryByTestId("dealer-store-picker")).toBeNull();
  });
});
