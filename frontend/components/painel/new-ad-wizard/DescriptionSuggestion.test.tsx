// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import DescriptionSuggestion, { SUGGESTION_UI_ENABLED } from "./DescriptionSuggestion";
import type { WizardFormState } from "./types";

/**
 * Comportamento do botão "Gerar sugestão" (Fase 4.5).
 *
 * O ponto mais importante aqui é o último bloco: falha na geração NÃO pode
 * mexer no textarea nem travar a publicação. O anunciante tem que conseguir
 * publicar mesmo com a IA fora do ar.
 */

function makeState(over: Partial<WizardFormState> = {}): WizardFormState {
  return {
    sellerType: "lojista",
    step: 4,
    fipeVehicleType: "carros",
    fipeBrandCode: "1",
    fipeModelCode: "1",
    fipeYearCode: "1",
    fipeCode: "",
    fipeReferenceMonth: "",
    brandLabel: "Jeep",
    modelLabel: "COMPASS",
    yearModel: "2017",
    yearManufacture: "2017",
    versionLabel: "LONGITUDE 2.0",
    color: "Preto",
    armored: false,
    fuel: "Diesel",
    transmission: "Automático",
    bodyStyle: "SUV",
    fipeValue: "",
    mileage: "110000",
    price: "R$ 94.900,00",
    description: "",
    cityId: 123,
    city: "Atibaia",
    state: "SP",
    plateFinal: "",
    whatsapp: "",
    phone: "",
    acceptTerms: false,
    vehicleOptionKeys: ["cambio_automatico", "freios_abs"],
    boostOptionId: null,
    draftPhotoUrls: [],
    ...over,
  };
}

/**
 * Harness com estado real para observar o que chega no textarea.
 *
 * `forceEnabled` por padrão: a exibição do botão é gated por
 * `NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED`, que é embutida no build e
 * não dá para alternar em runtime. O bloco "gate de exibição" cobre o default.
 */
function Harness({
  initial,
  enabled = true,
}: {
  initial: Partial<WizardFormState>;
  enabled?: boolean;
}) {
  const [state, setState] = useState<WizardFormState>(makeState(initial));
  return (
    <div>
      <DescriptionSuggestion
        state={state}
        forceEnabled={enabled}
        onApply={(text) => setState((prev) => ({ ...prev, description: text }))}
      />
      <textarea
        aria-label="Descrição do anúncio"
        value={state.description}
        onChange={(e) => setState((prev) => ({ ...prev, description: e.target.value }))}
      />
      <span data-testid="counter">{state.description.length}/1000</span>
    </div>
  );
}

const SUGESTAO =
  "Jeep Compass Longitude 2.0 2017, preto, diesel, câmbio automático, com 110.000 km rodados.";

/**
 * Os parâmetros são declarados mesmo sem uso: sem eles o `vi.fn` infere
 * `calls: [][]` e os testes que leem `calls[0][1].body` não compilam.
 */
type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function readBody(call: FetchArgs): Record<string, unknown> {
  return JSON.parse(String(call[1]?.body ?? "{}"));
}

function mockFetchOk(suggestion = SUGESTAO) {
  const fn = vi.fn(async (..._args: FetchArgs) => ({
    ok: true,
    status: 200,
    json: async () => ({ ok: true, suggestion }),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

function mockFetchFail(status = 503, message = "Não foi possível gerar a sugestão agora.") {
  const fn = vi.fn(async (..._args: FetchArgs) => ({
    ok: false,
    status,
    json: async () => ({ ok: false, message }),
  }));
  vi.stubGlobal("fetch", fn);
  return fn;
}

/**
 * localStorage in-memory.
 *
 * Neste ambiente `window.localStorage` existe mas vem VAZIO de métodos — o
 * localStorage nativo do Node sombreia o do jsdom e fica inutilizável sem
 * `--localstorage-file`. Sem este stub, `getItem` nem existe.
 */
function installLocalStorage() {
  const store = new Map<string, string>();
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    writable: true,
    value: {
      getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
      setItem: (k: string, v: string) => void store.set(k, String(v)),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
      key: (i: number) => Array.from(store.keys())[i] ?? null,
      get length() {
        return store.size;
      },
    },
  });
}

beforeEach(() => {
  installLocalStorage();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("gate de exibição", () => {
  it("desligado: mostra só o rótulo, sem botão", () => {
    render(<Harness initial={{}} enabled={false} />);

    expect(screen.queryByTestId("generate-description")).toBeNull();
    expect(screen.getByText("Descrição do anúncio (opcional)")).toBeInTheDocument();
  });

  it("desligado por padrão quando a env de build não está ligada", () => {
    // Sem NEXT_PUBLIC_AD_DESCRIPTION_SUGGESTION_ENABLED=true o botão não sai —
    // evita expor em produção um botão que falharia em todo clique enquanto
    // não houver provedor de IA configurado.
    expect(SUGGESTION_UI_ENABLED).toBe(false);
  });

  it("ligado: o botão aparece", () => {
    render(<Harness initial={{}} />);
    expect(screen.getByTestId("generate-description")).toBeInTheDocument();
  });
});

describe("geração", () => {
  it("preenche o textarea e o contador com a sugestão", async () => {
    mockFetchOk();
    render(<Harness initial={{}} />);

    fireEvent.click(screen.getByTestId("generate-description"));

    await waitFor(() => {
      expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue(SUGESTAO);
    });
    expect(screen.getByTestId("counter")).toHaveTextContent(`${SUGESTAO.length}/1000`);
  });

  it("o texto continua editável depois de gerado", async () => {
    mockFetchOk();
    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByTestId("generate-description"));

    const textarea = await screen.findByDisplayValue(SUGESTAO);
    fireEvent.change(textarea, { target: { value: "texto editado pelo anunciante" } });

    expect(textarea).toHaveValue("texto editado pelo anunciante");
  });

  it("desabilita o botão e mostra estado de carregamento durante a chamada", async () => {
    let resolver: (v: unknown) => void = () => {};
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise((resolve) => {
            resolver = resolve;
          })
      )
    );

    render(<Harness initial={{}} />);
    const botao = screen.getByTestId("generate-description");
    fireEvent.click(botao);

    expect(botao).toBeDisabled();
    expect(botao).toHaveAttribute("aria-busy", "true");
    expect(botao).toHaveTextContent("Gerando…");

    resolver({ ok: true, status: 200, json: async () => ({ ok: true, suggestion: SUGESTAO }) });
    await waitFor(() => expect(botao).not.toBeDisabled());
  });

  it("deixa claro que é sugestão a revisar", async () => {
    mockFetchOk();
    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByTestId("generate-description"));

    const hint = await screen.findByTestId("suggestion-hint");
    expect(hint).toHaveTextContent(/revise antes de publicar/i);
  });

  it("não manda preço, cidade nem contato para o endpoint", async () => {
    const fetchMock = mockFetchOk();
    render(<Harness initial={{ whatsapp: "11999999999" }} />);
    fireEvent.click(screen.getByTestId("generate-description"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    const body = readBody(fetchMock.mock.calls[0]);
    expect(body.brandLabel).toBe("Jeep");
    expect(body.vehicleOptionKeys).toEqual(["cambio_automatico", "freios_abs"]);
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("city");
    expect(body).not.toHaveProperty("whatsapp");
    expect(JSON.stringify(body)).not.toMatch(/94\.900|Atibaia|11999999999/);
  });

  it("reaproveita o mesmo draftId entre gerações", async () => {
    const fetchMock = mockFetchOk();
    render(<Harness initial={{}} />);

    fireEvent.click(screen.getByTestId("generate-description"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    // A 1ª geração preencheu o campo, então a 2ª passa pela confirmação.
    fireEvent.click(screen.getByTestId("generate-description"));
    fireEvent.click(screen.getByTestId("confirm-replace"));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));

    const ids = fetchMock.mock.calls.map((call) => readBody(call).draftId);
    expect(ids[0]).toBeTruthy();
    expect(ids[0]).toBe(ids[1]);
  });

  it("fica desabilitado sem marca nem modelo", () => {
    render(<Harness initial={{ brandLabel: "", modelLabel: "" }} />);
    expect(screen.getByTestId("generate-description")).toBeDisabled();
  });

  it("funciona com localStorage indisponível (aba privada / cookies bloqueados)", async () => {
    // Cenário real: em aba anônima o acesso lança SecurityError. O botão não
    // pode quebrar por causa de um id que só serve para rate limit.
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() {
        throw new Error("SecurityError: acesso negado ao localStorage");
      },
    });

    const fetchMock = mockFetchOk();
    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByTestId("generate-description"));

    await waitFor(() => {
      expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue(SUGESTAO);
    });
    const body = readBody(fetchMock.mock.calls[0]);
    expect(body.draftId).toBe("");
  });
});

describe("substituição de texto existente", () => {
  it("pede confirmação antes de substituir e não chama a API na hora", () => {
    const fetchMock = mockFetchOk();
    render(<Harness initial={{ description: "texto que o anunciante escreveu" }} />);

    fireEvent.click(screen.getByTestId("generate-description"));

    expect(screen.getByRole("alertdialog")).toHaveTextContent(/vai substituir o texto atual/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("cancelar mantém o texto original intacto", () => {
    const fetchMock = mockFetchOk();
    render(<Harness initial={{ description: "texto original" }} />);

    fireEvent.click(screen.getByTestId("generate-description"));
    fireEvent.click(screen.getByTestId("cancel-replace"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue("texto original");
  });

  it("confirmar substitui o texto", async () => {
    mockFetchOk();
    render(<Harness initial={{ description: "texto original" }} />);

    fireEvent.click(screen.getByTestId("generate-description"));
    fireEvent.click(screen.getByTestId("confirm-replace"));

    await waitFor(() => {
      expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue(SUGESTAO);
    });
  });

  it("não pede confirmação quando o campo está vazio", async () => {
    const fetchMock = mockFetchOk();
    render(<Harness initial={{ description: "   " }} />);

    fireEvent.click(screen.getByTestId("generate-description"));

    expect(screen.queryByRole("alertdialog")).toBeNull();
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
  });
});

describe("falha não bloqueia a publicação", () => {
  it("mostra recado curto e deixa o textarea intocado", async () => {
    mockFetchFail();
    render(<Harness initial={{ description: "meu texto" }} />);

    fireEvent.click(screen.getByTestId("generate-description"));
    fireEvent.click(screen.getByTestId("confirm-replace"));

    const erro = await screen.findByTestId("suggestion-error");
    expect(erro).toHaveTextContent(/não foi possível gerar/i);
    expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue("meu texto");
  });

  it("erro de rede não derruba o componente e o botão volta a funcionar", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("Network request failed");
      })
    );

    render(<Harness initial={{}} />);
    const botao = screen.getByTestId("generate-description");
    fireEvent.click(botao);

    await screen.findByTestId("suggestion-error");
    expect(botao).not.toBeDisabled();
    expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue("");
  });

  it("erro não vaza detalhe interno do servidor", async () => {
    mockFetchFail(500, "connect ECONNREFUSED 127.0.0.1:11434 ollama");
    render(<Harness initial={{}} />);

    fireEvent.click(screen.getByTestId("generate-description"));

    const erro = await screen.findByTestId("suggestion-error");
    // O texto veio do backend; o componente não inventa nada além do genérico.
    // Aqui garantimos apenas que a UI não concatena stack/URL por conta própria.
    expect(erro.textContent || "").not.toMatch(/at Object|\/src\/|node_modules/);
  });

  it("429 mostra a mensagem de limite vinda do backend", async () => {
    mockFetchFail(429, "Você atingiu o limite de sugestões por hora.");
    render(<Harness initial={{}} />);

    fireEvent.click(screen.getByTestId("generate-description"));

    expect(await screen.findByTestId("suggestion-error")).toHaveTextContent(/limite de sugest/i);
  });

  it("resposta ok mas sem texto é tratada como falha", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ ok: true, suggestion: "" }),
      }))
    );

    render(<Harness initial={{}} />);
    fireEvent.click(screen.getByTestId("generate-description"));

    await screen.findByTestId("suggestion-error");
    expect(screen.getByLabelText("Descrição do anúncio")).toHaveValue("");
  });
});
