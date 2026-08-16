// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import SaleRequestForm from "./SaleRequestForm";

/**
 * Formulário de "Venda seu carro para lojas".
 *
 * O que este arquivo prova:
 *   - a cadeia FIPE (marca → modelo → ano) encadeia e invalida corretamente;
 *   - o botão só habilita com o formulário COMPLETO, fotos incluídas;
 *   - o payload enviado carrega os CÓDIGOS FIPE e NENHUMA placa;
 *   - o bloco de fotos traz orientação COMERCIAL e nenhum dado sensível;
 *   - o 409 de limite vira mensagem legível.
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
const MODELS = [{ code: "5940", name: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut." }];
const YEARS = [{ code: "2020-1", name: "2020 Gasolina" }];

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
 * Não é micro-otimização: `fillEverything` encadeia ~10 interações, uma delas
 * digitando 5 caracteres. Com o delay padrão, o custo somado se aproximava do
 * `testTimeout` de 5 s — o arquivo passava isolado (9 s no total) e falhava de
 * forma INTERMITENTE na suíte completa, onde as workers disputam CPU.
 *
 * Um teste que só falha sob carga é pior que um teste vermelho: ele treina quem
 * lê a suíte a reexecutar até passar.
 */
function setupUser() {
  return userEvent.setup({ delay: null });
}

/** Preenche todos os campos, deixando o formulário pronto para submeter. */
async function fillEverything() {
  const user = setupUser();

  await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");

  await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");

  await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-year"), "2020-1");

  await user.type(screen.getByTestId("sale-request-mileage"), "45000");
  await user.selectOptions(screen.getByTestId("sale-request-transmission"), "automatico");
  await user.selectOptions(screen.getByTestId("sale-request-fuel"), "flex");
  await user.click(screen.getByRole("radio", { name: /Bom/i }));
  await user.click(screen.getByRole("button", { name: /escolher cidade/i }));

  uploadSaleRequestPhotos.mockResolvedValue(uploaded(4));
  await user.upload(screen.getByTestId("sale-request-photo-input"), [
    makeFile("a.jpg"),
    makeFile("b.jpg"),
    makeFile("c.jpg"),
    makeFile("d.jpg"),
  ]);

  await waitFor(() => expect(screen.getByTestId("sale-request-submit")).not.toBeDisabled());
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

describe("gate de submissão", () => {
  it("começa desabilitado", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-submit")).toBeDisabled();
  });

  it("continua desabilitado com menos de 4 fotos", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");
    await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");
    await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());
    await user.selectOptions(screen.getByTestId("sale-request-year"), "2020-1");

    await user.type(screen.getByTestId("sale-request-mileage"), "45000");
    await user.selectOptions(screen.getByTestId("sale-request-transmission"), "automatico");
    await user.selectOptions(screen.getByTestId("sale-request-fuel"), "flex");
    await user.click(screen.getByRole("radio", { name: /Bom/i }));
    await user.click(screen.getByRole("button", { name: /escolher cidade/i }));

    uploadSaleRequestPhotos.mockResolvedValue(uploaded(3));
    await user.upload(screen.getByTestId("sale-request-photo-input"), [
      makeFile("a.jpg"),
      makeFile("b.jpg"),
      makeFile("c.jpg"),
    ]);

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(3));
    expect(screen.getByTestId("sale-request-submit")).toBeDisabled();
  });

  it("habilita com o formulário completo", async () => {
    render(<SaleRequestForm />);
    await fillEverything();
    expect(screen.getByTestId("sale-request-submit")).not.toBeDisabled();
  });
});

describe("payload enviado", () => {
  it("manda os CÓDIGOS FIPE, o ano civil e as chaves de storage", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 12 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalledTimes(1));
    const payload = createSaleRequest.mock.calls[0][0];

    expect(payload).toMatchObject({
      city_id: 1,
      brand: "VW - VolksWagen",
      fipe_model_description: "T-Cross 200 TSI 1.0 Flex 12V 5p Aut.",
      // "2020-1" é código FIPE (o sufixo é combustível). O ano civil é "2020".
      year: "2020",
      mileage: "45000",
      transmission: "automatico",
      fuel_type: "flex",
      declared_condition: "bom",
      fipe_brand_code: "59",
      fipe_model_code: "5940",
      fipe_year_code: "2020-1",
    });

    // O que é submetido são as CHAVES, nunca as URLs de pré-visualização.
    expect(payload.images).toHaveLength(4);
    for (const key of payload.images) {
      expect(key.startsWith("sale-requests/")).toBe(true);
      expect(key).not.toMatch(/^https?:|vehicle-images/);
    }
  });

  /**
   * As duas AUSÊNCIAS críticas do payload, num único preenchimento.
   *
   * Estavam em testes separados, cada um repetindo `fillEverything` inteiro (~10
   * interações + upload de 4 fotos). São asserções sobre o MESMO payload, com
   * setup idêntico — separá-las custava dois ciclos completos de formulário e
   * não comprava isolamento de falha nenhum, porque um payload errado quebraria
   * os dois juntos de qualquer forma.
   *
   * O custo importava: este arquivo e o `PurchaseIntentForm.test.tsx` são os
   * dois mais pesados da suíte, e a soma dos dois passou a estourar o
   * `testTimeout` sob contenção de CPU na execução completa.
   */
  it("NÃO envia placa nem valor FIPE — o servidor é a autoridade", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 12 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalledTimes(1));
    const payload = createSaleRequest.mock.calls[0][0];

    expect(payload).not.toHaveProperty("plate");
    expect(payload).not.toHaveProperty("placa");
    expect(JSON.stringify(payload)).not.toMatch(/plac[ae]/i);

    expect(payload).not.toHaveProperty("fipe_reference_value");
    expect(payload).not.toHaveProperty("fipe_value");
  });

  it("navega para o detalhe após publicar", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 12 } });

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/dashboard/vender-para-lojas/12")
    );
  });
});

describe("erros", () => {
  it("traduz o 409 de limite em mensagem acionável", async () => {
    const { SaleRequestError } = await import("@/lib/sale-requests/api");
    createSaleRequest.mockRejectedValue(
      new SaleRequestError("limite", 409, "SALE_REQUEST_ACTIVE_LIMIT_REACHED")
    );

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(screen.getByTestId("sale-request-error")).toBeInTheDocument());
    // A mensagem diz o que FAZER, não só o que deu errado.
    expect(screen.getByTestId("sale-request-error")).toHaveTextContent(/Cancele uma para publicar/i);
    // E o formulário volta a aceitar interação.
    expect(screen.getByTestId("sale-request-submit")).not.toBeDisabled();
  });

  it("mostra erro genérico do servidor", async () => {
    createSaleRequest.mockRejectedValue(new Error("Cidade inválida."));

    render(<SaleRequestForm />);
    const user = await fillEverything();
    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(screen.getByTestId("sale-request-error")).toBeInTheDocument());
    expect(screen.getByTestId("sale-request-error")).toHaveTextContent(/Cidade inválida/i);
  });

  it("erro de upload aparece sem quebrar o formulário", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    uploadSaleRequestPhotos.mockRejectedValue(new Error("Formato não suportado."));
    await user.upload(screen.getByTestId("sale-request-photo-input"), [makeFile("a.heic")]);

    await waitFor(() =>
      expect(screen.getByText(/Formato não suportado/i)).toBeInTheDocument()
    );
    expect(screen.getByTestId("sale-request-form")).toBeInTheDocument();
  });
});

describe("privacidade e limites na tela", () => {
  it("mostra orientação COMERCIAL no bloco de fotos", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-photo-guidance")).toHaveTextContent(
      /Adicione fotos claras do veículo para ajudar os lojistas na avaliação inicial/i
    );
  });

  it("o bloco de fotos NÃO menciona dado sensível nenhum", () => {
    // A regressão que este teste impede é o retorno do aviso antigo — ou de
    // qualquer variante dele. Enumerar dados sensíveis, mesmo para
    // desaconselhá-los, os traz para o centro da experiência.
    render(<SaleRequestForm />);

    const photoBlock = screen.getByTestId("sale-request-photos").textContent ?? "";
    for (const term of [
      /plac[ae]/i,
      /documento/i,
      /fachada/i,
      /residência/i,
      /dados pessoais/i,
      /dados sensíveis/i,
    ]) {
      expect(photoBlock).not.toMatch(term);
    }
  });

  it("mostra orientação sobre o VEÍCULO no campo de problemas conhecidos", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-issues-guidance")).toHaveTextContent(
      "Descreva o estado do veículo e eventuais avarias, se houver."
    );
  });

  it("o campo de problemas conhecidos NÃO menciona dado sensível nenhum", () => {
    // A versão anterior pedia para não incluir telefone, endereço, placa ou
    // dados pessoais. A intenção era protetiva, mas listar esses itens num campo
    // de texto livre ensina a pessoa a pensar neles justamente onde ela vai
    // escrever.
    //
    // O escopo é o BLOCO do campo (label + textarea + hint), e não o app
    // inteiro: termos como "documento" e "dados pessoais" são legítimos em
    // /ajuda e na política de privacidade, e uma varredura global daria falso
    // positivo neles.
    render(<SaleRequestForm />);

    const issuesField = screen.getByTestId("sale-request-issues-field").textContent ?? "";
    for (const term of [
      /plac[ae]/i,
      /telefone/i,
      /endereço/i,
      /documento/i,
      /residência/i,
      /fachada/i,
      /dados pessoais/i,
      /dados sensíveis/i,
    ]) {
      expect(issuesField).not.toMatch(term);
    }

    // O `placeholder` não entra em `textContent` — precisa ser conferido à
    // parte, senão a copy proibida poderia voltar por ali sem ninguém notar.
    expect(screen.getByTestId("sale-request-issues")).toHaveAttribute(
      "placeholder",
      expect.stringMatching(/^(?!.*(plac|telefone|endereço|documento|dados pessoais)).*$/i)
    );
  });

  it("known_issues continua OPCIONAL — o gate não depende dele", async () => {
    // Guarda de comportamento: a correção é de copy. Se alguém transformasse a
    // orientação numa exigência, o botão deixaria de habilitar com o campo
    // vazio e este teste cairia.
    render(<SaleRequestForm />);
    await fillEverything();

    expect(screen.getByTestId("sale-request-issues")).toHaveValue("");
    expect(screen.getByTestId("sale-request-submit")).not.toBeDisabled();
  });

  it("limita problemas conhecidos a 1000 caracteres no próprio campo", () => {
    render(<SaleRequestForm />);
    expect(screen.getByTestId("sale-request-issues")).toHaveAttribute("maxLength", "1000");
  });

  it("a primeira foto é marcada como capa", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    uploadSaleRequestPhotos.mockResolvedValue(uploaded(4));
    await user.upload(screen.getByTestId("sale-request-photo-input"), [makeFile("a.jpg")]);

    await waitFor(() => expect(screen.getByText("Capa")).toBeInTheDocument());
  });

  it("permite remover uma foto escolhida", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    uploadSaleRequestPhotos.mockResolvedValue(uploaded(2));
    await user.upload(screen.getByTestId("sale-request-photo-input"), [makeFile("a.jpg")]);

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(2));
    await user.click(screen.getByRole("button", { name: /Remover foto 1/i }));

    await waitFor(() => expect(screen.getAllByRole("img")).toHaveLength(1));
  });
});
