// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import PurchaseIntentForm, { collapseToCommercialModels } from "./PurchaseIntentForm";

/**
 * Formulário de publicação da procura.
 *
 * O teste mais importante deste arquivo é o do PAYLOAD: o campo `model`
 * enviado ao backend precisa ser a descrição FIPE REPRESENTATIVA e não o
 * rótulo comercial já reduzido. Enviar o rótulo funcionaria para "T-Cross" e
 * quebraria silenciosamente para "Omoda 5" — cujo rótulo não volta a derivar
 * para si mesmo. É um bug que só apareceria em produção, numa marca só.
 */

const mockPush = vi.fn();
const mockRefresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

const createPurchaseIntent = vi.fn();
vi.mock("@/lib/purchase-intents/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/purchase-intents/api")>();
  return {
    ...actual,
    createPurchaseIntent: (...args: unknown[]) => createPurchaseIntent(...args),
  };
});

const BRANDS = [
  { code: "59", name: "VW - VolksWagen" },
  { code: "26", name: "Omoda" },
];

const VW_MODELS = [
  { code: "1", name: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut." },
  { code: "2", name: "T-Cross Highline 1.4 TSI Flex 16V 5p Aut." },
  { code: "3", name: "Polo MPI 1.0 Flex 12V 5p Mec." },
];

const CITIES = [{ id: 7, name: "Atibaia", state: "SP", slug: "atibaia-sp" }];

function jsonResponse(data: unknown, status = 200) {
  return Promise.resolve({
    ok: status < 400,
    status,
    json: () => Promise.resolve(data),
  } as Response);
}

beforeEach(() => {
  vi.clearAllMocks();
  createPurchaseIntent.mockResolvedValue({ id: 1 });

  vi.stubGlobal(
    "fetch",
    vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith("/api/fipe/brands")) return jsonResponse({ data: BRANDS });
      if (url.startsWith("/api/fipe/models/59")) return jsonResponse({ data: VW_MODELS });
      if (url.startsWith("/api/fipe/models/26"))
        return jsonResponse({ data: [{ code: "9", name: "5 Luxury 1.5 TB FWD" }] });
      if (url.startsWith("/api/painel/cidades/search")) return jsonResponse({ data: CITIES });
      return jsonResponse({ data: [] }, 404);
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/** Preenche câmbio, preço, cidade e prazo — a parte comum aos dois modos. */
async function fillCommonFields(user: ReturnType<typeof userEvent.setup>) {
  await user.selectOptions(screen.getByTestId("purchase-intent-transmission"), "automatico");
  await user.type(screen.getByTestId("purchase-intent-max-price"), "95000");

  await user.selectOptions(screen.getByLabelText("Estado (UF)"), "SP");
  await user.type(screen.getByTestId("purchase-intent-city-input"), "Atib");
  const option = await screen.findByRole("button", { name: /Atibaia/ });
  await user.click(option);

  await user.selectOptions(screen.getByTestId("purchase-intent-timeframe"), "within_30_days");
}

describe("collapseToCommercialModels — reduz a lista da FIPE", () => {
  it("colapsa versões no mesmo modelo comercial e guarda a descrição FIPE", () => {
    const result = collapseToCommercialModels(VW_MODELS, "VW - VolksWagen");

    expect(result.map((item) => item.label)).toEqual(["Polo", "T-Cross"]);
    const tcross = result.find((item) => item.slug === "t-cross");
    // A descrição FIPE representativa é preservada — é ela que vai ao backend.
    expect(tcross?.fipeName).toBe("T-Cross 200 TSI 1.0  Flex 12V 5p Aut.");
  });

  it("resolve modelo de cabeça numérica com a marca", () => {
    const result = collapseToCommercialModels(
      [{ code: "9", name: "5 Luxury 1.5 TB FWD" }],
      "Omoda"
    );
    expect(result).toEqual([
      { slug: "omoda-5", label: "Omoda 5", fipeName: "5 Luxury 1.5 TB FWD" },
    ]);
  });

  it("descarta o que não dá para derivar em vez de inventar rótulo", () => {
    expect(collapseToCommercialModels([{ code: "1", name: "1.0 Flex 8V" }], "")).toEqual([]);
  });
});

describe("PurchaseIntentForm — modo 'Já sei qual carro quero'", () => {
  it("nasce no modo específico com o botão desabilitado", async () => {
    render(<PurchaseIntentForm />);
    expect(await screen.findByTestId("purchase-intent-brand")).toBeVisible();
    expect(screen.getByTestId("purchase-intent-submit")).toBeDisabled();
  });

  it("carrega marcas e, ao escolher uma, mostra os modelos COMERCIAIS", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "VW - VolksWagen" })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByTestId("purchase-intent-brand"), "59");

    // Duas versões de T-Cross viram UMA opção.
    expect(await screen.findByRole("option", { name: "T-Cross" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Polo" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /200 TSI/ })).not.toBeInTheDocument();
  });

  it("publica enviando a descrição FIPE, não o rótulo reduzido", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await waitFor(() =>
      expect(screen.getByRole("option", { name: "VW - VolksWagen" })).toBeInTheDocument()
    );
    await user.selectOptions(screen.getByTestId("purchase-intent-brand"), "59");
    await screen.findByRole("option", { name: "T-Cross" });
    await user.selectOptions(screen.getByTestId("purchase-intent-model"), "t-cross");
    await fillCommonFields(user);

    // `waitFor` e não assert seco: o botão só habilita depois que o estado da
    // cidade assenta. Um `expect(...).toBeEnabled()` síncrono passaria a
    // depender da velocidade do worker, e o clique num botão desabilitado é
    // silencioso — o teste morreria depois, no `toHaveBeenCalled`.
    await waitFor(() => expect(screen.getByTestId("purchase-intent-submit")).toBeEnabled());
    await user.click(screen.getByTestId("purchase-intent-submit"));

    await waitFor(() => expect(createPurchaseIntent).toHaveBeenCalledTimes(1));
    expect(createPurchaseIntent).toHaveBeenCalledWith({
      intent_type: "specific_model",
      brand: "VW - VolksWagen",
      model: "T-Cross 200 TSI 1.0  Flex 12V 5p Aut.",
      transmission: "automatico",
      max_price: 95000,
      purchase_timeframe: "within_30_days",
      city_id: 7,
    });

    // Mesma ação, segunda consequência: o redirect para a listagem. Ficava num
    // teste próprio, que repetia o preenchimento inteiro (marca → modelo →
    // cidade com debounce) só para clicar de novo — e essa repetição longa
    // era o que estourava o timeout quando a suíte inteira roda em paralelo.
    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/dashboard/minhas-procuras?published=1")
    );
  });
});

describe("PurchaseIntentForm — modo 'Quero receber opções'", () => {
  it("troca marca/modelo por carroceria", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await user.click(screen.getByRole("radio", { name: /Quero receber opções/i }));

    expect(screen.getByTestId("purchase-intent-body-type")).toBeVisible();
    expect(screen.queryByTestId("purchase-intent-brand")).not.toBeInTheDocument();
    expect(screen.queryByTestId("purchase-intent-model")).not.toBeInTheDocument();
  });

  it("publica com carroceria e SEM marca/modelo", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await user.click(screen.getByRole("radio", { name: /Quero receber opções/i }));
    await user.selectOptions(screen.getByTestId("purchase-intent-body-type"), "suv");
    await fillCommonFields(user);
    await waitFor(() => expect(screen.getByTestId("purchase-intent-submit")).toBeEnabled());
    await user.click(screen.getByTestId("purchase-intent-submit"));

    await waitFor(() => expect(createPurchaseIntent).toHaveBeenCalledTimes(1));
    const payload = createPurchaseIntent.mock.calls[0][0];
    expect(payload).toMatchObject({ intent_type: "open_category", body_type: "suv" });
    expect(payload).not.toHaveProperty("brand");
    expect(payload).not.toHaveProperty("model");
  });
});

describe("PurchaseIntentForm — validação de UX", () => {
  it("orçamento abaixo do mínimo mantém o botão desabilitado", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await user.click(screen.getByRole("radio", { name: /Quero receber opções/i }));
    await user.selectOptions(screen.getByTestId("purchase-intent-body-type"), "suv");
    await user.selectOptions(screen.getByTestId("purchase-intent-transmission"), "automatico");
    await user.type(screen.getByTestId("purchase-intent-max-price"), "95");
    await user.selectOptions(screen.getByLabelText("Estado (UF)"), "SP");
    await user.type(screen.getByTestId("purchase-intent-city-input"), "Atib");
    await user.click(await screen.findByRole("button", { name: /Atibaia/ }));
    await user.selectOptions(screen.getByTestId("purchase-intent-timeframe"), "within_30_days");

    expect(screen.getByTestId("purchase-intent-submit")).toBeDisabled();
    expect(createPurchaseIntent).not.toHaveBeenCalled();
  });

  it("o campo de preço aceita só dígitos", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);
    const input = screen.getByTestId("purchase-intent-max-price");
    await user.type(input, "R$ 95.000abc");
    expect(input).toHaveValue("95000");
  });

  it("sem cidade escolhida na lista o botão fica desabilitado", async () => {
    const user = userEvent.setup();
    render(<PurchaseIntentForm />);

    await user.click(screen.getByRole("radio", { name: /Quero receber opções/i }));
    await user.selectOptions(screen.getByTestId("purchase-intent-body-type"), "suv");
    await user.selectOptions(screen.getByTestId("purchase-intent-transmission"), "automatico");
    await user.type(screen.getByTestId("purchase-intent-max-price"), "95000");
    await user.selectOptions(screen.getByTestId("purchase-intent-timeframe"), "within_30_days");

    // Digitar não seleciona: a cidade só vale vinda da lista, com id.
    await user.selectOptions(screen.getByLabelText("Estado (UF)"), "SP");
    await user.type(screen.getByTestId("purchase-intent-city-input"), "Atibaia");
    expect(screen.getByTestId("purchase-intent-submit")).toBeDisabled();
  });

  it("erro do backend aparece e o botão volta a ficar clicável", async () => {
    const user = userEvent.setup();
    createPurchaseIntent.mockRejectedValue(new Error("Cidade inválida."));
    render(<PurchaseIntentForm />);

    await user.click(screen.getByRole("radio", { name: /Quero receber opções/i }));
    await user.selectOptions(screen.getByTestId("purchase-intent-body-type"), "suv");
    await fillCommonFields(user);
    await waitFor(() => expect(screen.getByTestId("purchase-intent-submit")).toBeEnabled());
    await user.click(screen.getByTestId("purchase-intent-submit"));

    expect(await screen.findByTestId("purchase-intent-form-error")).toHaveTextContent(
      "Cidade inválida."
    );
    expect(screen.getByTestId("purchase-intent-submit")).toBeEnabled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});

describe("PurchaseIntentForm — mobile", () => {
  it("marca e modelo não dividem linha no celular", async () => {
    render(<PurchaseIntentForm />);
    const brand = await screen.findByTestId("purchase-intent-brand");
    // O grid só vira duas colunas a partir de sm.
    const grid = brand.closest(".grid");
    expect(grid?.className).toContain("sm:grid-cols-2");
    expect(grid?.className).not.toContain("grid-cols-2 ");
  });

  it("campos e CTA respeitam a altura de toque de 48px", async () => {
    render(<PurchaseIntentForm />);
    expect((await screen.findByTestId("purchase-intent-brand")).className).toContain("h-12");
    expect(screen.getByTestId("purchase-intent-max-price").className).toContain("h-12");
    expect(screen.getByTestId("purchase-intent-submit").className).toContain("h-12");
  });

  it("o CTA ocupa a largura no mobile", async () => {
    render(<PurchaseIntentForm />);
    const submit = await screen.findByTestId("purchase-intent-submit");
    expect(submit.className).toContain("w-full");
    expect(submit.className).toContain("sm:w-auto");
  });
});
