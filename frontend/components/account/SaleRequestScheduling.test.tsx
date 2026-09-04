// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestDetail from "./SaleRequestDetail";
import DealerSaleOpportunityDetail from "./DealerSaleOpportunityDetail";
import type { SaleRequest } from "@/lib/sale-requests/api";

/**
 * O AGENDAMENTO DA AVALIAÇÃO + O WHATSAPP COMO SEGUNDA OPÇÃO (Fase 4.9B).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * AS DUAS AFIRMAÇÕES QUE ESTE ARQUIVO EXISTE PARA SUSTENTAR
 * ════════════════════════════════════════════════════════════════════════════
 * 1. O portal VOLTOU a agendar — o proprietário escolhe horário, pede outros e
 *    vê o confirmado; o lojista propõe.
 * 2. A avaliação NÃO voltou junto. Nem ficha, nem quilometragem observada, nem
 *    proposta final, nem aceite dela.
 *
 * A segunda é a mais fácil de perder. Restaurar UI de agenda a partir dos
 * componentes antigos era, literalmente, copiar arquivos que também continham os
 * três formulários aposentados — e ninguém percebe um campo a mais no meio de
 * 800 linhas até ele aparecer na tela de alguém.
 *
 * ════════════════════════════════════════════════════════════════════════════
 * POR QUE A VARREDURA É SOBRE O DOM RENDERIZADO, E NÃO UM GREP (§24)
 * ════════════════════════════════════════════════════════════════════════════
 * "Motor", "Câmbio" e "Pneus" aparecem — legitimamente — na FICHA DECLARADA pelo
 * proprietário, que as duas telas mostram e que não tem nada a ver com a
 * avaliação da loja. Um grep global acusaria as duas coisas, seria silenciado no
 * primeiro falso positivo, e pararia de proteger qualquer uma.
 *
 * Então a varredura é contextual: procura os rótulos que SÓ o formulário de
 * avaliação tinha ("Quilometragem lida no veículo", "Registrar avaliação",
 * "Registrar proposta final"), dentro do painel do agendamento.
 *
 * O único teste de FONTE deste arquivo é o do §22, e ele é sobre os três
 * writers aposentados — nomes de função, que não têm homônimo inocente.
 */

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
}));

const getSaleRequest = vi.fn();
const selectSaleRequestOffer = vi.fn();
const confirmInspectionSlot = vi.fn();
const requestNewInspectionSlots = vi.fn();

vi.mock("@/lib/sale-requests/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/api")>();
  return {
    ...actual,
    getSaleRequest: (...args: unknown[]) => getSaleRequest(...args),
    cancelSaleRequest: vi.fn(),
    selectSaleRequestOffer: (...args: unknown[]) => selectSaleRequestOffer(...args),
    confirmInspectionSlot: (...args: unknown[]) => confirmInspectionSlot(...args),
    requestNewInspectionSlots: (...args: unknown[]) => requestNewInspectionSlots(...args),
  };
});

/**
 * ════════════════════════════════════════════════════════════════════════════
 * FUSO DECLARADO — este arquivo afirma HORÁRIOS DE PAREDE
 * ════════════════════════════════════════════════════════════════════════════
 * As fixtures trazem instantes com offset explícito (`2026-08-25T10:00:00-03:00`)
 * e as asserções são literais: `"25/08 às 10:00"`. Um literal desses não é
 * propriedade do instante — é propriedade do instante MAIS o fuso de quem lê.
 *
 * E ler no fuso de quem lê é o contrato deliberado de `formatSlot`, documentado
 * em `lib/sale-requests/inspection.ts`: o proprietário em Manaus e a loja em
 * Atibaia veem o mesmo instante, cada um no relógio da parede dele. A produção
 * está certa; o que faltava era o teste dizer de qual parede está falando.
 *
 * Sem esta linha o arquivo passava na máquina de quem escreveu (UTC−3) e
 * falhava no runner do CI (UTC) por exatamente 3 horas — quatro testes vermelhos
 * que não descreviam defeito nenhum. Ver
 * `lib/sale-requests/inspection.formatSlot.test.ts`, que prova o contrato
 * rodando a MESMA entrada nos dois fusos.
 *
 * Efeito colateral que vale registrar: sob UTC, as asserções de AUSÊNCIA deste
 * arquivo (`queryByText(/25\/08 às 14:00/)).not.toBeInTheDocument()`) passavam
 * por vacuidade — a tela mostrava "17:00", então "14:00" estava ausente com ou
 * sem o defeito que elas existem para pegar. Fixar o fuso as torna verdadeiras
 * de novo.
 */
const TZ_ORIGINAL = process.env.TZ;
process.env.TZ = "America/Sao_Paulo";
afterAll(() => {
  if (TZ_ORIGINAL === undefined) delete process.env.TZ;
  else process.env.TZ = TZ_ORIGINAL;
});

const fetchHandoffWhatsapp = vi.fn();
const reportNoAgreement = vi.fn();
const openNewRound = vi.fn();

vi.mock("@/lib/sale-requests/handoff-api", () => ({
  fetchHandoffWhatsapp: (...args: unknown[]) => fetchHandoffWhatsapp(...args),
  reportNoAgreement: (...args: unknown[]) => reportNoAgreement(...args),
  openNewRound: (...args: unknown[]) => openNewRound(...args),
}));

const fetchSaleOpportunity = vi.fn();
const offerInspectionSlots = vi.fn();

vi.mock("@/lib/sale-requests/dealer-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/dealer-api")>();
  return {
    ...actual,
    fetchSaleOpportunity: (...args: unknown[]) => fetchSaleOpportunity(...args),
    offerInspectionSlots: (...args: unknown[]) => offerInspectionSlots(...args),
  };
});

const { SaleRequestError, INSPECTION_CODE } = await import("@/lib/sale-requests/api");
const { HANDOFF_CODE } = await import("@/lib/sale-requests/handoff");

// ────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ────────────────────────────────────────────────────────────────────────────

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
    mileage: 62000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    ...ANSWERED_EVALUATION,
    status: "offer_selected",
    images: [],
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    created_at: "2026-08-20T12:00:00.000Z",
    updated_at: "2026-08-23T12:00:00.000Z",
    ...overrides,
  } as SaleRequest;
}

const SELECTED_A = {
  id: 11,
  store_name: "Auto Center Atibaia",
  store_city: "Atibaia - SP",
  store_address: "Rua das Lojas, 120",
  amount: "65000.00",
  selected_at: "2026-08-21T11:00:00.000Z",
};

const STORE_A = {
  name: "Auto Center Atibaia",
  address: "Rua das Lojas, 120",
  city: "Atibaia - SP",
};

const ROUND = { number: 1, minimum_accepted_price: "60000.00" };

/** Horários da loja A. Instantes COM offset, como o servidor devolve. */
const SLOTS_A = [
  { id: 501, starts_at: "2026-08-25T10:00:00-03:00" },
  { id: 502, starts_at: "2026-08-25T14:00:00-03:00" },
  { id: 503, starts_at: "2026-08-26T09:30:00-03:00" },
];

const OTHER_OFFERS = [
  {
    id: 18,
    store_name: "Prime Veículos",
    store_city: "Atibaia - SP",
    amount: "63500.00",
    created_at: "2026-08-21T10:00:00.000Z",
    is_highest: true,
  },
];

const HISTORY_CLOSED = [
  {
    store_name: "Auto Center Atibaia",
    amount: "65000.00",
    selected_at: "2026-08-21T11:00:00.000Z",
    round_number: 1,
    outcome: "no_agreement" as const,
    outcome_at: "2026-08-23T10:00:00.000Z",
  },
];

function mockOwner(overrides: Record<string, unknown> = {}) {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest(),
    proposals: [],
    selected_offer: SELECTED_A,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    round: ROUND,
    selection_history: [{ ...HISTORY_CLOSED[0], outcome: null, outcome_at: null }],
    ...overrides,
  });
}

function mockDealer(overrides: Record<string, unknown> = {}) {
  fetchSaleOpportunity.mockResolvedValue({
    id: 42,
    brand: "Volkswagen",
    model: "T-Cross",
    fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
    fipe_code: "005340-0",
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    minimum_accepted_price: "60000.00",
    year: 2020,
    mileage: 62000,
    transmission: "automatico",
    fuel_type: "flex",
    declared_condition: "bom",
    known_issues: null,
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    created_at: "2026-08-20T12:00:00.000Z",
    images: [],
    status: "offer_selected",
    is_selected: true,
    selected_amount: "65000.00",
    selected_at: "2026-08-21T11:00:00.000Z",
    current_highest_offer: null,
    my_offer: { amount: "65000.00", created_at: "2026-08-21T10:00:00.000Z" },
    is_leading: true,
    offers_count: 3,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    evaluation: { ...ANSWERED_EVALUATION, mileage: 62000, declared_condition: "bom" },
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fetchHandoffWhatsapp.mockResolvedValue({ url: "https://wa.me/5511999999999?text=ola" });
  vi.spyOn(window, "open").mockImplementation(() => null);
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// ============================================================================
// §29-A — OFERTA ACEITA, AINDA SEM HORÁRIOS
// ============================================================================
describe("§29-A — oferta aceita e a loja ainda não ofereceu horários", () => {
  it("mostra loja, endereço, o estado de espera E o WhatsApp, lado a lado", async () => {
    mockOwner();
    render(<SaleRequestDetail id="42" />);

    const card = await screen.findByTestId("owner-handoff");

    // Os dados da loja continuam onde estavam na 4.7.
    expect(within(card).getByTestId("handoff-store-name")).toHaveTextContent("Auto Center Atibaia");
    expect(within(card).getByTestId("handoff-address")).toHaveTextContent("Rua das Lojas, 120");

    // §9 — o portal diz de quem é a vez, e não inventa horário nenhum.
    expect(within(card).getByTestId("owner-scheduling-waiting-text")).toHaveTextContent(
      "Aguardando a loja disponibilizar horários"
    );

    // §1 — E o WhatsApp está lá ao mesmo tempo. É esta coexistência que a fase
    // inteira existe para garantir: um caminho não esconde o outro.
    expect(within(card).getByTestId("handoff-whatsapp")).toBeInTheDocument();
    expect(within(card).getByTestId("handoff-two-paths")).toBeInTheDocument();
  });

  it("não oferece nenhuma escolha de horário quando não há horários", async () => {
    mockOwner();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff");
    expect(screen.queryByTestId("owner-scheduling-choose")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-scheduling-confirmed")).not.toBeInTheDocument();
  });

  it("§36 — 'não houve acordo' já está disponível antes de qualquer agendamento", async () => {
    mockOwner();
    render(<SaleRequestDetail id="42" />);

    expect(await screen.findByTestId("handoff-no-agreement-cta")).toBeInTheDocument();
  });
});

// ============================================================================
// §29-B — HORÁRIOS DISPONÍVEIS
// ============================================================================
describe("§29-B — a loja ofereceu horários", () => {
  function mockWithSlots() {
    mockOwner({
      inspection: {
        state: "awaiting_owner",
        slots: SLOTS_A,
        scheduled_at: null,
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
    });
  }

  it("lista os horários formatados em pt-BR, e nunca o ISO cru (§11)", async () => {
    mockWithSlots();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-scheduling-choose");
    const options = within(panel).getAllByTestId("owner-scheduling-slot");
    expect(options).toHaveLength(3);

    // O formatador do projeto produz "terça-feira, 25/08 às 10:00".
    expect(panel).toHaveTextContent("25/08 às 10:00");
    expect(panel).toHaveTextContent("25/08 às 14:00");
    expect(panel).toHaveTextContent("26/08 às 09:30");

    // A prova negativa: se alguém trocar o formatador por interpolação direta,
    // o instante ISO aparece na tela e este teste cai.
    expect(panel).not.toHaveTextContent("2026-08-25T10:00:00-03:00");
  });

  it("confirma o horário escolhido enviando o slot_id daquele horário", async () => {
    mockWithSlots();
    confirmInspectionSlot.mockResolvedValue({ inspection: null, changed: true });

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-scheduling-choose");

    // Sem escolha, não há o que confirmar.
    expect(within(panel).getByTestId("owner-scheduling-confirm")).toBeDisabled();

    await user.click(within(panel).getAllByRole("radio")[1]);
    await user.click(within(panel).getByTestId("owner-scheduling-confirm"));

    await waitFor(() => expect(confirmInspectionSlot).toHaveBeenCalledTimes(1));
    // O SEGUNDO horário, e não o primeiro nem "o escolhido" genérico: se a tela
    // mandasse sempre o slot[0], este teste seria o único a perceber.
    expect(confirmInspectionSlot).toHaveBeenCalledWith(42, "502");
  });

  it("pede outros horários sem enviar mensagem nenhuma (§12)", async () => {
    mockWithSlots();
    requestNewInspectionSlots.mockResolvedValue({ inspection: null, changed: true });

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-scheduling-choose");
    await user.click(within(panel).getByTestId("owner-scheduling-request-new"));

    await waitFor(() => expect(requestNewInspectionSlots).toHaveBeenCalledTimes(1));
    // Só o id. Nenhum campo de texto — o produto decidiu não ter esse canal.
    expect(requestNewInspectionSlots).toHaveBeenCalledWith(42);
  });

  it("o WhatsApp continua disponível enquanto há horários para escolher", async () => {
    mockWithSlots();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-scheduling-choose");
    expect(screen.getByTestId("handoff-whatsapp")).toBeInTheDocument();
  });

  it("mostra o erro do servidor quando a rodada ficou obsoleta (SLOT_STALE)", async () => {
    mockWithSlots();
    confirmInspectionSlot.mockRejectedValue(
      new SaleRequestError(
        "A loja atualizou os horários. Recarregue para ver as opções atuais.",
        409,
        INSPECTION_CODE.SLOT_STALE
      )
    );

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-scheduling-choose");
    await user.click(within(panel).getAllByRole("radio")[0]);
    await user.click(within(panel).getByTestId("owner-scheduling-confirm"));

    expect(await screen.findByTestId("owner-scheduling-error")).toHaveTextContent(
      "A loja atualizou os horários"
    );
  });

  it("§12 — depois de pedir novos, o estado passa a dizer que espera OUTROS horários", async () => {
    mockOwner({
      inspection: {
        state: "awaiting_slots",
        slots: [],
        scheduled_at: null,
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
    });
    render(<SaleRequestDetail id="42" />);

    expect(await screen.findByTestId("owner-scheduling-waiting-text")).toHaveTextContent(
      "Aguardando novos horários da loja"
    );
  });
});

// ============================================================================
// §29-C — HORÁRIO CONFIRMADO
// ============================================================================
describe("§29-C — avaliação agendada", () => {
  function mockScheduled() {
    mockOwner({
      sale_request: makeRequest({ status: "inspection_scheduled" }),
      inspection: {
        state: "scheduled",
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
    });
  }

  it("mostra o horário confirmado, o endereço e MANTÉM o WhatsApp (§13)", async () => {
    mockScheduled();
    render(<SaleRequestDetail id="42" />);

    const confirmed = await screen.findByTestId("owner-scheduling-confirmed");
    expect(confirmed).toHaveTextContent("Avaliação agendada");
    expect(within(confirmed).getByTestId("owner-scheduling-when")).toHaveTextContent(
      "25/08 às 14:00"
    );

    // O endereço continua no card, e o WhatsApp continua clicável — §13 é
    // explícito de que ele NÃO some depois do agendamento.
    expect(screen.getByTestId("handoff-address")).toHaveTextContent("Rua das Lojas, 120");
    expect(screen.getByTestId("handoff-whatsapp")).toBeInTheDocument();
  });

  it("§36 — 'não houve acordo' continua disponível com horário confirmado", async () => {
    mockScheduled();
    render(<SaleRequestDetail id="42" />);

    expect(await screen.findByTestId("handoff-no-agreement-cta")).toBeInTheDocument();
  });

  it("§23 — não existe 'Registrar avaliação' nem ficha de inspeção", async () => {
    mockScheduled();
    render(<SaleRequestDetail id="42" />);

    const confirmed = await screen.findByTestId("owner-scheduling-confirmed");

    // Dentro do painel de agendamento não há absolutamente nada de avaliação.
    expect(confirmed).not.toHaveTextContent(/Registrar avaliação/i);
    expect(confirmed).not.toHaveTextContent(/Quilometragem lida/i);
    expect(confirmed).not.toHaveTextContent(/proposta final/i);

    // E o cartão do fluxo legado não é montado: esta linha nunca teve ficha
    // observada nem proposta final, então não há "histórico" a exibir.
    expect(screen.queryByTestId("owner-legacy-flow")).not.toBeInTheDocument();
  });

  it("não empilha um segundo cartão com a mesma loja e o mesmo valor", async () => {
    mockScheduled();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff");
    // `SelectedOfferPanel` diria "Auto Center Atibaia — R$ 65.000,00" de novo,
    // logo acima do card do handoff, que já diz exatamente isso.
    expect(screen.queryByTestId("sale-request-selected-offer")).not.toBeInTheDocument();
    expect(screen.getAllByText(/Auto Center Atibaia/)).toHaveLength(1);
  });
});

// ============================================================================
// §29-D — handoff_failed COM AGENDA HISTÓRICA  ← o teste central do §15
// ============================================================================
describe("§29-D/§15 — handoff_failed com agenda preservada no banco", () => {
  /**
   * A 4.9A NÃO apaga a agenda ao encerrar o match, e o ponteiro
   * `selected_offer_id` continua apontando para a seleção que falhou — de
   * propósito, para que a tela consiga dizer "não houve acordo com a Loja A".
   *
   * A consequência é que o DTO de uma solicitação em `handoff_failed` traz uma
   * inspeção com `state: "scheduled"` e um `scheduled_at` REAL. É o cenário mais
   * perigoso desta fase inteira: todo dado necessário para pintar "Avaliação
   * agendada" está presente, e só o STATUS diz que aquilo acabou.
   */
  function mockFailedWithHistoricSchedule() {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "handoff_failed" }),
      proposals: OTHER_OFFERS,
      selected_offer: SELECTED_A,
      inspection: {
        state: "scheduled",
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
      final_decision: null,
      owner_final_decision: null,
      round: ROUND,
      selection_history: HISTORY_CLOSED,
    });
  }

  it("NÃO renderiza a agenda histórica como agenda ativa", async () => {
    mockFailedWithHistoricSchedule();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");

    expect(screen.queryByTestId("owner-scheduling-confirmed")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-scheduling-choose")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-scheduling-waiting")).not.toBeInTheDocument();

    // E a frase em si não aparece em lugar nenhum da tela — nem no card do
    // handoff, nem no cartão do fluxo legado.
    expect(screen.queryByText(/Avaliação agendada/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/25\/08 às 14:00/)).not.toBeInTheDocument();
  });

  it("mostra a recuperação: outras ofertas e nova rodada (§19, §20)", async () => {
    mockFailedWithHistoricSchedule();
    render(<SaleRequestDetail id="42" />);

    const failed = await screen.findByTestId("owner-handoff-failed");
    expect(failed).toHaveTextContent("Não houve acordo com Auto Center Atibaia");
    expect(within(failed).getByTestId("handoff-new-round-cta")).toBeInTheDocument();

    // "Ver outras ofertas" é a própria lista, que volta em `handoff_failed`.
    const list = await screen.findByTestId("sale-request-proposals");
    expect(list).toHaveTextContent("Outras ofertas recebidas");
    expect(list).toHaveTextContent("Prime Veículos");
  });

  it("não oferece nenhum caminho de escrita da agenda", async () => {
    mockFailedWithHistoricSchedule();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");
    expect(screen.queryByTestId("owner-scheduling-confirm")).not.toBeInTheDocument();
    expect(screen.queryByTestId("owner-scheduling-request-new")).not.toBeInTheDocument();
  });
});

// ============================================================================
// §17 — RESSELEÇÃO A → B
// ============================================================================
describe("§17 — a agenda da loja A não atravessa para a loja B", () => {
  it("o match novo nasce sem agenda, mesmo vindo de um handoff_failed agendado", async () => {
    // Primeiro carregamento: handoff_failed, com a agenda da loja A no DTO.
    getSaleRequest.mockResolvedValueOnce({
      sale_request: makeRequest({ status: "handoff_failed" }),
      proposals: OTHER_OFFERS,
      selected_offer: SELECTED_A,
      inspection: {
        state: "scheduled",
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
      final_decision: null,
      owner_final_decision: null,
      round: ROUND,
      selection_history: HISTORY_CLOSED,
    });

    // A chave é `selected` — é o que `SaleRequestProposals` lê da resposta.
    selectSaleRequestOffer.mockResolvedValue({
      selected: {
        id: 18,
        store_name: "Prime Veículos",
        store_city: "Atibaia - SP",
        store_address: "Av. Central, 900",
        amount: "63500.00",
        selected_at: "2026-08-24T10:00:00.000Z",
      },
    });

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");

    // Aceita a oferta da loja B.
    const list = await screen.findByTestId("sale-request-proposals");
    await user.click(within(list).getByTestId("sale-request-proposal-select"));

    await user.click(await screen.findByTestId("sale-request-select-confirm"));

    // O handoff passa a ser o da loja B...
    const card = await screen.findByTestId("owner-handoff");
    expect(within(card).getByTestId("handoff-store-name")).toHaveTextContent("Prime Veículos");

    // ...e a agenda da loja A não sobreviveu ao estado local do React.
    expect(screen.queryByTestId("owner-scheduling-confirmed")).not.toBeInTheDocument();
    expect(screen.queryByText(/25\/08 às 14:00/)).not.toBeInTheDocument();
    expect(within(card).getByTestId("owner-scheduling-waiting-text")).toHaveTextContent(
      "Aguardando a loja disponibilizar horários"
    );
  });
});

// ============================================================================
// §18 — A, RODADA 2, A DE NOVO
// ============================================================================
describe("§18 — a mesma loja aceita de novo numa rodada nova", () => {
  /**
   * A migration 061 amarra a agenda à SELEÇÃO, e não à solicitação nem ao
   * `advertiser_id`. É o que torna este cenário representável: duas seleções da
   * MESMA loja, duas agendas, e só a da seleção vigente é lida.
   *
   * O teste distingue pelo INSTANTE, e não pelo id da loja — filtrar por
   * `advertiser_id` devolveria as duas linhas e leria a errada, que é exatamente
   * o defeito descrito no cabeçalho da 061.
   */
  it("mostra a agenda A2 e nunca a A1", async () => {
    mockOwner({
      sale_request: makeRequest({ status: "inspection_scheduled" }),
      selected_offer: { ...SELECTED_A, selected_at: "2026-08-24T09:00:00.000Z" },
      inspection: {
        state: "scheduled",
        slots: [],
        // A2 — a agenda da segunda seleção da mesma loja.
        scheduled_at: "2026-09-02T16:00:00-03:00",
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
      selection_history: [
        // A1 ficou na trilha, encerrada.
        { ...HISTORY_CLOSED[0], round_number: 1 },
      ],
    });

    render(<SaleRequestDetail id="42" />);

    const when = await screen.findByTestId("owner-scheduling-when");
    expect(when).toHaveTextContent("02/09 às 16:00");
    // A1 era 25/08 às 14:00.
    expect(screen.queryByText(/25\/08 às 14:00/)).not.toBeInTheDocument();
  });
});

// ============================================================================
// §31 — WHATSAPP
// ============================================================================
describe("§31 — o WhatsApp como SEGUNDA opção", () => {
  it("abre a URL que o SERVIDOR resolveu, e não uma montada na tela", async () => {
    mockOwner();
    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await user.click(await screen.findByTestId("handoff-whatsapp"));

    await waitFor(() => expect(fetchHandoffWhatsapp).toHaveBeenCalledWith(42));
    expect(window.open).toHaveBeenCalledWith(
      "https://wa.me/5511999999999?text=ola",
      "_blank",
      "noopener,noreferrer"
    );
  });

  it("continua disponível DEPOIS do agendamento (§13)", async () => {
    mockOwner({
      sale_request: makeRequest({ status: "inspection_scheduled" }),
      inspection: {
        state: "scheduled",
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
    });

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-scheduling-confirmed");
    await user.click(screen.getByTestId("handoff-whatsapp"));

    await waitFor(() => expect(fetchHandoffWhatsapp).toHaveBeenCalledTimes(1));
    expect(window.open).toHaveBeenCalled();
  });

  it("§8 — loja sem WhatsApp: aviso discreto, e o agendamento segue de pé", async () => {
    mockOwner({
      inspection: {
        state: "awaiting_owner",
        slots: SLOTS_A,
        scheduled_at: null,
        completed_at: null,
        store: STORE_A,
        observed: null,
      },
    });
    fetchHandoffWhatsapp.mockRejectedValue(
      new SaleRequestError(
        "Esta loja não tem WhatsApp comercial cadastrado.",
        409,
        HANDOFF_CODE.WHATSAPP_UNAVAILABLE
      )
    );

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);

    await user.click(await screen.findByTestId("handoff-whatsapp"));

    // A mensagem exibida é a do SERVIDOR — ela costuma dizer o que fazer em
    // seguida, e a constante local existe só como reserva.
    expect(await screen.findByTestId("handoff-whatsapp-unavailable")).toHaveTextContent(
      "Esta loja não tem WhatsApp comercial cadastrado."
    );

    // NÃO é um erro: nada de `role="alert"` nem caixa vermelha.
    expect(screen.queryByTestId("handoff-whatsapp-error")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();

    // E o agendamento pelo portal continua inteiro — este é o ponto do §8.
    const panel = screen.getByTestId("owner-scheduling-choose");
    expect(within(panel).getAllByTestId("owner-scheduling-slot")).toHaveLength(3);
    expect(within(panel).getByTestId("owner-scheduling-confirm")).toBeInTheDocument();
  });

  it("§8 — sem mensagem do servidor, cai na frase canônica", async () => {
    mockOwner();
    fetchHandoffWhatsapp.mockRejectedValue(
      new SaleRequestError("", 409, HANDOFF_CODE.WHATSAPP_UNAVAILABLE)
    );

    const user = userEvent.setup();
    render(<SaleRequestDetail id="42" />);
    await user.click(await screen.findByTestId("handoff-whatsapp"));

    expect(await screen.findByTestId("handoff-whatsapp-unavailable")).toHaveTextContent(
      "WhatsApp não disponível para esta loja."
    );
  });
});

// ============================================================================
// §30 — A TELA DO LOJISTA
// ============================================================================
describe("§30-A — a loja teve a oferta aceita e ainda não propôs horários", () => {
  it("mostra o aceite e o formulário de horários", async () => {
    mockDealer();
    render(<DealerSaleOpportunityDetail id="42" />);

    expect(await screen.findByTestId("dealer-handoff-accepted")).toHaveTextContent(
      "Sua oferta foi aceita"
    );

    const form = screen.getByTestId("dealer-scheduling-form");
    expect(form).toHaveTextContent("Propor horários para a avaliação");
    expect(within(form).getAllByTestId("dealer-scheduling-input")).toHaveLength(1);
  });

  it("§23 — nenhum campo da ficha de avaliação existe na tela do lojista", async () => {
    mockDealer();
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");

    // A varredura é DENTRO do painel de agendamento (§24): os rótulos "Motor",
    // "Câmbio" e "Pneus" aparecem legitimamente na ficha DECLARADA, mais abaixo
    // na mesma página, e essa ficha não é a avaliação.
    for (const proibido of [
      /Registrar avaliação/i,
      /Quilometragem lida/i,
      /Estado geral observado/i,
      /Registrar proposta final/i,
      /Aceitar proposta final/i,
      /Recusar proposta final/i,
      /Observações da avaliação/i,
    ]) {
      expect(form).not.toHaveTextContent(proibido);
    }
  });

  it("envia de 1 a 3 horários em ISO com offset (§10)", async () => {
    mockDealer();
    offerInspectionSlots.mockResolvedValue({ inspection: null });

    const user = userEvent.setup();
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");

    await user.click(within(form).getByTestId("dealer-scheduling-add"));
    const inputs = within(form).getAllByTestId("dealer-scheduling-input");
    expect(inputs).toHaveLength(2);

    await user.type(inputs[0], "2026-08-25T10:00");
    await user.type(inputs[1], "2026-08-25T14:00");
    await user.click(within(form).getByTestId("dealer-scheduling-submit"));

    await waitFor(() => expect(offerInspectionSlots).toHaveBeenCalledTimes(1));

    const [, slots] = offerInspectionSlots.mock.calls[0];
    expect(slots).toHaveLength(2);
    // O contrato do backend: ISO 8601 COM offset explícito. Sem ele o servidor
    // recusa, e com razão — não teria como saber de que instante se trata.
    for (const iso of slots as string[]) {
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/);
    }
  });

  it("nunca oferece mais de 3 opções (§10)", async () => {
    mockDealer();
    const user = userEvent.setup();
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");
    await user.click(within(form).getByTestId("dealer-scheduling-add"));
    await user.click(within(form).getByTestId("dealer-scheduling-add"));

    expect(within(form).getAllByTestId("dealer-scheduling-input")).toHaveLength(3);
    expect(screen.queryByTestId("dealer-scheduling-add")).not.toBeInTheDocument();
  });

  it("§26 — não envia nada quando todos os campos estão vazios", async () => {
    mockDealer();
    const user = userEvent.setup();
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");
    await user.click(within(form).getByTestId("dealer-scheduling-submit"));

    expect(offerInspectionSlots).not.toHaveBeenCalled();
    expect(within(form).getByTestId("dealer-scheduling-error")).toHaveTextContent(
      "Informe pelo menos um horário"
    );
  });

  it("mostra a mensagem do SERVIDOR quando falta endereço comercial", async () => {
    mockDealer();
    offerInspectionSlots.mockRejectedValue(
      new SaleRequestError(
        "Cadastre o endereço da loja antes de enviar horários.",
        409,
        INSPECTION_CODE.STORE_LOCATION_REQUIRED
      )
    );

    const user = userEvent.setup();
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");
    await user.type(within(form).getByTestId("dealer-scheduling-input"), "2026-08-25T10:00");
    await user.click(within(form).getByTestId("dealer-scheduling-submit"));

    expect(await screen.findByTestId("dealer-scheduling-error")).toHaveTextContent(
      "Cadastre o endereço da loja"
    );
  });
});

describe("§30-B — horários enviados", () => {
  it("mostra os horários propostos e o estado de espera", async () => {
    mockDealer({
      inspection: {
        state: "awaiting_owner",
        round: 1,
        slots: SLOTS_A,
        scheduled_at: null,
        completed_at: null,
        observed: null,
      },
    });
    render(<DealerSaleOpportunityDetail id="42" />);

    const sent = await screen.findByTestId("dealer-scheduling-sent");
    expect(within(sent).getAllByTestId("dealer-scheduling-sent-slot")).toHaveLength(3);
    expect(sent).toHaveTextContent("Aguardando a escolha do proprietário");

    // O formulário sai de cena: publicar outra rodada agora invalidaria a lista
    // que o proprietário pode estar olhando neste instante.
    expect(screen.queryByTestId("dealer-scheduling-form")).not.toBeInTheDocument();
  });

  it("§12/§35 — quando o proprietário pede outros, o formulário volta com o aviso", async () => {
    mockDealer({
      inspection: {
        state: "awaiting_slots",
        round: 1,
        slots: [],
        scheduled_at: null,
        completed_at: null,
        observed: null,
      },
    });
    render(<DealerSaleOpportunityDetail id="42" />);

    const form = await screen.findByTestId("dealer-scheduling-form");
    expect(within(form).getByTestId("dealer-scheduling-new-requested")).toHaveTextContent(
      "pediu novas opções"
    );
    expect(within(form).getByTestId("dealer-scheduling-submit")).toBeInTheDocument();
  });
});

describe("§30-C — horário confirmado, na tela do lojista", () => {
  function mockDealerScheduled() {
    mockDealer({
      status: "inspection_scheduled",
      inspection: {
        state: "scheduled",
        round: 1,
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        observed: null,
      },
    });
  }

  it("mostra data e hora, read-only (§14)", async () => {
    mockDealerScheduled();
    render(<DealerSaleOpportunityDetail id="42" />);

    const panel = await screen.findByTestId("dealer-scheduling-confirmed");
    expect(panel).toHaveTextContent("Avaliação agendada");
    expect(within(panel).getByTestId("dealer-scheduling-when")).toHaveTextContent("25/08 às 14:00");
    expect(panel).toHaveTextContent("O proprietário confirmou este horário");

    // Read-only de verdade: nenhum controle dentro do painel.
    expect(within(panel).queryAllByRole("button")).toHaveLength(0);
    expect(within(panel).queryAllByRole("textbox")).toHaveLength(0);
  });

  it("§14/§23 — nenhum formulário de avaliação abaixo do horário confirmado", async () => {
    mockDealerScheduled();
    render(<DealerSaleOpportunityDetail id="42" />);

    await screen.findByTestId("dealer-scheduling-confirmed");

    expect(screen.queryByTestId("dealer-scheduling-form")).not.toBeInTheDocument();
    expect(screen.queryByText(/Registrar avaliação/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Quilometragem lida/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Registrar proposta final/i)).not.toBeInTheDocument();
    // §14 — e nada prometendo uma próxima etapa que não existe.
    expect(screen.queryByText(/próxima etapa/i)).not.toBeInTheDocument();
  });
});

describe("§30-D — handoff_failed na tela do lojista", () => {
  it("a agenda deixa de ser editável quando o negócio acabou", async () => {
    mockDealer({
      status: "handoff_failed",
      inspection: {
        state: "scheduled",
        round: 1,
        slots: [],
        scheduled_at: "2026-08-25T14:00:00-03:00",
        completed_at: null,
        observed: null,
      },
    });
    render(<DealerSaleOpportunityDetail id="42" />);

    await screen.findByTestId("dealer-sale-opportunity-detail");

    expect(screen.queryByTestId("dealer-scheduling-form")).not.toBeInTheDocument();
    expect(screen.queryByTestId("dealer-scheduling-submit")).not.toBeInTheDocument();
    // A agenda histórica também não é anunciada como vigente.
    expect(screen.queryByTestId("dealer-scheduling-confirmed")).not.toBeInTheDocument();
  });
});

// ============================================================================
// §22 / §40 — OS WRITERS APOSENTADOS CONTINUAM SEM UI
// ============================================================================
describe("§22 — a UI da 4.9B não alcança os writers aposentados", () => {
  /**
   * Teste de FONTE, e assumidamente diferente dos demais deste arquivo.
   *
   * Os outros provam que certos textos não aparecem na tela. Este prova algo que
   * nenhuma renderização mostraria: que os componentes novos não CHAMAM
   * `completeInspection`, `submitPostInspectionDecision` nem `decideFinalOffer`.
   * Um botão escondido atrás de uma condição que nenhuma fixture ativa passaria
   * por todos os testes de DOM deste arquivo e ainda assim existiria.
   *
   * O alvo são os três arquivos NOVOS da fase — os únicos cujo conteúdo a 4.9B
   * controla. Varrer o repositório inteiro acusaria `dealer-api.ts`, que ainda
   * exporta o client legado da 4.7, e transformaria este teste num alarme que
   * alguém silenciaria.
   */
  /**
   * Caminhos a partir da RAIZ do frontend (`process.cwd()` sob o vitest deste
   * pacote), e não de `import.meta.url`: o transform do vitest não entrega uma
   * URL `file:` aqui, e `fileURLToPath` rejeita o que recebe.
   */
  const raiz = (arquivo: string) => resolve(process.cwd(), arquivo);

  const NOVOS = [
    "components/account/OwnerSchedulingPanel.tsx",
    "components/account/DealerSchedulingPanel.tsx",
    "lib/sale-requests/scheduling.ts",
  ];

  const APOSENTADOS = [
    "completeInspection",
    "submitPostInspectionDecision",
    "decideFinalOffer",
    "observed_",
    "final_offer_decision",
    "inspection/complete",
  ];

  it.each(NOVOS)("%s não referencia nenhum writer aposentado", (arquivo) => {
    const fonte = readFileSync(raiz(arquivo), "utf8");

    for (const proibido of APOSENTADOS) {
      // A busca é por CHAMADA — `completeInspection(` — e não pelo identificador
      // solto: os cabeçalhos destes arquivos citam os três writers por nome ao
      // explicar por que continuam aposentados, e uma varredura por identificador
      // acusaria a própria justificativa.
      expect(fonte).not.toContain(`${proibido}(`);
      expect(fonte).not.toContain(`${proibido} =`);
    }
  });

  it("os componentes novos só chamam os três writers da AGENDA", () => {
    const owner = readFileSync(raiz("components/account/OwnerSchedulingPanel.tsx"), "utf8");
    const dealer = readFileSync(raiz("components/account/DealerSchedulingPanel.tsx"), "utf8");

    // A prova POSITIVA, que faz a negativa acima valer alguma coisa: se um
    // refactor renomear estes writers e as asserções negativas continuarem
    // passando por vacuidade, estas aqui caem.
    expect(owner).toContain("confirmInspectionSlot(");
    expect(owner).toContain("requestNewInspectionSlots(");
    expect(dealer).toContain("offerInspectionSlots(");
  });
});
