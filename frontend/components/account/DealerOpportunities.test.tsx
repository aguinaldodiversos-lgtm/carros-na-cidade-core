// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import DealerOpportunitiesList from "./DealerOpportunitiesList";
import DealerOpportunityDetail from "./DealerOpportunityDetail";
import { EMPTY_DEALER_FILTERS, type DealerOpportunity } from "@/lib/purchase-intents/api";

/**
 * "Compradores ativos" — a superfície do lojista.
 *
 * Além dos estados de tela, este arquivo trava duas coisas que definem o
 * produto: a ausência TOTAL de identidade do comprador na tela, e a ausência do
 * que ainda não existe (WhatsApp, agendar, chat, leilão). Um botão desses
 * aparecendo aqui prometeria um fluxo inexistente.
 *
 * A seção de estoque da Fase 3 tem arquivo próprio
 * (`DealerMatchingStock.test.tsx`). Aqui ela é apenas MOCKADA no nível do
 * cliente HTTP: o detalhe da oportunidade precisa continuar sendo testável sem
 * depender do estoque, que é justamente a separação que o produto exige.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const fetchMatchingAds = vi.fn();

vi.mock("@/lib/purchase-intents/offers", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/offers")>();
  return {
    ...actual,
    fetchMatchingAds: (...args: unknown[]) => fetchMatchingAds(...args),
  };
});

const fetchDealerOpportunities = vi.fn();
const fetchDealerOpportunity = vi.fn();

vi.mock("@/lib/purchase-intents/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/api")>();
  return {
    ...actual,
    fetchDealerOpportunities: (...args: unknown[]) => fetchDealerOpportunities(...args),
    fetchDealerOpportunity: (...args: unknown[]) => fetchDealerOpportunity(...args),
  };
});

function makeOpportunity(overrides: Partial<DealerOpportunity> = {}): DealerOpportunity {
  return {
    id: 1,
    intent_type: "specific_model",
    brand: "Volkswagen",
    model: "T-Cross",
    body_type: null,
    transmission: "automatico",
    max_price: "95000.00",
    purchase_timeframe: "within_30_days",
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 30 * 86400000).toISOString(),
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    ...overrides,
  };
}

/** Uma página do feed, no formato que `fetchDealerOpportunities` devolve. */
function makePage(items: DealerOpportunity[] = []) {
  return {
    items,
    next_cursor: null,
    limit: 20,
    sort: "recent" as const,
    summary: { total: items.length },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchDealerOpportunities.mockResolvedValue(makePage());
  fetchDealerOpportunity.mockResolvedValue(makeOpportunity());
  fetchMatchingAds.mockResolvedValue({
    matching_ads: [],
    limit: { max_per_dealer: 3, used: 0, remaining: 3 },
  });
});

afterEach(cleanup);

describe("DealerOpportunitiesList — estados", () => {
  it("carrega com ESQUELETO de card, não com spinner", async () => {
    render(<DealerOpportunitiesList />);

    // O esqueleto tem a mesma estrutura de altura do card final; um spinner
    // centralizado devolveria o salto de layout na hora em que a lista chega.
    expect(screen.getByTestId("active-buyer-loading")).toBeInTheDocument();
    expect(screen.getAllByTestId("active-buyer-skeleton").length).toBeGreaterThan(0);

    await waitFor(() => expect(fetchDealerOpportunities).toHaveBeenCalled());
    await waitFor(() =>
      expect(screen.queryByTestId("active-buyer-loading")).not.toBeInTheDocument()
    );
  });

  it("cidade sem comprador mostra estado vazio, não erro", async () => {
    render(<DealerOpportunitiesList />);
    const empty = await screen.findByTestId("dealer-opportunities-empty");
    expect(empty).toHaveTextContent(/Nenhuma procura ativa encontrada/i);
    expect(screen.queryByTestId("dealer-opportunities-error")).not.toBeInTheDocument();
    // Vazio NÃO é "0 oportunidades ativas" no cabeçalho: a contagem só aparece
    // quando há o que contar.
    expect(screen.queryByTestId("active-buyer-total")).not.toBeInTheDocument();
  });

  it("lista os cards com o veículo procurado, o orçamento e a cidade", async () => {
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("active-buyer-card");
    expect(card).toHaveTextContent("Volkswagen T-Cross");
    expect(card).toHaveTextContent("Automático");
    expect(card).toHaveTextContent("Até");
    expect(card).toHaveTextContent("R$ 95.000");
    expect(card).toHaveTextContent("Atibaia - SP");
    expect(screen.getByTestId("active-buyer-cta")).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/compradores/1"
    );
  });

  it("etiqueta de modo sai do CAMPO, e o texto não depende da cor", async () => {
    fetchDealerOpportunities.mockResolvedValue(
      makePage([
        makeOpportunity({ id: 1 }),
        makeOpportunity({
          id: 2,
          intent_type: "open_category",
          brand: null,
          model: null,
          body_type: "suv",
        }),
      ])
    );
    render(<DealerOpportunitiesList />);

    const badges = await screen.findAllByTestId("active-buyer-badge");
    expect(badges[0]).toHaveTextContent("Compra específica");
    expect(badges[0]).toHaveAttribute("data-intent-type", "specific_model");
    expect(badges[1]).toHaveTextContent("Categoria aberta");
    expect(badges[1]).toHaveAttribute("data-intent-type", "open_category");
  });

  it("modo aberto: título traz carroceria E teto", async () => {
    fetchDealerOpportunities.mockResolvedValue(
      makePage([
        makeOpportunity({
          intent_type: "open_category",
          brand: null,
          model: null,
          body_type: "suv",
          max_price: "90000.00",
        }),
      ])
    );
    render(<DealerOpportunitiesList />);
    expect(await screen.findByTestId("active-buyer-title")).toHaveTextContent(
      "SUV até R$ 90.000"
    );
  });

  it("erro mostra retry e o retry refaz a busca", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockRejectedValueOnce(new Error("backend fora"));
    render(<DealerOpportunitiesList />);

    const box = await screen.findByTestId("dealer-opportunities-error");
    expect(box).toHaveTextContent("backend fora");
    // Falha NÃO se disfarça de "nenhum resultado".
    expect(box).toHaveTextContent(/Não foi possível carregar as oportunidades/i);
    expect(screen.queryByTestId("dealer-opportunities-empty")).not.toBeInTheDocument();
    expect(screen.queryByTestId("active-buyer-total")).not.toBeInTheDocument();

    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    await user.click(screen.getByRole("button", { name: /Tentar novamente/i }));
    expect(await screen.findByTestId("active-buyer-card")).toBeVisible();
  });

  it("a contagem do cabeçalho vem do SERVIDOR, não do tamanho da página", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      ...makePage([makeOpportunity({ id: 1 }), makeOpportunity({ id: 2 })]),
      summary: { total: 53 },
    });
    render(<DealerOpportunitiesList />);

    // Dois cards na tela, cinquenta e três na cidade. `items.length` diria "2".
    expect(await screen.findByTestId("active-buyer-total")).toHaveTextContent(
      "53 oportunidades ativas"
    );
  });

  it("sem contagem no payload, o cabeçalho OMITE — nunca cai para o da página", async () => {
    fetchDealerOpportunities.mockResolvedValue({
      ...makePage([makeOpportunity()]),
      summary: { total: null },
    });
    render(<DealerOpportunitiesList />);

    await screen.findByTestId("active-buyer-card");
    expect(screen.queryByTestId("active-buyer-total")).not.toBeInTheDocument();
  });

  it("NÃO envia city_id — quem decide a cidade é o backend", async () => {
    render(<DealerOpportunitiesList />);
    await waitFor(() => expect(fetchDealerOpportunities).toHaveBeenCalled());

    // O argumento carrega filtros, ordenação e cursor — nunca cidade. Se
    // carregasse, o lojista escolheria o que vê.
    expect(fetchDealerOpportunities).toHaveBeenCalledWith({
      filters: EMPTY_DEALER_FILTERS,
      sort: "recent",
      cursor: null,
    });
    for (const call of fetchDealerOpportunities.mock.calls) {
      expect(JSON.stringify(call)).not.toMatch(/city|cidade/i);
    }
  });

  it("a cidade da barra é LIDA da resposta, e some quando não há resposta", async () => {
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("dealer-opportunities-empty");
    // Lista vazia: nenhuma cidade a exibir. Um nome fixo aqui seria inventado.
    expect(screen.queryByTestId("active-buyer-city-scope")).not.toBeInTheDocument();

    cleanup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    expect(await screen.findByTestId("active-buyer-city-scope")).toHaveTextContent("Atibaia - SP");
  });

  it("card: CTA com 44px e alinhado no rodapé por `mt-auto`", async () => {
    fetchDealerOpportunities.mockResolvedValue(
      makePage([makeOpportunity({ model: "Modelo Muito Longo Para Estourar A Largura" })])
    );
    render(<DealerOpportunitiesList />);

    const cta = await screen.findByTestId("active-buyer-cta");
    expect(cta.className).toContain("h-11");
    // É `mt-auto` no ENVOLTÓRIO do CTA que iguala a altura do botão entre cards
    // de títulos diferentes. O gate geométrico de verdade — bounding boxes num
    // navegador real — está em `e2e/active-buyers-card-grid.spec.ts`; esta
    // asserção só evita que o mecanismo suma numa refatoração de classes.
    expect(cta.parentElement?.className).toContain("mt-auto");
    // E o título NÃO trunca: o modelo é o dado que decide a abordagem (§32).
    expect((await screen.findByTestId("active-buyer-title")).className).not.toContain("truncate");
  });
});

describe("filtros — cada controle refaz a consulta do SERVIDOR", () => {
  it("trocar o câmbio dispara uma request nova, com o filtro dentro", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("active-buyer-card");

    await user.selectOptions(screen.getByLabelText("Câmbio"), "manual");

    await waitFor(() =>
      expect(fetchDealerOpportunities).toHaveBeenLastCalledWith({
        filters: { ...EMPTY_DEALER_FILTERS, transmission: "manual" },
        sort: "recent",
        cursor: null,
      })
    );
  });

  it("trocar a ordenação também vai ao servidor — nunca reordena o carregado", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("active-buyer-card");

    await user.selectOptions(screen.getByLabelText("Ordenar por"), "budget_desc");

    // Ordenar no cliente mostraria o maior orçamento DESTA página, não o da
    // cidade — a lista é paginada.
    await waitFor(() =>
      expect(fetchDealerOpportunities).toHaveBeenLastCalledWith({
        filters: EMPTY_DEALER_FILTERS,
        sort: "budget_desc",
        cursor: null,
      })
    );
  });

  it("'Limpar filtros' volta ao estado inicial", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("active-buyer-card");

    await user.selectOptions(screen.getByLabelText("Câmbio"), "manual");
    await user.selectOptions(screen.getByLabelText("Tipo de procura"), "open_category");
    expect(await screen.findAllByTestId("active-buyer-chip")).toHaveLength(2);

    await user.click(screen.getByTestId("active-buyer-clear-filters"));

    await waitFor(() =>
      expect(fetchDealerOpportunities).toHaveBeenLastCalledWith({
        filters: EMPTY_DEALER_FILTERS,
        sort: "recent",
        cursor: null,
      })
    );
    expect(screen.queryByTestId("active-buyer-chip")).not.toBeInTheDocument();
  });

  it("um chip remove só o SEU filtro", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("active-buyer-card");

    await user.selectOptions(screen.getByLabelText("Câmbio"), "manual");
    await user.selectOptions(screen.getByLabelText("Tipo de procura"), "open_category");
    const chips = await screen.findAllByTestId("active-buyer-chip");
    await user.click(chips[0]);

    await waitFor(() =>
      expect(fetchDealerOpportunities).toHaveBeenLastCalledWith({
        filters: { ...EMPTY_DEALER_FILTERS, transmission: "manual" },
        sort: "recent",
        cursor: null,
      })
    );
  });

  it("a barra de filtros continua montada no VAZIO — é a saída do estado", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);
    await screen.findByTestId("active-buyer-card");

    fetchDealerOpportunities.mockResolvedValue(makePage([]));
    await user.selectOptions(screen.getByLabelText("Câmbio"), "cvt");

    const empty = await screen.findByTestId("dealer-opportunities-empty");
    expect(empty).toHaveTextContent(/Nenhuma procura ativa com esses filtros/i);
    // Sem a barra aqui, não haveria como desfazer o filtro que esvaziou a tela.
    expect(screen.getByTestId("active-buyer-clear-filters")).toBeVisible();
  });

  it("a marca escolhida NÃO some do seletor quando o feed encolhe", async () => {
    const user = userEvent.setup();
    fetchDealerOpportunities.mockResolvedValue(
      makePage([
        makeOpportunity({ id: 1, brand: "Volkswagen" }),
        makeOpportunity({ id: 2, brand: "Fiat" }),
      ])
    );
    render(<DealerOpportunitiesList />);
    await screen.findAllByTestId("active-buyer-card");

    // Filtrar por Fiat faz o feed devolver só Fiat. Se as opções saíssem do
    // `items` atual, "Volkswagen" sumiria e o lojista ficaria preso no filtro.
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity({ id: 2, brand: "Fiat" })]));
    await user.selectOptions(screen.getByLabelText("Marca"), "Fiat");
    await screen.findByTestId("active-buyer-card");

    expect(
      within(screen.getByLabelText("Marca") as HTMLSelectElement).getByRole("option", {
        name: "Volkswagen",
      })
    ).toBeInTheDocument();
  });

  it("NÃO existe filtro de combustível nem de ano — o domínio não tem os campos", () => {
    render(<DealerOpportunitiesList />);

    // Um `<select>` que abre, oferece opções e não filtra nada é o pior tipo de
    // controle: parece funcionar. `purchase_intents` não tem essas colunas.
    expect(screen.queryByLabelText(/combust[íi]vel/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/ano/i)).not.toBeInTheDocument();
  });

  it("a cidade é TEXTO, não seletor: o backend não aceita cidade do cliente", async () => {
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);

    const scope = await screen.findByTestId("active-buyer-city-scope");
    expect(scope.tagName).toBe("P");
    expect(screen.queryByLabelText(/^cidade$/i)).not.toBeInTheDocument();
  });
});

describe("privacidade do comprador na TELA do lojista", () => {
  const PII = /nome|e-?mail|telefone|whatsapp|cpf|contato|falar com/i;

  it("o card não exibe nada que identifique o comprador", async () => {
    fetchDealerOpportunities.mockResolvedValue(makePage([makeOpportunity()]));
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("active-buyer-card");
    expect(card.textContent || "").not.toMatch(PII);
  });

  /*
    PROVA ESTRUTURAL, e não só de texto.

    A asserção de texto acima pega o rótulo ("Telefone:"); esta pega o VALOR que
    chegaria sem rótulo nenhum. Um payload adulterado com `buyer_name: "Maria"`
    renderizado num canto do card passaria pela primeira e morre nesta — o card
    é varrido atrás de qualquer chave de identidade tanto no DOM quanto nos
    atributos.
  */
  it("nem no DOM nem nos atributos: varredura estrutural do card", async () => {
    fetchDealerOpportunities.mockResolvedValue(
      makePage([
        {
          ...makeOpportunity(),
          // Campos que o backend NÃO manda. Se um dia mandar, o card não pode
          // passar a exibi-los por acidente.
          buyer_user_id: 987654321,
          buyer_name: "Maria Souza",
          buyer_phone: "11999998888",
          email: "maria@example.com",
        } as unknown as DealerOpportunity,
      ])
    );
    render(<DealerOpportunitiesList />);

    const card = await screen.findByTestId("active-buyer-card");
    const serialized = `${card.outerHTML}`;

    /*
      Os valores-sentinela são LONGOS de propósito.

      Um id curto como `77` casaria por acaso com as coordenadas dos `<path>` da
      ilustração e reprovaria um card correto — um teste que falha sem defeito é
      desligado na primeira vez que atrapalha, e some junto com a proteção que
      ele dava.
    */
    for (const forbidden of [
      "Maria",
      "Souza",
      "11999998888",
      "maria@example.com",
      "987654321",
    ]) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it("o detalhe não exibe nada que identifique o comprador", async () => {
    render(<DealerOpportunityDetail id={1} />);
    const detail = await screen.findByTestId("dealer-opportunity-detail");
    expect(detail.textContent || "").not.toMatch(PII);
  });
});

describe("DealerOpportunityDetail", () => {
  it("mostra os dados da procura", async () => {
    render(<DealerOpportunityDetail id={1} />);

    expect(await screen.findByTestId("dealer-opportunity-detail")).toBeVisible();
    expect(screen.getByText(/Comprador procura/i)).toBeVisible();
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Volkswagen T-Cross");
    expect(screen.getByText("Até R$ 95.000")).toBeVisible();
    expect(screen.getByText("Atibaia - SP")).toBeVisible();
    expect(screen.getByText("Em até 30 dias")).toBeVisible();
  });

  it("traz a seção de estoque da Fase 3, mas nada da Fase 4", async () => {
    // A Fase 3 acrescentou "Veículos do seu estoque" + "Enviar ao comprador".
    // O que continua NÃO existindo — e não pode aparecer nem como botão morto —
    // é a etapa de contato: WhatsApp, agendamento, chat e leilão.
    render(<DealerOpportunityDetail id={1} />);
    await screen.findByTestId("dealer-opportunity-detail");
    expect(await screen.findByTestId("dealer-matching-stock")).toBeVisible();

    expect(screen.queryByText(/whatsapp/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/agendar/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/conversar|chat|mensagem/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/lance|leil[ãa]o/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pr[óo]xima etapa/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/em breve/i)).not.toBeInTheDocument();
  });

  it("404 de outra cidade vira estado de erro sem revelar existência", async () => {
    fetchDealerOpportunity.mockRejectedValue(new Error("Oportunidade não encontrada."));
    render(<DealerOpportunityDetail id={999} />);

    const box = await screen.findByTestId("dealer-opportunity-error");
    expect(box).toHaveTextContent("Oportunidade não encontrada.");
    // A mensagem não diz "de outra cidade".
    expect(box.textContent || "").not.toMatch(/cidade|Atibaia|Bragan/i);
    expect(screen.getByRole("link", { name: /Voltar para compradores ativos/i })).toHaveAttribute(
      "href",
      "/dashboard-loja/oportunidades/compradores"
    );
  });
});
