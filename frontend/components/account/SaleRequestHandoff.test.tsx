// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestDetail from "./SaleRequestDetail";
import DealerSaleOpportunityDetail from "./DealerSaleOpportunityDetail";
import type { SaleRequest } from "@/lib/sale-requests/api";

/**
 * O HANDOFF DIRETO, a RESSELEÇÃO e as RODADAS na tela (Fase 4.7).
 *
 * ════════════════════════════════════════════════════════════════════════════
 * O CRITÉRIO VISUAL OBRIGATÓRIO DA FASE (§8, §37)
 * ════════════════════════════════════════════════════════════════════════════
 * O card "Registrar avaliação" — com quilometragem lida, estado geral, pneus,
 * motor, câmbio, suspensão, lataria e pintura, observações e o aviso de
 * imutabilidade — precisa DESAPARECER da experiência do lojista.
 *
 * O describe do fim deste arquivo prova isso campo a campo, renderizando a tela
 * real do lojista com a oferta aceita. A varredura é sobre o COMPONENTE
 * renderizado, e não um grep global do repositório: um grep acusaria comentários
 * e arquivos legados, e passaria a ser ignorado.
 */

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh, replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(""),
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

const fetchHandoffWhatsapp = vi.fn();
const reportNoAgreement = vi.fn();
const openNewRound = vi.fn();

vi.mock("@/lib/sale-requests/handoff-api", () => ({
  fetchHandoffWhatsapp: (...args: unknown[]) => fetchHandoffWhatsapp(...args),
  reportNoAgreement: (...args: unknown[]) => reportNoAgreement(...args),
  openNewRound: (...args: unknown[]) => openNewRound(...args),
}));

const fetchSaleOpportunity = vi.fn();
vi.mock("@/lib/sale-requests/dealer-api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/dealer-api")>();
  return {
    ...actual,
    fetchSaleOpportunity: (...args: unknown[]) => fetchSaleOpportunity(...args),
  };
});

const { SaleRequestError } = await import("@/lib/sale-requests/api");

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

const SELECTED = {
  id: 11,
  store_name: "Auto Center Atibaia",
  store_city: "Atibaia - SP",
  store_address: "Rua das Lojas, 120",
  amount: "65000.00",
  selected_at: "2026-08-21T11:00:00.000Z",
};

const OTHER_OFFERS = [
  {
    id: 18,
    store_name: "Prime Veículos",
    store_city: "Atibaia - SP",
    amount: "63500.00",
    created_at: "2026-08-21T10:00:00.000Z",
    is_highest: true,
  },
  {
    id: 19,
    store_name: "Garagem Central",
    store_city: "Atibaia - SP",
    amount: "62000.00",
    created_at: "2026-08-21T09:00:00.000Z",
    is_highest: false,
  },
];

const ROUND = { number: 1, minimum_accepted_price: "60000.00" };

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

/** O match ATIVO: oferta aceita, handoff em andamento. */
function mockHandoff(overrides: Record<string, unknown> = {}) {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest(),
    proposals: [],
    selected_offer: SELECTED,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    round: ROUND,
    selection_history: [
      { ...HISTORY_CLOSED[0], outcome: null, outcome_at: null },
    ],
    ...overrides,
  });
}

/** Depois de "não houve acordo", com outras ofertas disponíveis. */
function mockFailedHandoff(overrides: Record<string, unknown> = {}) {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest({ status: "handoff_failed" }),
    proposals: OTHER_OFFERS,
    selected_offer: SELECTED,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
    round: ROUND,
    selection_history: HISTORY_CLOSED,
    ...overrides,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

// ============================================================================
describe("o handoff depois do aceite (§13, §36)", () => {
  it("mostra loja, valor, endereço e o botão de WhatsApp", async () => {
    mockHandoff();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-handoff");

    expect(within(panel).getByTestId("handoff-store-name").textContent).toBe(
      "Auto Center Atibaia"
    );
    expect(within(panel).getByTestId("handoff-amount").textContent).toMatch(/65\.000,00/);
    expect(within(panel).getByTestId("handoff-address").textContent).toContain(
      "Rua das Lojas, 120"
    );
    expect(within(panel).getByTestId("handoff-whatsapp")).toBeTruthy();
    expect(panel.textContent).toMatch(/Entre em contato com a loja/i);
    expect(panel.textContent).toMatch(/diretamente entre você e a loja/i);
  });

  /** §14 — a URL vem do SERVIDOR. A tela nunca monta `wa.me`. */
  it("o WhatsApp é resolvido no clique, e a tela apenas abre a URL recebida", async () => {
    mockHandoff();
    fetchHandoffWhatsapp.mockResolvedValue({
      url: "https://wa.me/5511999990000?text=Ol%C3%A1",
    });
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("handoff-whatsapp"));

    await waitFor(() => expect(fetchHandoffWhatsapp).toHaveBeenCalledWith(42));
    expect(open).toHaveBeenCalledWith(
      "https://wa.me/5511999990000?text=Ol%C3%A1",
      "_blank",
      // `noopener` obrigatório: sem ele a aba aberta recebe `window.opener`.
      "noopener,noreferrer"
    );

    open.mockRestore();
  });

  it("loja sem WhatsApp mostra a mensagem do servidor, sem quebrar a tela", async () => {
    mockHandoff();
    fetchHandoffWhatsapp.mockRejectedValue(
      new SaleRequestError(
        "Esta loja não possui WhatsApp disponível no momento. Use o endereço para procurá-la.",
        409,
        "SALE_REQUEST_STORE_WHATSAPP_UNAVAILABLE"
      )
    );

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("handoff-whatsapp"));

    /*
      A 4.9B mudou o TRATAMENTO deste caso, e a mudança é do §8.

      Aqui era `handoff-whatsapp-error`: caixa vermelha, `role="alert"`. Fazia
      sentido enquanto o WhatsApp era o ÚNICO caminho depois do aceite — não
      conseguir abri-lo era, de fato, o fim da linha.

      Agora não é: o agendamento pelo portal é a outra metade da tela, e continua
      funcionando inteiro. Um alarme vermelho diria à pessoa que algo precisa ser
      resolvido antes de seguir, quando não precisa.

      O que NÃO mudou, e continua conferido abaixo: a mensagem exibida é a do
      SERVIDOR (ela explica o que fazer em seguida), e o endereço continua na
      tela como saída alternativa.
    */
    const aviso = await screen.findByTestId("handoff-whatsapp-unavailable");
    expect(aviso.textContent).toMatch(/não possui WhatsApp/i);
    expect(screen.queryByTestId("handoff-whatsapp-error")).toBeNull();

    // O endereço continua na tela — é a saída alternativa.
    expect(screen.getByTestId("handoff-address")).toBeTruthy();
  });

  /** §36 — nada do fluxo aposentado sobrou na tela do proprietário. */
  it("não existe agenda, inspeção, proposta final nem aceite final", async () => {
    mockHandoff();
    const { container } = render(<SaleRequestDetail id="42" />);
    await screen.findByTestId("owner-handoff");

    const text = (container.textContent ?? "").toLowerCase();
    for (const term of [
      "escolher horário",
      "horários disponíveis",
      "registrar avaliação",
      "proposta final",
      "declarado × observado",
      "o que a loja encontrou",
    ]) {
      expect(text, term).not.toContain(term);
    }

    expect(screen.queryByTestId("owner-inspection-picker")).toBeNull();
    expect(screen.queryByTestId("owner-final-decision")).toBeNull();
  });
});

// ============================================================================
describe("não houve acordo (§17)", () => {
  it("é ação SECUNDÁRIA, e abre um diálogo acessível", async () => {
    mockHandoff();
    render(<SaleRequestDetail id="42" />);

    const cta = await screen.findByTestId("handoff-no-agreement-cta");
    // Secundária: contorno, nunca botão destrutivo preenchido.
    expect(cta.className).not.toContain("bg-[#b42318]");
    expect(cta.className).toContain("border-[#E5E9F2]");

    await userEvent.click(cta);

    const dialog = await screen.findByTestId("handoff-no-agreement-dialog");
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("handoff-no-agreement-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("handoff-no-agreement-description");
    expect(dialog.textContent).toMatch(/Confirma que não houve acordo/i);
    expect(dialog.textContent).toMatch(/não tiver prosseguido/i);

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("handoff-no-agreement-dialog-cancel"))
    );
  });

  /** §17 — não pergunta motivo, culpa nem valor. */
  it("o diálogo não tem campo nenhum", async () => {
    mockHandoff();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("handoff-no-agreement-cta"));
    const dialog = await screen.findByTestId("handoff-no-agreement-dialog");

    expect(dialog.querySelectorAll("input")).toHaveLength(0);
    expect(dialog.querySelectorAll("textarea")).toHaveLength(0);
    expect(dialog.querySelectorAll("select")).toHaveLength(0);
    expect(dialog.textContent).not.toMatch(/motivo|por que|culpa|quem desistiu/i);
  });

  it("Escape fecha e devolve o foco ao gatilho", async () => {
    mockHandoff();
    render(<SaleRequestDetail id="42" />);

    const cta = await screen.findByTestId("handoff-no-agreement-cta");
    await userEvent.click(cta);
    await screen.findByTestId("handoff-no-agreement-dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByTestId("handoff-no-agreement-dialog")).toBeNull()
    );
    expect(document.activeElement).toBe(cta);
    expect(reportNoAgreement).not.toHaveBeenCalled();
  });

  it("confirmar chama o endpoint SEM corpo", async () => {
    mockHandoff();
    reportNoAgreement.mockResolvedValue({ changed: true });

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("handoff-no-agreement-cta"));
    await userEvent.click(await screen.findByTestId("handoff-no-agreement-dialog-confirm"));

    await waitFor(() => expect(reportNoAgreement).toHaveBeenCalledTimes(1));
    expect(reportNoAgreement).toHaveBeenCalledWith(42);
  });
});

// ============================================================================
describe("depois de não haver acordo (§19, §38)", () => {
  it("mostra as OUTRAS ofertas, com o botão de aceitar em cada uma", async () => {
    mockFailedHandoff();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");

    const cards = screen.getAllByTestId("sale-request-proposal");
    expect(cards).toHaveLength(2);
    expect(screen.getAllByTestId("sale-request-proposal-select")).toHaveLength(2);

    const section = screen.getByTestId("sale-request-proposals");
    expect(section.textContent).toContain("Prime Veículos");
    expect(section.textContent).toContain("Garagem Central");
  });

  it("diz com qual loja não houve acordo, sem insinuar culpa", async () => {
    mockFailedHandoff();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-handoff-failed");
    expect(panel.textContent).toMatch(/Não houve acordo com Auto Center Atibaia/i);
    expect(panel.textContent).not.toMatch(/culpa|desistiu|recusou|problema com a loja/i);
  });

  it("oferece o separador 'ou' e o botão de nova rodada", async () => {
    mockFailedHandoff();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");
    expect(screen.getByTestId("handoff-or-separator").textContent).toMatch(/ou/i);
    expect(screen.getByTestId("handoff-new-round-cta")).toBeTruthy();
  });

  it("sem outras ofertas, não há separador — a rodada nova é a única saída", async () => {
    mockFailedHandoff({ proposals: [] });
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");
    expect(screen.queryByTestId("handoff-or-separator")).toBeNull();
    expect(screen.getByTestId("handoff-new-round-cta")).toBeTruthy();
  });

  it("o card do handoff ativo some — não há match para mostrar", async () => {
    mockFailedHandoff();
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-handoff-failed");
    expect(screen.queryByTestId("owner-handoff")).toBeNull();
    expect(screen.queryByTestId("handoff-whatsapp")).toBeNull();
  });
});

// ============================================================================
describe("nova rodada (§39)", () => {
  it("o diálogo mostra o piso atual e nasce preenchido com ele", async () => {
    mockFailedHandoff();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("handoff-new-round-cta"));

    const dialog = await screen.findByTestId("handoff-new-round-dialog");
    expect(dialog.textContent).toMatch(/Valor mínimo atual/i);
    expect(dialog.textContent).toMatch(/60\.000,00/);
    expect(dialog.textContent).toMatch(/não participarão automaticamente da nova rodada/i);

    const input = screen.getByTestId("handoff-new-round-minimum") as HTMLInputElement;
    expect(input.value).toBe("60000");
  });

  it("envia o piso NOVO", async () => {
    mockFailedHandoff();
    openNewRound.mockResolvedValue({
      round: { number: 2, minimum_accepted_price: "58000.00" },
      changed: true,
    });

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("handoff-new-round-cta"));

    const input = await screen.findByTestId("handoff-new-round-minimum");
    await userEvent.clear(input);
    await userEvent.type(input, "58000");
    await userEvent.click(screen.getByTestId("handoff-new-round-dialog-confirm"));

    await waitFor(() => expect(openNewRound).toHaveBeenCalledWith(42, "58000"));
  });

  it("mostra o erro do servidor sem fechar o diálogo", async () => {
    mockFailedHandoff();
    openNewRound.mockRejectedValue(
      new SaleRequestError("Informe o valor mínimo.", 400, "SALE_REQUEST_INVALID_FIELD")
    );

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("handoff-new-round-cta"));
    await userEvent.click(await screen.findByTestId("handoff-new-round-dialog-confirm"));

    const error = await screen.findByTestId("handoff-new-round-dialog-error");
    expect(error.getAttribute("role")).toBe("alert");
    expect(screen.getByTestId("handoff-new-round-dialog")).toBeTruthy();
  });
});

// ============================================================================
describe("o aviso de compromisso da oferta (§5, §34)", () => {
  it("aparece na lista de propostas, antes de qualquer clique", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "receiving_offers" }),
      proposals: OTHER_OFFERS,
      selected_offer: null,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      round: ROUND,
      selection_history: [],
    });

    render(<SaleRequestDetail id="42" />);

    const notice = await screen.findByTestId("sale-request-offer-commitment");
    expect(notice.textContent).toMatch(/intenção real de compra/i);
    expect(notice.textContent).toMatch(/sujeito à confirmação das condições/i);
    expect(notice.textContent).toMatch(/revisar o valor ou desistir/i);
  });

  /** §5 — a linguagem que enfraquece a oferta não pode existir. */
  it("a tela não chama a oferta de estimativa nem de sem compromisso", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "receiving_offers" }),
      proposals: OTHER_OFFERS,
      selected_offer: null,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      round: ROUND,
      selection_history: [],
    });

    const { container } = render(<SaleRequestDetail id="42" />);
    await screen.findByTestId("sale-request-proposals");

    const text = (container.textContent ?? "").toLowerCase();
    for (const term of ["estimativa sem compromisso", "sem compromisso", "simulação"]) {
      expect(text, term).not.toContain(term);
    }
  });

  /** §3 — o CTA continua sendo ACEITAR OFERTA. */
  it("o CTA é 'Aceitar oferta' — nunca 'Escolher loja' ou 'Tenho interesse'", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "receiving_offers" }),
      proposals: OTHER_OFFERS,
      selected_offer: null,
      inspection: null,
      final_decision: null,
      owner_final_decision: null,
      round: ROUND,
      selection_history: [],
    });

    const { container } = render(<SaleRequestDetail id="42" />);
    await screen.findByTestId("sale-request-proposals");

    const buttons = screen.getAllByTestId("sale-request-proposal-select");
    for (const button of buttons) {
      expect(button.textContent?.trim()).toBe("Aceitar oferta");
    }

    const text = (container.textContent ?? "").toLowerCase();
    for (const term of ["escolher loja", "selecionar para avaliação", "tenho interesse"]) {
      expect(text, term).not.toContain(term);
    }
  });
});

// ============================================================================
// O CRITÉRIO VISUAL OBRIGATÓRIO DA FASE
// ============================================================================
describe("§8 — o card 'Registrar avaliação' NÃO EXISTE na tela do lojista", () => {
  const OPPORTUNITY = {
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
    city: { name: "Atibaia", state: "SP", slug: "atibaia-sp" },
    fipe_reference_value: "92000.00",
    fipe_reference_at: "2026-08-01T00:00:00.000Z",
    minimum_accepted_price: null,
    published_at: "2026-08-20T12:00:00.000Z",
    current_highest_offer: "65000.00",
    my_offer: "65000.00",
    is_leading: true,
    offers_count: 3,
    is_selected: true,
    selected_amount: "65000.00",
    selected_at: "2026-08-21T11:00:00.000Z",
    status: "offer_selected",
    images: [],
    known_issues: null,
    inspection: null,
    final_decision: null,
    owner_final_decision: null,
  };

  beforeEach(() => {
    // `fetchSaleOpportunity` resolve o DETALHE direto — não o envelope
    // `{ sale_opportunity }`. O desembrulho acontece na função de dados.
    fetchSaleOpportunity.mockResolvedValue(OPPORTUNITY);
  });

  it("mostra apenas 'Sua oferta foi aceita' e o valor", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);

    const panel = await screen.findByTestId("dealer-handoff-accepted");
    expect(panel.textContent).toMatch(/Sua oferta foi aceita/i);
    expect(within(panel).getByTestId("dealer-handoff-amount").textContent).toMatch(/65\.000,00/);
    expect(panel.textContent).toMatch(/recebeu os dados da sua loja/i);
    expect(panel.textContent).toMatch(/diretamente entre as partes/i);
  });

  /**
   * A PROVA CAMPO A CAMPO.
   *
   * Cada termo desta lista era um campo do card removido. Se alguém reintroduzir
   * o formulário — inteiro ou em pedaços — este teste acusa antes do E2E.
   */
  it("nenhum campo do formulário de avaliação está na tela", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-handoff-accepted");

    const text = (container.textContent ?? "").toLowerCase();

    for (const term of [
      "registrar avaliação",
      "avaliação confirmada para",
      "quilometragem lida",
      "estado geral observado",
      "observações",
      "registrar proposta final",
      "proposta final",
      "motivo da alteração",
      "não poderá ser alterada",
    ]) {
      expect(text, `campo removido reapareceu: ${term}`).not.toContain(term);
    }
  });

  it("nenhum formulário, nenhum campo editável no painel do lojista", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    const panel = await screen.findByTestId("dealer-handoff-accepted");

    expect(panel.querySelectorAll("form")).toHaveLength(0);
    expect(panel.querySelectorAll("input")).toHaveLength(0);
    expect(panel.querySelectorAll("select")).toHaveLength(0);
    expect(panel.querySelectorAll("textarea")).toHaveLength(0);
    expect(panel.querySelectorAll("button")).toHaveLength(0);
  });

  it("os testids do painel antigo não existem mais", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-handoff-accepted");

    for (const testId of [
      "dealer-inspection-form",
      "dealer-inspection-slot-form",
      "dealer-inspection-mileage",
      "dealer-decision-form",
      "dealer-decision-amount",
      "dealer-decision-sent",
    ]) {
      expect(screen.queryByTestId(testId), testId).toBeNull();
    }
  });

  /**
   * §15 — a disputa acabou: o formulário de PROPOSTA não existe, e não está
   * apenas desabilitado.
   *
   * Herdado do E2E da 4.4 (passo 7), aposentado pela 4.7. Lá isto rodava contra
   * o backend real; aqui roda contra o ternário de `DealerSaleOpportunityDetail`,
   * que é onde a exclusão de fato mora — `is_selected` escolhe ENTRE o painel de
   * handoff e o de proposta, nunca os dois. A garantia é estrutural, mas sem
   * asserção ninguém percebe se alguém trocar o ternário por dois blocos
   * independentes.
   */
  it("o formulário de proposta NÃO existe — não está desabilitado", async () => {
    render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-handoff-accepted");

    expect(screen.queryByTestId("dealer-offer-panel")).toBeNull();
    expect(screen.queryByTestId("dealer-offer-amount")).toBeNull();
  });

  /** §16 — nada do proprietário chega à loja pelo portal. */
  it("a tela do lojista não mostra contato do proprietário", async () => {
    const { container } = render(<DealerSaleOpportunityDetail id="1" />);
    await screen.findByTestId("dealer-handoff-accepted");

    const text = (container.textContent ?? "").toLowerCase();
    for (const term of ["whatsapp", "telefone", "e-mail", "cpf"]) {
      expect(text, term).not.toContain(term);
    }
  });
});
