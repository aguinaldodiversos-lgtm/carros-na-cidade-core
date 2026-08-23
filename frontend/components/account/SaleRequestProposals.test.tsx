// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestDetail from "./SaleRequestDetail";
import type {
  SaleRequest,
  SaleRequestProposal,
  SaleRequestSelectedOffer,
} from "@/lib/sale-requests/api";

/**
 * "Propostas recebidas" e a seleção preliminar (Fase 4.4).
 *
 * O componente é exercitado DENTRO do detalhe, e não isolado, de propósito: o
 * que precisa ser provado é o comportamento que o proprietário vê — a lista
 * aparecendo no lugar certo, o diálogo interceptando o clique, e a tela inteira
 * mudando de estado depois da escolha. Um teste do componente solto provaria que
 * ele renderiza props, o que ninguém duvida.
 *
 * Mocka o MÓDULO de dados, não o `fetch`, e preserva os helpers puros com
 * `importOriginal` — convenção da casa. `formatMoneyValue` é o de verdade: se
 * ele quebrar, os valores desta tela acusam aqui.
 */

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const getSaleRequest = vi.fn();
const cancelSaleRequest = vi.fn();
const selectSaleRequestOffer = vi.fn();

vi.mock("@/lib/sale-requests/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/api")>();
  return {
    ...actual,
    getSaleRequest: (...args: unknown[]) => getSaleRequest(...args),
    cancelSaleRequest: (...args: unknown[]) => cancelSaleRequest(...args),
    selectSaleRequestOffer: (...args: unknown[]) => selectSaleRequestOffer(...args),
  };
});

const { SaleRequestError } = await import("@/lib/sale-requests/api");

/**
 * Ficha RESPONDIDA — declarada AQUI, e não importada de `SaleRequests.test.tsx`.
 *
 * Aquele arquivo a exporta, e importá-la de lá parece economia. Não é: importar
 * um arquivo `*.test.tsx` executa as suítes dele DENTRO deste, com os mocks
 * deste — e as duas se atrapalham. Uma cópia de fixture custa menos que um
 * acoplamento entre suítes.
 */
const ANSWERED_EVALUATION = {
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
} satisfies Partial<SaleRequest>;

function makeRequest(overrides: Partial<SaleRequest> = {}): SaleRequest {
  return {
    id: 42,
    brand: "Volkswagen",
    brand_slug: "volkswagen",
    model: "T-Cross",
    model_slug: "t-cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: "005340-0",
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    minimum_accepted_price: "60000.00",
    year: 2020,
    mileage: 45000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...ANSWERED_EVALUATION,
    status: "receiving_offers",
    images: [],
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    created_at: "2026-08-20T12:00:00.000Z",
    updated_at: "2026-08-20T12:00:00.000Z",
    ...overrides,
  } as SaleRequest;
}

const PRIME: SaleRequestProposal = {
  id: 18,
  store_name: "Prime Veículos",
  store_city: "Atibaia - SP",
  amount: "67000.00",
  created_at: "2026-08-21T10:00:00.000Z",
  is_highest: true,
};

const AUTO_CENTER: SaleRequestProposal = {
  id: 11,
  store_name: "Auto Center Atibaia",
  store_city: "Atibaia - SP",
  amount: "65000.00",
  created_at: "2026-08-21T09:00:00.000Z",
  is_highest: false,
};

const SELECTED: SaleRequestSelectedOffer = {
  id: 11,
  store_name: "Auto Center Atibaia",
  store_city: "Atibaia - SP",
  // Fase 4.7 — o endereço comercial, entregue no handoff.
  store_address: "Rua das Lojas, 120",
  amount: "65000.00",
  selected_at: "2026-08-21T11:00:00.000Z",
};

/** O detalhe com disputa aberta e duas propostas — o cenário padrão. */
function mockDispute(overrides: Record<string, unknown> = {}) {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest(),
    proposals: [PRIME, AUTO_CENTER],
    selected_offer: null,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

// ============================================================================
describe("a lista de propostas", () => {
  it("mostra loja, cidade e valor de cada proposta atual", async () => {
    mockDispute();
    render(<SaleRequestDetail id="42" />);

    const section = await screen.findByTestId("sale-request-proposals");

    expect(within(section).getByText("Prime Veículos")).toBeTruthy();
    expect(within(section).getByText("Auto Center Atibaia")).toBeTruthy();
    expect(within(section).getAllByText("Atibaia - SP")).toHaveLength(2);
    expect(within(section).getByText("R$ 67.000,00")).toBeTruthy();
    expect(within(section).getByText("R$ 65.000,00")).toBeTruthy();
  });

  it("preserva a ordem do servidor e marca APENAS a maior", async () => {
    mockDispute();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    const cards = screen.getAllByTestId("sale-request-proposal");

    // A ordem vem do servidor; a tela não reordena nada.
    expect(cards[0].getAttribute("data-proposal-id")).toBe("18");
    expect(cards[1].getAttribute("data-proposal-id")).toBe("11");
    expect(screen.getAllByTestId("sale-request-proposal-highest")).toHaveLength(1);
  });

  it("TODA proposta tem o botão de selecionar — a menor não é bloqueada", async () => {
    mockDispute();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    const buttons = screen.getAllByTestId("sale-request-proposal-select");

    expect(buttons).toHaveLength(2);
    // Nenhum desabilitado, nenhum "recomendado": empurrar para o maior valor
    // seria um leilão automático disfarçado de escolha.
    for (const button of buttons) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
    }
  });

  it("sem proposta nenhuma, mostra o estado vazio e nenhum botão", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest(),
      proposals: [],
      selected_offer: null,
    });
    render(<SaleRequestDetail id="42" />);

    expect(await screen.findByTestId("sale-request-proposals-empty")).toBeTruthy();
    expect(screen.queryByTestId("sale-request-proposal-select")).toBeNull();
  });

  /**
   * §16 — ANTES do match, nenhum contato da loja aparece.
   *
   * Herdado do E2E da 4.4 (passo 2), aposentado pela 4.7. A 4.7 entrega o
   * WhatsApp COMERCIAL da loja aceita — mas só DEPOIS de aceitar. Enquanto a
   * disputa está aberta, a lista mostra nome, cidade e valor, e mais nada: o
   * proprietário não pode contornar a plataforma ligando para os concorrentes
   * antes de decidir.
   *
   * A lista estrita ("whatsapp", "telefone", "e-mail") continua valendo AQUI —
   * é o `FORBIDDEN_CONTACT` reduzido da 4.7 que vale só depois do handoff.
   */
  it("a lista de propostas não entrega contato NENHUM antes do match", async () => {
    mockDispute();
    const { container } = render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    const text = (container.textContent ?? "").toLowerCase();

    for (const term of ["whatsapp", "telefone", "e-mail", "email"]) {
      expect(text, `a tela vazou "${term}" antes do match`).not.toContain(term);
    }
    // E nenhum botão de contato disfarçado de ação.
    expect(screen.queryByTestId("handoff-whatsapp")).toBeNull();
  });

  it("a seção NÃO aparece numa solicitação cancelada", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "cancelled" }),
      proposals: [],
      selected_offer: null,
    });
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-detail");
    expect(screen.queryByTestId("sale-request-proposals")).toBeNull();
  });
});

// ============================================================================
describe("o diálogo de confirmação", () => {
  it("o clique NÃO seleciona direto — abre o diálogo primeiro", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[1]);

    expect(await screen.findByTestId("sale-request-select-dialog")).toBeTruthy();
    // A ação irreversível ainda não aconteceu.
    expect(selectSaleRequestOffer).not.toHaveBeenCalled();
  });

  /**
   * FASE 4.7 — A COPY INVERTEU, E A ASSERÇÃO INVERTEU COM ELA.
   *
   * Este teste exigia "Esta seleção é preliminar" e "o valor ainda poderá ser
   * revisto". Fazia sentido enquanto a plataforma ia registrar avaliação e
   * proposta final: a escolha era mesmo um passo intermediário.
   *
   * A 4.7 tirou isso do produto. Aceitar é o COMPROMISSO das duas partes, e o
   * §4 é explícito de que a oferta não pode ser enfraquecida por linguagem —
   * "preliminar" e "sem compromisso" convidam a renegociar por esporte.
   *
   * A asserção foi INVERTIDA, e não removida: o diálogo continua tendo de
   * explicar a ressalva real (divergências relevantes permitem revisar ou
   * desistir) e o compromisso de quem aceita.
   */
  it("diz que a oferta é um COMPROMISSO, com a ressalva da avaliação presencial", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);

    const dialog = await screen.findByTestId("sale-request-select-dialog");
    const text = dialog.textContent ?? "";

    expect(text).toContain("Você está aceitando a oferta de");
    expect(text).toContain("avaliação presencial");
    // A ressalva REAL: divergências permitem revisar ou desistir.
    expect(text).toMatch(/divergências relevantes/i);
    expect(text).toMatch(/revisar o valor ou desistir da compra/i);
    // E o compromisso de quem aceita.
    expect(text).toMatch(/confirma sua intenção de vender/i);

    // A linguagem que ENFRAQUECERIA a oferta não pode voltar.
    expect(text).not.toMatch(/preliminar|sem compromisso|estimativa|simulação/i);
  });

  /**
   * A copy proibida.
   *
   * Não é preciosismo de redação: uma pessoa que leia "venda concluída" para de
   * considerar outras saídas para um carro que ainda tem, e descobre a diferença
   * na avaliação presencial — quando já recusou tudo o mais.
   */
  it("NUNCA promete venda concluída, oferta aceita ou pagamento", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);

    const dialog = await screen.findByTestId("sale-request-select-dialog");
    const text = (dialog.textContent ?? "").toLowerCase();

    for (const forbidden of [
      "venda concluída",
      "oferta aceita",
      "pagamento garantido",
      "negócio fechado",
      "parabéns",
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it("repete o VALOR, para que ninguém confirme às cegas no celular", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[1]);

    const dialog = await screen.findByTestId("sale-request-select-dialog");
    expect(within(dialog).getByText("R$ 65.000,00")).toBeTruthy();
    expect(within(dialog).getByText("Auto Center Atibaia")).toBeTruthy();
  });

  it("é acessível: role dialog, aria-modal e foco na saída segura", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);

    const dialog = await screen.findByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBeTruthy();
    expect(dialog.getAttribute("aria-describedby")).toBeTruthy();

    // O foco vai para "Voltar" — a opção NÃO destrutiva.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("sale-request-select-cancel"))
    );
  });

  it("Escape fecha sem selecionar", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);
    await screen.findByTestId("sale-request-select-dialog");

    await user.keyboard("{Escape}");

    await waitFor(() => expect(screen.queryByTestId("sale-request-select-dialog")).toBeNull());
    expect(selectSaleRequestOffer).not.toHaveBeenCalled();
  });

  it("Voltar fecha e devolve o foco ao botão que abriu", async () => {
    mockDispute();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    const opener = screen.getAllByTestId("sale-request-proposal-select")[1];
    await user.click(opener);
    await screen.findByTestId("sale-request-select-dialog");

    await user.click(screen.getByTestId("sale-request-select-cancel"));

    await waitFor(() => expect(screen.queryByTestId("sale-request-select-dialog")).toBeNull());
    // Sem isto, quem navega por teclado é jogado para o topo do documento e
    // perde o lugar na lista.
    expect(document.activeElement).toBe(opener);
  });
});

// ============================================================================
describe("a seleção", () => {
  it("envia a OFERTA apontada — e nada além dela", async () => {
    mockDispute();
    selectSaleRequestOffer.mockResolvedValue({ selected: SELECTED, changed: true });
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[1]);
    await user.click(await screen.findByTestId("sale-request-select-confirm"));

    await waitFor(() => expect(selectSaleRequestOffer).toHaveBeenCalledTimes(1));
    // Id da solicitação e id da proposta. O VALOR não viaja: o servidor o lê da
    // própria oferta, dentro da transação.
    expect(selectSaleRequestOffer).toHaveBeenCalledWith(42, 11);
  });

  /**
   * §28 na camada de tela: escolher a MENOR é um caminho normal, sem atrito
   * extra, sem confirmação adicional e sem aviso.
   */
  it("selecionar a proposta MENOR funciona igual à maior", async () => {
    mockDispute();
    selectSaleRequestOffer.mockResolvedValue({ selected: SELECTED, changed: true });
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");

    // O segundo cartão é o de R$ 65.000 — o menor.
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[1]);
    const dialog = await screen.findByTestId("sale-request-select-dialog");

    // Nenhum aviso perguntando se ela tem certeza de recusar mais dinheiro.
    expect((dialog.textContent ?? "").toLowerCase()).not.toContain("maior proposta");

    await user.click(screen.getByTestId("sale-request-select-confirm"));
    // FASE 4.7 — quem ocupa este espaço agora é o card de HANDOFF.
    await waitFor(() => expect(screen.getByTestId("owner-handoff")).toBeTruthy());
  });

  it("depois de selecionar, a tela mostra a escolhida e SOME com as perdedoras", async () => {
    mockDispute();
    selectSaleRequestOffer.mockResolvedValue({ selected: SELECTED, changed: true });
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[1]);
    await user.click(await screen.findByTestId("sale-request-select-confirm"));

    // FASE 4.7 — "Aguardando próxima etapa" SAIU.
    //
    // O painel da 4.4 prometia que "as próximas etapas de avaliação serão
    // disponibilizadas aqui". Elas não serão: a avaliação é combinada fora da
    // plataforma. O card de handoff diz o que de fato acontece agora — com quem
    // falar, por quanto, e onde a loja fica.
    const panel = await screen.findByTestId("owner-handoff");
    expect(within(panel).getByTestId("handoff-store-name").textContent).toBe(
      "Auto Center Atibaia"
    );
    expect(within(panel).getByTestId("handoff-amount").textContent).toMatch(/65\.000,00/);
    expect(panel.textContent).not.toContain("Aguardando próxima etapa");

    expect(screen.queryByText("Prime Veículos")).toBeNull();
    expect(screen.queryByTestId("sale-request-proposal-select")).toBeNull();
  });

  /**
   * FASE 4.7 — A REGRA DE CONTATO INVERTEU, E A ASSERÇÃO INVERTEU COM ELA.
   *
   * Até a 4.6 o estado escolhido não podia oferecer contato NENHUM: a
   * plataforma orquestrava a avaliação, e abrir um canal teria sido furar o
   * próprio desenho.
   *
   * A 4.7 fez o oposto por decisão de produto: o papel da plataforma termina no
   * match, e entregar o WhatsApp COMERCIAL da loja aceita é o produto. O que
   * continua proibido — e é o que este teste guarda — é PROMETER CONCLUSÃO e
   * vazar dado do outro lado.
   */
  it("o estado escolhido entrega o contato da loja, sem prometer conclusão", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "offer_selected" }),
      proposals: [],
      selected_offer: SELECTED,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      round: { number: 1, minimum_accepted_price: "60000.00" },
      selection_history: [],
    });
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-handoff");

    // O contato da LOJA é o produto desta fase.
    expect(within(panel).getByTestId("handoff-whatsapp")).toBeTruthy();

    // O que continua proibido.
    const text = (panel.textContent ?? "").toLowerCase();
    for (const forbidden of [
      "venda concluída",
      "veículo vendido",
      "negócio fechado",
      "pagamento",
    ]) {
      expect(text, forbidden).not.toContain(forbidden);
    }
  });

  /**
   * FASE 4.7 — "AGUARDANDO PRÓXIMA ETAPA" DEIXOU DE EXISTIR.
   *
   * O teste anterior exigia essa frase em `offer_selected`, e o seguinte exigia
   * que ela sumisse quando a avaliação começava. Os dois descreviam um painel
   * que orquestrava etapas.
   *
   * Não há mais etapa a aguardar: aceitar a oferta ENTREGA o contato, e o que
   * acontece depois é entre as duas partes. A asserção que sobra é a que
   * importa — a tela não pede que a pessoa espere por algo que não vem.
   */
  it("não pede que a pessoa aguarde uma etapa que a plataforma não executa", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "offer_selected" }),
      proposals: [],
      selected_offer: SELECTED,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      round: { number: 1, minimum_accepted_price: "60000.00" },
      selection_history: [],
    });
    const { container } = render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff");

    const text = (container.textContent ?? "").toLowerCase();
    expect(text).not.toContain("aguardando próxima etapa");
    expect(text).not.toContain("próximas etapas de avaliação");
    // E diz o que a pessoa deve fazer AGORA.
    expect(text).toContain("entre em contato com a loja");
  });

  it("depois que a avaliação começa, o painel PARA de dizer 'aguardando'", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "inspection_scheduled" }),
      proposals: [],
      selected_offer: SELECTED,
      inspection: {
        state: "scheduled",
        slots: [],
        scheduled_at: "2026-08-25T14:30:00-03:00",
        completed_at: null,
        store: { name: "Auto Center Atibaia", address: "Rua X, 1", city: "Atibaia - SP" },
        observed: null,
      },
      final_decision: null,
    });
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("sale-request-selected-offer");

    // O resumo do negócio permanece — é o que a pessoa precisa para lembrar
    // com quem e por quanto.
    //
    // O VALOR é conferido pelo testid, e não por `textContent`:
    // `formatMoneyValue` usa `Intl` com `style: "currency"`, que separa "R$" do
    // número com NBSP (U+00A0). O testing-library normaliza espaços nos seus
    // matchers, mas `textContent` cru não — comparar a string literal aqui
    // falharia por um caractere invisível.
    expect(panel.textContent).toContain("Auto Center Atibaia");
    expect(within(panel).getByTestId("sale-request-selected-amount").textContent).toContain(
      "65.000,00"
    );

    // O texto de espera, não: a etapa atual está logo abaixo.
    expect(panel.textContent).not.toContain("Aguardando próxima etapa");
    expect(panel.textContent).not.toContain("serão disponibilizadas");
  });

  it("depois da seleção, o botão de CANCELAR desaparece", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "offer_selected" }),
      proposals: [],
      selected_offer: SELECTED,
    });
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-detail");

    // Renderizá-lo desabilitado, ou para receber um 409, diria que a reversão
    // existe e está indisponível — quando ela não existe nesta fase.
    expect(screen.queryByTestId("sale-request-cancel-button")).toBeNull();
    expect(screen.getByTestId("sale-request-selected-note")).toBeTruthy();
  });

  it("o cabeçalho passa a dizer 'Oferta aceita', nunca 'Vendido'", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "offer_selected" }),
      proposals: [],
      selected_offer: SELECTED,
    });
    render(<SaleRequestDetail id="42" />);

    const status = await screen.findByTestId("sale-request-detail-status");
    expect(status.textContent).toBe("Oferta aceita");
  });
});

// ============================================================================
describe("os erros da seleção", () => {
  /**
   * §9 na camada de tela: a loja aumentou entre a renderização e o clique.
   *
   * O diálogo fecha e a tela RECARREGA. Deixar o erro na tela e o diálogo aberto
   * convidaria a clicar de novo no mesmo botão — que produziria exatamente o
   * mesmo 409, porque a proposta apontada continua obsoleta.
   */
  it("proposta obsoleta fecha o diálogo e recarrega o detalhe", async () => {
    mockDispute();
    selectSaleRequestOffer.mockRejectedValue(
      new SaleRequestError("Recarregue.", 409, "SALE_REQUEST_OFFER_STALE")
    );
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    expect(getSaleRequest).toHaveBeenCalledTimes(1);

    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);
    await user.click(await screen.findByTestId("sale-request-select-confirm"));

    await waitFor(() => expect(getSaleRequest).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId("sale-request-select-dialog")).toBeNull();
  });

  it("outro erro fica visível DENTRO do diálogo, sem perder o contexto", async () => {
    mockDispute();
    selectSaleRequestOffer.mockRejectedValue(
      new SaleRequestError(
        "Você já selecionou uma proposta para esta solicitação.",
        409,
        "SALE_REQUEST_ALREADY_SELECTED"
      )
    );
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("sale-request-proposals");
    await user.click(screen.getAllByTestId("sale-request-proposal-select")[0]);
    await user.click(await screen.findByTestId("sale-request-select-confirm"));

    const error = await screen.findByTestId("sale-request-select-error");
    expect(error.textContent).toContain("já selecionou");
    // O diálogo continua aberto: o erro fala sobre a ação que estava sendo
    // confirmada ali.
    expect(screen.getByTestId("sale-request-select-dialog")).toBeTruthy();
  });
});
