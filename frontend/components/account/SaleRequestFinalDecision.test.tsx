// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestDetail from "./SaleRequestDetail";
import type { SaleRequest } from "@/lib/sale-requests/api";
import {
  ACCEPT_DIALOG_DISCLAIMER,
  OWNER_ACCEPTED_DISCLAIMER,
} from "@/lib/sale-requests/final-decision";

/**
 * A DECISÃO DO PROPRIETÁRIO sobre a proposta final, na tela (Fase 4.6).
 *
 * O componente é exercitado DENTRO do detalhe, e não isolado, de propósito: o
 * que precisa ser provado é o que a pessoa vê e faz — o painel com os dois
 * botões, o diálogo interceptando o clique, e a tela inteira mudando de estado
 * depois. Um teste do componente solto provaria que ele renderiza props, o que
 * ninguém duvida.
 *
 * Mocka o MÓDULO de dados, não o `fetch`, e preserva os helpers puros com
 * `importOriginal` — convenção da casa. `formatMoneyValue` e os rótulos são os
 * de verdade: se algum deles quebrar, esta tela acusa aqui.
 */

const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: mockRefresh }),
}));

const getSaleRequest = vi.fn();
const cancelSaleRequest = vi.fn();
const decideFinalOffer = vi.fn();

vi.mock("@/lib/sale-requests/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/api")>();
  return {
    ...actual,
    getSaleRequest: (...args: unknown[]) => getSaleRequest(...args),
    cancelSaleRequest: (...args: unknown[]) => cancelSaleRequest(...args),
    decideFinalOffer: (...args: unknown[]) => decideFinalOffer(...args),
  };
});

const { SaleRequestError } = await import("@/lib/sale-requests/api");

/**
 * As frases que NENHUMA tela desta fase pode AFIRMAR (§41).
 *
 * Não é preciosismo de redação. Uma pessoa que lê "venda concluída" para de
 * considerar outras saídas para um carro que ela ainda tem — e só descobre a
 * diferença depois de já ter recusado tudo o mais. Pagamento, transferência,
 * documentação e entrega não existem neste produto.
 */
const FORBIDDEN_COPY =
  /venda conclu|ve[íi]culo vendido|neg[óo]cio fechado|neg[óo]cio conclu|pagamento realizado|pagamento confirmado|compra conclu|transfer[êe]ncia conclu/i;

/**
 * As RESSALVAS, removidas antes da varredura.
 *
 * Elas contêm as palavras proibidas de propósito — para NEGÁ-LAS: "ainda não
 * representa pagamento, transferência ou venda concluída". Uma busca ingênua
 * pelas frases acusaria justamente o texto que existe para impedir a leitura
 * errada, e a "correção" óbvia seria apagar a ressalva.
 *
 * Por isso as duas são recortadas pelo VALOR EXPORTADO, e não por um literal
 * copiado: reescrever a ressalva no módulo compartilhado mantém este teste
 * funcionando, mas qualquer frase NOVA que afirme conclusão continua sendo
 * pega. E cada teste que recorta verifica também que a ressalva estava lá.
 */
const DISCLAIMERS = [OWNER_ACCEPTED_DISCLAIMER, ACCEPT_DIALOG_DISCLAIMER];

function withoutDisclaimers(text: string): string {
  return DISCLAIMERS.reduce((acc, phrase) => acc.split(phrase).join(" "), text);
}

/**
 * `Intl.NumberFormat` em pt-BR separa "R$" do número com NBSP (` `), e não
 * com espaço comum. Comparar contra um literal digitado à mão falha com duas
 * strings visualmente idênticas — foi assim que esta armadilha já custou tempo
 * neste projeto.
 */
const money = (text: string | null | undefined) => String(text ?? "").replace(/ /g, " ");

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
    status: "final_offer_submitted",
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
  amount: "65000.00",
  selected_at: "2026-08-21T11:00:00.000Z",
};

const INSPECTION = {
  state: "completed" as const,
  slots: [],
  scheduled_at: "2026-08-22T17:00:00.000Z",
  completed_at: "2026-08-23T11:00:00.000Z",
  store: { name: "Auto Center Atibaia", address: "Rua das Lojas, 120", city: "Atibaia - SP" },
  observed: {
    mileage: 64230,
    condition: "regular" as const,
    tire_condition: "replace_now" as const,
    engine_condition: "ok" as const,
    gearbox_condition: "ok" as const,
    suspension_condition: "issue" as const,
    body_paint_status: "issues" as const,
    body_paint_issues: ["scratches" as const],
    notes: "Suspensão dianteira com ruído.",
  },
};

/** A proposta final: preliminar R$ 65.000 → final R$ 60.000, com justificativa. */
const FINAL_DECISION = {
  type: "final_offer" as const,
  preliminary_amount: "65000.00",
  final_amount: "60000.00",
  difference: "-5000.00",
  reason: "tires" as const,
  note: null,
  created_at: "2026-08-23T11:30:00.000Z",
};

/** O detalhe em `final_offer_submitted` — o estado de entrada desta fase. */
function mockAwaitingDecision(overrides: Record<string, unknown> = {}) {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest(),
    proposals: [],
    selected_offer: SELECTED,
    inspection: INSPECTION,
    final_decision: FINAL_DECISION,
    owner_final_decision: null,
    ...overrides,
  });
}

/** O detalhe DEPOIS da decisão. */
function mockDecided(type: "accepted" | "rejected") {
  getSaleRequest.mockResolvedValue({
    sale_request: makeRequest({
      status: type === "accepted" ? "final_offer_accepted" : "final_offer_rejected",
    }),
    proposals: [],
    selected_offer: SELECTED,
    inspection: INSPECTION,
    final_decision: FINAL_DECISION,
    owner_final_decision: {
      type,
      final_amount: "60000.00",
      decided_at: "2026-08-23T12:00:00.000Z",
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(cleanup);

// ============================================================================
describe("o painel antes da decisão (§20)", () => {
  it("mantém preliminar, final, diferença e motivo — e adiciona os dois botões", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-final-decision");

    // O painel da 4.5 continua inteiro.
    expect(within(panel).getByText("R$ 65.000,00")).toBeTruthy();
    expect(money(within(panel).getByTestId("owner-final-amount").textContent)).toBe(
      "R$ 60.000,00"
    );
    // O SINAL é o dado mais importante da linha: "− R$ 5.000,00" e
    // "+ R$ 5.000,00" contam histórias opostas.
    expect(money(within(panel).getByTestId("owner-final-difference").textContent)).toBe(
      "− R$ 5.000,00"
    );
    expect(within(panel).getByTestId("owner-final-reason").textContent).toBe("Pneus");

    // E os dois botões da 4.6.
    expect(screen.getByTestId("owner-final-decision-accept-cta")).toBeTruthy();
    expect(screen.getByTestId("owner-final-decision-reject-cta")).toBeTruthy();
  });

  /**
   * §20 — "Aceitar" é a ação primária e vem PRIMEIRO no DOM.
   *
   * O contêiner é `flex-row-reverse` a partir de `sm`, então no desktop a
   * primária aparece à direita e no mobile a coluna empilha com "Aceitar" em
   * cima. As duas leituras vêm da mesma ordem de DOM.
   */
  it("Aceitar é o primeiro no DOM e o único preenchido", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    const actions = await screen.findByTestId("owner-final-decision-actions");
    const buttons = within(actions).getAllByRole("button");

    expect(buttons[0].getAttribute("data-testid")).toBe("owner-final-decision-accept-cta");
    expect(buttons[0].className).toContain("bg-[#0e62d8]");
    // A recusa é SECUNDÁRIA — contorno, não vermelho cheio. Recusar não destrói
    // nada: não apaga inspeção, proposta nem seleção.
    expect(buttons[1].className).toContain("border-[#E5E9F2]");
    expect(buttons[1].className).not.toContain("bg-[#b42318]");
  });

  it("não afirma venda concluída em lugar nenhum da tela", async () => {
    mockAwaitingDecision();
    const { container } = render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-final-decision");
    expect(withoutDisclaimers(container.textContent ?? "")).not.toMatch(FORBIDDEN_COPY);
  });
});

// ============================================================================
describe("o diálogo de aceite (§21)", () => {
  it("mostra o valor e a ressalva de que não é pagamento nem transferência", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));

    const dialog = await screen.findByTestId("owner-final-decision-dialog");
    expect(
      money(within(dialog).getByTestId("owner-final-decision-dialog-amount").textContent)
    ).toBe("R$ 60.000,00");
    expect(dialog.textContent).toMatch(/aceitando a proposta final/i);
    expect(dialog.textContent).toMatch(
      /Pagamento e transferência do veículo não fazem parte desta confirmação/i
    );
    // E a loja é nomeada: a pessoa confirma sabendo com quem.
    expect(dialog.textContent).toMatch(/Auto Center Atibaia/);
  });

  it("o diálogo do aceite não afirma venda concluída", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));
    const dialog = await screen.findByTestId("owner-final-decision-dialog");

    // A ressalva é recortada — ela NEGA as frases de propósito —, e a sua
    // presença é verificada logo em seguida: sem esta segunda asserção, apagar
    // a ressalva faria o teste passar com folga.
    expect(withoutDisclaimers(dialog.textContent ?? "")).not.toMatch(FORBIDDEN_COPY);
    expect(dialog.textContent).toContain(ACCEPT_DIALOG_DISCLAIMER);
  });

  /** §21 — o contrato de acessibilidade, o mesmo do diálogo da 4.4. */
  it("é um dialog acessível, com foco inicial na saída NÃO destrutiva", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));
    const dialog = await screen.findByTestId("owner-final-decision-dialog");

    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(dialog.getAttribute("aria-labelledby")).toBe("owner-final-decision-title");
    expect(dialog.getAttribute("aria-describedby")).toBe("owner-final-decision-description");

    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByTestId("owner-final-decision-cancel"))
    );
  });

  it("Escape fecha e devolve o foco ao botão que abriu", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    const opener = await screen.findByTestId("owner-final-decision-accept-cta");
    await userEvent.click(opener);
    await screen.findByTestId("owner-final-decision-dialog");

    await userEvent.keyboard("{Escape}");

    await waitFor(() =>
      expect(screen.queryByTestId("owner-final-decision-dialog")).toBeNull()
    );
    expect(document.activeElement).toBe(opener);
    expect(decideFinalOffer).not.toHaveBeenCalled();
  });

  it("Voltar fecha sem enviar nada", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));
    await userEvent.click(await screen.findByTestId("owner-final-decision-cancel"));

    await waitFor(() =>
      expect(screen.queryByTestId("owner-final-decision-dialog")).toBeNull()
    );
    expect(decideFinalOffer).not.toHaveBeenCalled();
  });

  /**
   * §8 — a tela envia a DECISÃO, e nada além dela.
   *
   * Em especial: nunca o valor. Mandá-lo faria a resposta parecer confirmar um
   * número escolhido no cliente, e o servidor o ignora de qualquer forma.
   */
  it("confirmar envia APENAS a decisão — nunca o valor", async () => {
    mockAwaitingDecision();
    decideFinalOffer.mockResolvedValue({
      owner_final_decision: {
        type: "accepted",
        final_amount: "60000.00",
        decided_at: "2026-08-23T12:00:00.000Z",
      },
      changed: true,
    });

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));
    await userEvent.click(await screen.findByTestId("owner-final-decision-confirm"));

    await waitFor(() => expect(decideFinalOffer).toHaveBeenCalledTimes(1));
    expect(decideFinalOffer).toHaveBeenCalledWith(42, "accepted");
  });
});

// ============================================================================
describe("o diálogo de recusa (§22)", () => {
  it("avisa que a solicitação não voltará automaticamente a receber propostas", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-reject-cta"));
    const dialog = await screen.findByTestId("owner-final-decision-dialog");

    expect(dialog.textContent).toMatch(/recusar a proposta final/i);
    expect(dialog.textContent).toMatch(
      /encerrada neste fluxo e não voltará automaticamente a receber propostas/i
    );
    expect(
      money(within(dialog).getByTestId("owner-final-decision-dialog-amount").textContent)
    ).toBe("R$ 60.000,00");
  });

  /** §15 — recusar não exige justificativa. O diálogo não tem campo nenhum. */
  it("não pede motivo: nenhum input, textarea ou select", async () => {
    mockAwaitingDecision();
    render(<SaleRequestDetail id="42" />);

    await userEvent.click(await screen.findByTestId("owner-final-decision-reject-cta"));
    const dialog = await screen.findByTestId("owner-final-decision-dialog");

    expect(dialog.querySelectorAll("input")).toHaveLength(0);
    expect(dialog.querySelectorAll("textarea")).toHaveLength(0);
    expect(dialog.querySelectorAll("select")).toHaveLength(0);
  });

  it("confirmar envia rejected", async () => {
    mockAwaitingDecision();
    decideFinalOffer.mockResolvedValue({
      owner_final_decision: {
        type: "rejected",
        final_amount: "60000.00",
        decided_at: "2026-08-23T12:00:00.000Z",
      },
      changed: true,
    });

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("owner-final-decision-reject-cta"));
    await userEvent.click(await screen.findByTestId("owner-final-decision-confirm"));

    await waitFor(() => expect(decideFinalOffer).toHaveBeenCalledWith(42, "rejected"));
  });
});

// ============================================================================
describe("depois do aceite (§23)", () => {
  it("mostra 'Proposta final aceita', a loja e o valor — sem botões de ação", async () => {
    mockDecided("accepted");
    render(<SaleRequestDetail id="42" />);

    const block = await screen.findByTestId("owner-final-decision-accepted");

    expect(block.textContent).toMatch(/Proposta final aceita/i);
    expect(within(block).getByTestId("owner-decided-store").textContent).toBe(
      "Auto Center Atibaia"
    );
    expect(money(within(block).getByTestId("owner-decided-amount").textContent)).toBe(
      "R$ 60.000,00"
    );

    // Os botões SOMEM — não ficam desabilitados. Um botão cinza sugere que a
    // ação volta a ser possível, e ela não volta.
    expect(screen.queryByTestId("owner-final-decision-actions")).toBeNull();
    expect(screen.queryByTestId("owner-final-decision-accept-cta")).toBeNull();
    expect(screen.queryByTestId("owner-final-decision-reject-cta")).toBeNull();
  });

  it("traz a ressalva de que não é pagamento, transferência nem venda concluída", async () => {
    mockDecided("accepted");
    render(<SaleRequestDetail id="42" />);

    const block = await screen.findByTestId("owner-final-decision-accepted");
    expect(block.textContent).toMatch(
      /ainda não representa pagamento, transferência ou venda concluída/i
    );
  });

  /** §41 — a varredura da TELA INTEIRA, e não só do bloco novo. */
  it("nenhuma frase da tela afirma conclusão de venda", async () => {
    mockDecided("accepted");
    const { container } = render(<SaleRequestDetail id="42" />);

    const block = await screen.findByTestId("owner-final-decision-accepted");

    // A ressalva ESTÁ na tela — e é ela que contém as palavras, para negá-las.
    expect(block.textContent).toContain(OWNER_ACCEPTED_DISCLAIMER);

    // Fora dela, nenhuma afirmação de conclusão em lugar nenhum da página.
    expect(withoutDisclaimers(container.textContent ?? "")).not.toMatch(FORBIDDEN_COPY);
  });

  it("o rótulo de status é 'Proposta final aceita'", async () => {
    mockDecided("accepted");
    render(<SaleRequestDetail id="42" />);

    const badge = await screen.findByTestId("sale-request-detail-status");
    expect(badge.textContent).toMatch(/Proposta final aceita/i);
  });

  /** §23 — o histórico relevante continua visível. */
  it("mantém a comparação preliminar × final e a ficha observada", async () => {
    mockDecided("accepted");
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-final-decision");
    expect(within(panel).getByText("R$ 65.000,00")).toBeTruthy();
    expect(within(panel).getByTestId("owner-final-difference")).toBeTruthy();
    expect(within(panel).getByTestId("owner-final-reason").textContent).toBe("Pneus");
  });
});

// ============================================================================
describe("depois da recusa (§24)", () => {
  it("mostra 'Proposta final recusada', o valor e o encerramento", async () => {
    mockDecided("rejected");
    render(<SaleRequestDetail id="42" />);

    const block = await screen.findByTestId("owner-final-decision-rejected");

    expect(block.textContent).toMatch(/Proposta final recusada/i);
    expect(money(within(block).getByTestId("owner-decided-amount").textContent)).toBe(
      "R$ 60.000,00"
    );
    expect(block.textContent).toMatch(/encerrada neste fluxo/i);
    expect(block.textContent).toMatch(/nova negociação poderá ser iniciada posteriormente/i);
  });

  /**
   * §24 — sem CTA de reabertura.
   *
   * A frase diz que uma nova negociação é possível DEPOIS; o botão não existe
   * porque a transição não existe. Um CTA que levasse a lugar nenhum seria pior
   * que a ausência dele.
   */
  it("não oferece botão de reabrir, aceitar, recusar ou cancelar", async () => {
    mockDecided("rejected");
    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-final-decision");
    const labels = within(panel)
      .queryAllByRole("button")
      .map((button) => button.textContent ?? "");

    expect(labels.join(" ")).not.toMatch(/reabrir|aceitar|recusar|cancelar/i);
  });

  /** §24 — a lista de propostas antigas NÃO reaparece como se ainda valesse. */
  it("não reexibe a lista de propostas", async () => {
    mockDecided("rejected");
    render(<SaleRequestDetail id="42" />);

    await screen.findByTestId("owner-final-decision-rejected");
    expect(screen.queryAllByTestId("sale-request-proposal")).toHaveLength(0);
  });

  it("o rótulo de status é 'Proposta final recusada'", async () => {
    mockDecided("rejected");
    render(<SaleRequestDetail id="42" />);

    const badge = await screen.findByTestId("sale-request-detail-status");
    expect(badge.textContent).toMatch(/Proposta final recusada/i);
  });
});

// ============================================================================
describe("erros do servidor", () => {
  /**
   * O 409 de decisão OPOSTA: a tela mostra a mensagem do servidor em vez de
   * inventar uma. É o caso de duas abas, e a correção é recarregar.
   */
  it("mostra a mensagem do 409 sem fechar o diálogo", async () => {
    mockAwaitingDecision();
    decideFinalOffer.mockRejectedValue(
      new SaleRequestError(
        "Você já respondeu a esta proposta final, e a resposta não pode ser alterada.",
        409,
        "OWNER_FINAL_DECISION_ALREADY_DECIDED"
      )
    );

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("owner-final-decision-accept-cta"));
    await userEvent.click(await screen.findByTestId("owner-final-decision-confirm"));

    const error = await screen.findByTestId("owner-final-decision-error");
    expect(error.textContent).toMatch(/já respondeu a esta proposta final/i);
    // O diálogo continua aberto: a pessoa precisa ler o que aconteceu.
    expect(screen.getByTestId("owner-final-decision-dialog")).toBeTruthy();
  });

  it("o erro tem role=alert para o leitor de tela", async () => {
    mockAwaitingDecision();
    decideFinalOffer.mockRejectedValue(new SaleRequestError("Falhou.", 409, null));

    render(<SaleRequestDetail id="42" />);
    await userEvent.click(await screen.findByTestId("owner-final-decision-reject-cta"));
    await userEvent.click(await screen.findByTestId("owner-final-decision-confirm"));

    const error = await screen.findByTestId("owner-final-decision-error");
    expect(error.getAttribute("role")).toBe("alert");
  });
});

// ============================================================================
describe("final_offer_declined — a loja não propôs (§27)", () => {
  /**
   * Não existe o que aceitar nem o que recusar. A tela não pode oferecer botões
   * sobre uma proposta que nunca foi feita.
   */
  it("não mostra os botões de decisão", async () => {
    getSaleRequest.mockResolvedValue({
      sale_request: makeRequest({ status: "final_offer_declined" }),
      proposals: [],
      selected_offer: SELECTED,
      inspection: INSPECTION,
      final_decision: {
        type: "no_offer" as const,
        preliminary_amount: "65000.00",
        final_amount: null,
        difference: null,
        reason: "mechanical" as const,
        note: null,
        created_at: "2026-08-23T11:30:00.000Z",
      },
      owner_final_decision: null,
    });

    render(<SaleRequestDetail id="42" />);

    const panel = await screen.findByTestId("owner-final-decision");
    expect(panel.textContent).toMatch(/encerrada sem proposta/i);
    expect(screen.queryByTestId("owner-final-decision-actions")).toBeNull();
  });
});
