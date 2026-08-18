// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestForm from "./SaleRequestForm";

/**
 * Timeout ampliado para ESTE arquivo.
 *
 * Preencher a ficha inteira encadeia mais de vinte interações, e cada uma
 * re-renderiza nove seções mais o resumo. Isoladamente cada teste leva ~2 s; na
 * suíte completa, com as workers disputando CPU, o padrão de 5 s é atingido e o
 * arquivo falha de forma INTERMITENTE — verde sozinho, vermelho no CI.
 *
 * Um teste que só falha sob carga é pior que um teste vermelho: ele treina quem
 * lê a suíte a reexecutar até passar. O custo aqui é real e conhecido, então o
 * limite acompanha o custo em vez de a suíte aprender a ignorá-lo.
 */
vi.setConfig({ testTimeout: 30_000 });


/**
 * Ficha de avaliação — comportamento da tela.
 *
 * O que este arquivo prova:
 *   - a cadeia FIPE encadeia e invalida corretamente (preservado da 4.1);
 *   - o progresso é REAL: sai do estado do formulário, não de um contador;
 *   - o CTA NUNCA fica desabilitado por resposta faltante — só durante o envio;
 *   - clicar com a ficha incompleta NÃO chama a API, nomeia o que falta e leva
 *     o foco ao primeiro requisito pendente;
 *   - os campos condicionais aparecem, somem e LIMPAM o valor abandonado;
 *   - o resumo lateral reflete o estado, sem inventar valor nenhum;
 *   - o payload carrega os códigos FIPE, os valores normalizados e nenhuma placa.
 *
 * A regressão específica do botão cinza mudo vive em
 * `SaleRequestForm.cta-regression.test.tsx`, que usa o componente de cidade REAL
 * — é lá que o defeito original acontece.
 */

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const createSaleRequest = vi.fn();
const uploadSaleRequestPhotos = vi.fn();

vi.mock("@/lib/sale-requests/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/sale-requests/api")>();
  return {
    ...actual,
    createSaleRequest: (...args: unknown[]) => createSaleRequest(...args),
    uploadSaleRequestPhotos: (...args: unknown[]) => uploadSaleRequestPhotos(...args),
  };
});

/** A cidade tem componente próprio (e teste próprio); aqui basta selecioná-la. */
vi.mock("./PurchaseIntentCityField", () => ({
  __esModule: true,
  default: ({ onChange }: { onChange: (city: unknown) => void }) => (
    <button type="button" onClick={() => onChange({ id: 1, name: "Atibaia", state: "SP" })}>
      escolher cidade
    </button>
  ),
}));

const BRANDS = [{ code: "59", name: "VW - VolksWagen" }];
const MODELS = [{ code: "5940", name: "Golf Comfortline 1.4 TSI" }];
const YEARS = [{ code: "2016-1", name: "2016 Gasolina" }];

function mockFipeFetch() {
  return vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    const data = url.includes("/api/fipe/brands")
      ? BRANDS
      : url.includes("/api/fipe/models")
        ? MODELS
        : url.includes("/api/fipe/years")
          ? YEARS
          : [];
    return { ok: true, json: async () => ({ data }) } as unknown as Response;
  });
}

function makeFile(name = "foto.jpg") {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

function uploaded(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    storage_key: `sale-requests/7/sess/2026/08/uuid-${index}.webp`,
    url: `/api/vehicle-images?key=uuid-${index}`,
  }));
}

/**
 * `delay: null` remove a espera artificial que o `userEvent` insere ENTRE
 * eventos.
 *
 * Não é micro-otimização: preencher a ficha inteira encadeia ~25 interações.
 * Com o delay padrão, o custo somado passa do `testTimeout` — e um teste que só
 * falha sob carga é pior que um teste vermelho, porque treina quem lê a suíte a
 * reexecutar até passar.
 */
function setupUser() {
  return userEvent.setup({ delay: null });
}

/**
 * Marca uma opção pelo NOME do grupo e pelo VALOR persistido.
 *
 * Selecionar por rótulo visível quebraria a cada ajuste de texto; o par
 * (name, value) é o contrato que vai para o banco, e é ele que o teste deve
 * proteger.
 */
async function choose(
  user: ReturnType<typeof setupUser>,
  field: string,
  value: string
): Promise<void> {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${field}"][value="${value}"]`
  );
  if (!input) throw new Error(`opção não encontrada: ${field}=${value}`);
  await user.click(input);
}

/**
 * `Intl` separa "R$" do número com ESPAÇO NÃO SEPARÁVEL (U+00A0).
 *
 * `getByText` normaliza espaços e não percebe a diferença; `toHaveValue` compara
 * a string crua e falha com uma mensagem em que os dois lados parecem idênticos
 * na tela. Normalizar aqui evita meia hora procurando um defeito que não existe.
 */
function normalizeSpaces(value: string): string {
  return value.replace(/ /g, " ");
}

/** Seções 1 e 2 — o suficiente para os testes que não precisam da ficha inteira. */
async function fillVehicle(user: ReturnType<typeof setupUser>) {
  await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");

  await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");

  await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-year"), "2016-1");

  await user.type(screen.getByTestId("sale-request-mileage"), "85000");
  await user.selectOptions(screen.getByTestId("sale-request-transmission"), "automatico");
  await user.selectOptions(screen.getByTestId("sale-request-fuel"), "flex");
  await user.click(screen.getByRole("button", { name: /escolher cidade/i }));
}

async function addPhotos(user: ReturnType<typeof setupUser>, count: number) {
  uploadSaleRequestPhotos.mockResolvedValue(uploaded(count));
  await user.upload(
    screen.getByTestId("sale-request-photo-input"),
    Array.from({ length: count }, (_, index) => makeFile(`${index}.jpg`))
  );
  await waitFor(() =>
    expect(screen.getByTestId("sale-request-photos").querySelectorAll("img")).toHaveLength(count)
  );
}

/** A ficha INTEIRA respondida, pronta para enviar. */
async function fillEverything(photoCount = 4) {
  const user = setupUser();

  await fillVehicle(user);
  await choose(user, "declared_condition", "bom");
  await choose(user, "tire_condition", "good");

  await choose(user, "financing_status", "no");
  await choose(user, "fines_status", "no");
  await choose(user, "ipva_status", "paid");
  await choose(user, "licensing_status", "ok");

  await choose(user, "caution_report_has", "no");
  await choose(user, "auction_history", "no");
  await choose(user, "collision_history", "no");

  await choose(user, "engine_condition", "ok");
  await choose(user, "gearbox_condition", "ok");
  await choose(user, "suspension_condition", "ok");

  await choose(user, "body_paint_status", "none");

  await addPhotos(user, photoCount);
  return user;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", mockFipeFetch());
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("cadeia FIPE", () => {
  it("modelo e ano começam desabilitados e liberam em cascata", async () => {
    render(<SaleRequestForm />);

    expect(screen.getByTestId("sale-request-model")).toBeDisabled();
    expect(screen.getByTestId("sale-request-year")).toBeDisabled();

    const user = setupUser();
    await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");

    await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
    expect(screen.getByTestId("sale-request-year")).toBeDisabled();

    await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");
    await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());
  });

  it("trocar a marca invalida modelo e ano", async () => {
    // Manter o ano de outro modelo enviaria um par de códigos que não descreve
    // carro nenhum — e a cotação FIPE sairia errada ou vazia.
    render(<SaleRequestForm />);
    const user = setupUser();

    await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");
    await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");
    await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());

    await user.selectOptions(screen.getByTestId("sale-request-brand"), "");

    await waitFor(() => expect(screen.getByTestId("sale-request-model")).toBeDisabled());
    expect(screen.getByTestId("sale-request-year")).toBeDisabled();
  });
});

describe("progresso", () => {
  it("começa em 0 de 8 etapas", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-progress-label")).toHaveTextContent(
      "0 de 8 etapas essenciais"
    );
  });

  it("avança conforme as seções são respondidas", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "tire_condition", "good");
    expect(screen.getByTestId("sale-request-progress-label")).toHaveTextContent("1 de 8");

    await choose(user, "declared_condition", "bom");
    expect(screen.getByTestId("sale-request-progress-label")).toHaveTextContent("2 de 8");
  });

  it("chega a 8 de 8 com a ficha inteira, e o checklist acompanha", async () => {
    render(<SaleRequestForm />);
    await fillEverything();

    expect(screen.getByTestId("sale-request-progress-label")).toHaveTextContent("8 de 8");

    const checklist = screen.getByTestId("sale-request-checklist");
    for (const key of [
      "vehicle",
      "condition",
      "tires",
      "financial",
      "history",
      "mechanics",
      "bodyPaint",
      "photos",
    ]) {
      expect(within(checklist).getByTestId(`checklist-${key}`)).toHaveAttribute(
        "data-complete",
        "true"
      );
    }
  });

  it("o cartão 'pronto para análise' só aparece com a ficha completa", async () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-not-ready")).toBeTruthy();
    expect(screen.queryByTestId("sale-request-ready")).toBeNull();

    await fillEverything();

    expect(screen.getByTestId("sale-request-ready")).toBeTruthy();
    expect(screen.queryByTestId("sale-request-not-ready")).toBeNull();
  });
});

describe("CTA — nunca cinza sem explicação", () => {
  it("está HABILITADO com o formulário totalmente vazio", () => {
    // Este é o coração da remodelação. O botão desabilitado era a única
    // resposta que a tela dava a quem não sabia o que faltava — ou seja,
    // nenhuma. Agora o clique é o caminho para descobrir.
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-submit")).not.toBeDisabled();
  });

  it("clicar incompleto NÃO chama a API", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await user.click(screen.getByTestId("sale-request-submit"));

    expect(createSaleRequest).not.toHaveBeenCalled();
  });

  it("clicar incompleto NOMEIA o que falta", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    // Ficha inteira MENOS pneus e IPVA — as duas únicas pendências.
    await fillVehicle(user);
    await choose(user, "declared_condition", "bom");
    await choose(user, "financing_status", "no");
    await choose(user, "fines_status", "no");
    await choose(user, "licensing_status", "ok");
    await choose(user, "caution_report_has", "no");
    await choose(user, "auction_history", "no");
    await choose(user, "collision_history", "no");
    await choose(user, "engine_condition", "ok");
    await choose(user, "gearbox_condition", "ok");
    await choose(user, "suspension_condition", "ok");
    await choose(user, "body_paint_status", "none");
    await addPhotos(user, 4);

    await user.click(screen.getByTestId("sale-request-submit"));

    const error = screen.getByTestId("sale-request-error");
    expect(error).toHaveTextContent("Revise 2 informações antes de enviar");
    expect(error).toHaveTextContent("Pneus");
    expect(error).toHaveTextContent("Situação do IPVA");
    // Nada de "preencha todos os campos": a mensagem genérica não diz onde
    // procurar, que era exatamente o problema do botão cinza.
    expect(error.textContent).not.toMatch(/preencha todos/i);
  });

  it("dá FOCO ao primeiro requisito pendente", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await user.click(screen.getByTestId("sale-request-submit"));

    // O primeiro item da ficha vazia é a marca, no topo da seção 1.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("sale-request-brand")));
  });

  it("marca os campos pendentes com aria-invalid depois da tentativa", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    expect(screen.getByTestId("sale-request-brand")).not.toHaveAttribute("aria-invalid");

    await user.click(screen.getByTestId("sale-request-submit"));

    expect(screen.getByTestId("sale-request-brand")).toHaveAttribute("aria-invalid", "true");
  });

  it("o erro de um campo some assim que ele é respondido", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await user.click(screen.getByTestId("sale-request-submit"));
    expect(screen.getByTestId("choice-tire_condition")).toBeTruthy();
    expect(screen.getAllByText(/informe como estão os pneus/i).length).toBeGreaterThan(0);

    await choose(user, "tire_condition", "good");

    expect(screen.queryByText(/informe como estão os pneus/i)).toBeNull();
  });

  it("nada é marcado como erro ANTES da primeira tentativa", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "tire_condition", "good");

    // Formulário recém-aberto não acusa a pessoa do que ela ainda não fez.
    expect(screen.queryAllByRole("alert")).toHaveLength(0);
  });
});

describe("campos condicionais", () => {
  it("saldo devedor só existe com financiamento ativo, e é LIMPO ao mudar", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    expect(screen.queryByTestId("money-financing_balance")).toBeNull();

    await choose(user, "financing_status", "yes");
    const field = screen.getByTestId("money-financing_balance") as HTMLInputElement;
    await user.type(field, "1850000");
    expect(normalizeSpaces(field.value)).toBe("R$ 18.500,00");

    await choose(user, "financing_status", "no");
    expect(screen.queryByTestId("money-financing_balance")).toBeNull();

    // Voltar para "sim" mostra o campo VAZIO: o valor abandonado não sobreviveu.
    await choose(user, "financing_status", "yes");
    expect(screen.getByTestId("money-financing_balance")).toHaveValue("");
  });

  it("valor das multas só existe com multas pendentes", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    expect(screen.queryByTestId("money-fines_amount")).toBeNull();
    await choose(user, "fines_status", "yes");
    expect(screen.getByTestId("money-fines_amount")).toBeTruthy();
    await choose(user, "fines_status", "unknown");
    expect(screen.queryByTestId("money-fines_amount")).toBeNull();
  });

  it("IPVA: valor pendente aparece em parcelado e em aberto, não em quitado", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "ipva_status", "paid");
    expect(screen.queryByTestId("money-ipva_amount_due")).toBeNull();

    await choose(user, "ipva_status", "installments");
    expect(screen.getByTestId("money-ipva_amount_due")).toBeTruthy();

    await choose(user, "ipva_status", "open");
    expect(screen.getByTestId("money-ipva_amount_due")).toBeTruthy();

    await choose(user, "ipva_status", "unknown");
    expect(screen.queryByTestId("money-ipva_amount_due")).toBeNull();
  });

  it("resultado do laudo só existe quando há laudo", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "caution_report_has", "no");
    expect(screen.queryByTestId("choice-caution_report_result")).toBeNull();

    await choose(user, "caution_report_has", "yes");
    expect(screen.getByTestId("choice-caution_report_result")).toBeTruthy();

    await choose(user, "caution_report_has", "unknown");
    expect(screen.queryByTestId("choice-caution_report_result")).toBeNull();
  });

  it("descrição do problema mecânico aparece, é exigida e é limpa", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "engine_condition", "ok");
    expect(screen.queryByTestId("notes-engine_notes")).toBeNull();

    await choose(user, "engine_condition", "issue");
    const notes = screen.getByTestId("notes-engine_notes");
    await user.type(notes, "trepida ao frear");

    await choose(user, "engine_condition", "unknown");
    expect(screen.queryByTestId("notes-engine_notes")).toBeNull();

    await choose(user, "engine_condition", "issue");
    expect(screen.getByTestId("notes-engine_notes")).toHaveValue("");
  });

  it("problema mecânico sem descrição bloqueia o envio e explica", async () => {
    render(<SaleRequestForm />);
    const user = await fillEverything();

    await choose(user, "gearbox_condition", "issue");
    await user.click(screen.getByTestId("sale-request-submit"));

    expect(createSaleRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("sale-request-error")).toHaveTextContent(/descrição do problema/i);
  });

  it("detalhes de lataria só existem com 'possui detalhes'", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "body_paint_status", "none");
    expect(screen.queryByTestId("choice-body_paint_issues")).toBeNull();

    await choose(user, "body_paint_status", "issues");
    expect(screen.getByTestId("choice-body_paint_issues")).toBeTruthy();

    // "Nenhum detalhe" e "Não sei" são opções do RADIO anterior, então o estado
    // contraditório ("nenhum" + "riscos") não tem como ser marcado.
    await choose(user, "body_paint_status", "unknown");
    expect(screen.queryByTestId("choice-body_paint_issues")).toBeNull();
  });

  it("'possui detalhes' sem nenhum marcado bloqueia o envio", async () => {
    render(<SaleRequestForm />);
    const user = await fillEverything();

    await choose(user, "body_paint_status", "issues");
    await user.click(screen.getByTestId("sale-request-submit"));

    expect(createSaleRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("sale-request-error")).toHaveTextContent(/detalhes da lataria/i);
  });
});

describe("resumo lateral", () => {
  it("mostra o placeholder enquanto não há foto", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-summary-placeholder")).toBeTruthy();
    expect(screen.queryByTestId("sale-request-summary-photo")).toBeNull();
  });

  it("usa a PRIMEIRA foto enviada como imagem principal", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await addPhotos(user, 4);

    const photo = screen.getByTestId("sale-request-summary-photo") as HTMLImageElement;
    expect(photo.src).toContain("uuid-0");
    expect(screen.queryByTestId("sale-request-summary-placeholder")).toBeNull();
  });

  it("não inventa valor nenhum antes das respostas", () => {
    render(<SaleRequestForm />);
    const summary = screen.getByTestId("sale-request-summary");

    // Nenhum default plausível: nada de "Não", "Bom" ou "Quitado" aparecendo
    // sozinho num resumo que a pessoa leria como o que a loja vai ver.
    expect(within(summary).queryByText("Quitado")).toBeNull();
    expect(within(summary).queryByText("Bom")).toBeNull();
    expect(within(summary).getAllByText("—").length).toBeGreaterThan(5);
  });

  it("reflete as respostas conforme entram", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await fillVehicle(user);
    await choose(user, "tire_condition", "half_life");

    const summary = screen.getByTestId("sale-request-summary");
    expect(within(summary).getByTestId("sale-request-summary-title")).toHaveTextContent(
      "VW - VolksWagen Golf Comfortline 1.4 TSI"
    );
    expect(within(summary).getByText("85.000 km")).toBeTruthy();
    expect(within(summary).getByText("Meia-vida")).toBeTruthy();
    expect(within(summary).getByText("Atibaia - SP")).toBeTruthy();
  });

  it("mostra o valor junto da resposta que o justifica", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await choose(user, "financing_status", "yes");
    await user.type(screen.getByTestId("money-financing_balance"), "1850000");

    const summary = screen.getByTestId("sale-request-summary");
    expect(within(summary).getByText("Sim (R$ 18.500,00)")).toBeTruthy();
  });
});

describe("envio", () => {
  it("publica com a ficha completa e monta o payload correto", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 77 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();

    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalledTimes(1));
    const payload = createSaleRequest.mock.calls[0][0];

    expect(payload).toMatchObject({
      city_id: 1,
      brand: "VW - VolksWagen",
      fipe_model_description: "Golf Comfortline 1.4 TSI",
      year: "2016",
      mileage: "85000",
      transmission: "automatico",
      fuel_type: "flex",
      declared_condition: "bom",
      tire_condition: "good",
      financing_status: "no",
      financing_balance: null,
      fines_status: "no",
      ipva_status: "paid",
      licensing_status: "ok",
      caution_report_status: "not_available",
      auction_history: "no",
      collision_history: "no",
      engine_condition: "ok",
      engine_notes: null,
      gearbox_condition: "ok",
      suspension_condition: "ok",
      body_paint_status: "none",
      body_paint_issues: [],
      known_issues: null,
      fipe_brand_code: "59",
      fipe_model_code: "5940",
      fipe_year_code: "2016-1",
    });

    expect(payload.images).toHaveLength(4);
  });

  it("NÃO envia placa nem valor FIPE — o servidor é a autoridade", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 77 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalled());
    const serialized = JSON.stringify(createSaleRequest.mock.calls[0][0]);

    for (const forbidden of ["plate", "placa", "renavam", "fipe_reference_value", "cpf"]) {
      expect(serialized.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("navega para o detalhe após publicar", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 99 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/vender-para-lojas/99"));
  });

  it("o CTA fica desabilitado DURANTE o envio — e só aí", async () => {
    // O único estado operacional que justifica desabilitar: a requisição está
    // em voo e um segundo clique criaria uma solicitação duplicada.
    let resolveCreate: (value: unknown) => void = () => {};
    createSaleRequest.mockImplementation(
      () => new Promise((resolve) => { resolveCreate = resolve; })
    );

    render(<SaleRequestForm />);
    const user = await fillEverything();

    const submit = screen.getByTestId("sale-request-submit");
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    await waitFor(() => expect(submit).toBeDisabled());
    expect(submit).toHaveTextContent("Enviando…");

    resolveCreate({ sale_request: { id: 5 } });
  });

  it("observações adicionais NÃO bloqueiam o envio", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 77 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();

    // Sem escrever nada em observações, a ficha já está pronta.
    expect(screen.getByTestId("sale-request-ready")).toBeTruthy();

    await user.type(screen.getByTestId("sale-request-issues"), "Revisões na concessionária.");
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalled());
    expect(createSaleRequest.mock.calls[0][0].known_issues).toBe("Revisões na concessionária.");
  });
});

describe("erros do servidor", () => {
  it("traduz o 409 de limite em mensagem acionável", async () => {
    const { SaleRequestError } = await import("@/lib/sale-requests/api");
    createSaleRequest.mockRejectedValue(
      new SaleRequestError("qualquer", 409, "SALE_REQUEST_ACTIVE_LIMIT_REACHED")
    );

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sale-request-error")).toHaveTextContent(
        /Cancele uma para publicar outra/i
      )
    );
  });

  it("mostra erro genérico do servidor", async () => {
    createSaleRequest.mockRejectedValue(new Error("Cidade inválida."));

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() =>
      expect(screen.getByTestId("sale-request-error")).toHaveTextContent("Cidade inválida.")
    );
  });
});

describe("fotos", () => {
  it("quatro fotos completam a seção", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await addPhotos(user, 4);

    expect(screen.getByTestId("checklist-photos")).toHaveAttribute("data-complete", "true");
  });

  it("três fotos não completam, e o envio explica", async () => {
    // Ficha inteira com TRÊS fotos: a galeria é a única pendência, então a
    // mensagem tem de nomeá-la — e não uma genérica qualquer.
    render(<SaleRequestForm />);
    const user = await fillEverything(3);

    await user.click(screen.getByTestId("sale-request-submit"));

    expect(createSaleRequest).not.toHaveBeenCalled();
    expect(screen.getByTestId("checklist-photos")).toHaveAttribute("data-complete", "false");
    const error = screen.getByTestId("sale-request-error");
    expect(error).toHaveTextContent("Revise 1 informação antes de enviar");
    expect(error).toHaveTextContent(/Fotos do veículo/i);
  });

  it("permite remover uma foto escolhida", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await addPhotos(user, 4);
    await user.click(screen.getByRole("button", { name: /Remover foto 2/i }));

    await waitFor(() =>
      expect(screen.getByTestId("sale-request-photos").querySelectorAll("img")).toHaveLength(3)
    );
  });

  it("a orientação das fotos fala só do veículo", () => {
    render(<SaleRequestForm />);
    const guidance = screen.getByTestId("sale-request-photo-guidance").textContent ?? "";

    for (const forbidden of ["placa", "documento", "telefone", "endereço", "fachada"]) {
      expect(guidance.toLowerCase()).not.toContain(forbidden);
    }
  });
});
