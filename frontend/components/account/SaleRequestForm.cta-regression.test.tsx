// @vitest-environment jsdom

import { cleanup, render, screen, waitFor } from "@testing-library/react";
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
 * REGRESSÃO DO BOTÃO CINZA MUDO.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O DEFEITO OBSERVADO EM USO REAL
 * ────────────────────────────────────────────────────────────────────────────
 * O proprietário preencheu o formulário inteiro, escolheu a condição, viu
 * "Curitiba" escrito no campo de cidade e anexou nove fotos. O botão "Enviar meu
 * carro para as lojas" continuou desabilitado, sem nenhuma mensagem, sem nenhum
 * campo destacado e sem nenhuma pista do motivo.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * A CAUSA RAIZ, REPRODUZIDA
 * ────────────────────────────────────────────────────────────────────────────
 * `PurchaseIntentCityField` mantém o TEXTO DIGITADO no input quando a lista de
 * sugestões fecha sem escolha — e a lista fecha em qualquer clique fora
 * (`mousedown` no documento). Quem digita "Curitiba" e clica no campo seguinte
 * fica com a cidade escrita na tela e `city === null` no estado.
 *
 * O gate anterior (`canSubmit`) era um booleano agregado de doze termos, lido
 * apenas no `disabled` do botão. Ele sabia que `Boolean(city)` era falso e não
 * tinha como dizer isso a ninguém: a informação de QUAL termo falhou era
 * destruída no mesmo `&&` que a calculava.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POR QUE ESTE ARQUIVO NÃO MOCKA O CAMPO DE CIDADE
 * ────────────────────────────────────────────────────────────────────────────
 * O outro arquivo de teste substitui `PurchaseIntentCityField` por um botão, o
 * que é adequado para exercitar o resto da ficha. Mas o defeito VIVE nesse
 * componente: um teste com o mock provaria que o formulário lida bem com um
 * `onChange` que nunca deixa de disparar — exatamente o cenário que não
 * acontecia. Aqui o componente é o real.
 */

const mockPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush, refresh: vi.fn() }),
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

const BRANDS = [{ code: "59", name: "VW - VolksWagen" }];
const MODELS = [{ code: "5940", name: "Golf Comfortline 1.4 TSI" }];
const YEARS = [{ code: "2016-1", name: "2016 Gasolina" }];
const CITIES = [{ id: 42, name: "Curitiba", state: "PR" }];

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("/api/painel/cidades/search")) {
        return { ok: true, json: async () => ({ data: CITIES }) } as unknown as Response;
      }
      const data = url.includes("/api/fipe/brands")
        ? BRANDS
        : url.includes("/api/fipe/models")
          ? MODELS
          : url.includes("/api/fipe/years")
            ? YEARS
            : [];
      return { ok: true, json: async () => ({ data }) } as unknown as Response;
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function setupUser() {
  return userEvent.setup({ delay: null });
}

function makeFile(name: string) {
  return new File([new Uint8Array([1, 2, 3])], name, { type: "image/jpeg" });
}

async function choose(user: ReturnType<typeof setupUser>, field: string, value: string) {
  const input = document.querySelector<HTMLInputElement>(
    `input[name="${field}"][value="${value}"]`
  );
  if (!input) throw new Error(`opção não encontrada: ${field}=${value}`);
  await user.click(input);
}

/**
 * Tudo, menos a cidade — que cada teste resolve à sua maneira.
 *
 * `photoCount` é 9 porque nove foi o número do relato original. O valor não tem
 * significado especial no código (o intervalo válido é 4–12), e é justamente por
 * isso que ele precisa estar aqui: prova que o problema NUNCA foi a quantidade
 * de fotos, que era a primeira suspeita natural.
 */
async function fillEverythingExceptCity(user: ReturnType<typeof setupUser>, photoCount = 9) {
  await waitFor(() => expect(screen.getByTestId("sale-request-brand")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-brand"), "59");

  await waitFor(() => expect(screen.getByTestId("sale-request-model")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-model"), "5940");

  await waitFor(() => expect(screen.getByTestId("sale-request-year")).not.toBeDisabled());
  await user.selectOptions(screen.getByTestId("sale-request-year"), "2016-1");

  await user.type(screen.getByTestId("sale-request-mileage"), "85000");
  await user.selectOptions(screen.getByTestId("sale-request-transmission"), "automatico");
  await user.selectOptions(screen.getByTestId("sale-request-fuel"), "flex");

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

  uploadSaleRequestPhotos.mockResolvedValue(
    Array.from({ length: photoCount }, (_, index) => ({
      storage_key: `sale-requests/7/sess/uuid-${index}.webp`,
      url: `/api/vehicle-images?key=uuid-${index}`,
    }))
  );
  await user.upload(
    screen.getByTestId("sale-request-photo-input"),
    Array.from({ length: photoCount }, (_, index) => makeFile(`${index}.jpg`))
  );
  await waitFor(() =>
    expect(screen.getByTestId("sale-request-photos").querySelectorAll("img")).toHaveLength(
      photoCount
    )
  );

  // O PISO (4.3.3) entra aqui: sem ele a única pendência deixaria de ser a
  // CIDADE, e o teste passaria a exercitar outra coisa.
  await user.type(screen.getByTestId("sale-request-minimum-price"), "6000000");
}

/** Digita a cidade e clica FORA, sem escolher a sugestão. */
async function typeCityWithoutChoosing(user: ReturnType<typeof setupUser>) {
  await user.selectOptions(screen.getByLabelText("Estado (UF)"), "PR");
  await user.type(screen.getByTestId("purchase-intent-city-input"), "Curitiba");
  await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());
  await user.click(document.body);
}

/** Digita a cidade e ESCOLHE a sugestão da lista. */
async function pickCityFromList(user: ReturnType<typeof setupUser>) {
  await user.selectOptions(screen.getByLabelText("Estado (UF)"), "PR");
  await user.type(screen.getByTestId("purchase-intent-city-input"), "Curitiba");
  await waitFor(() => expect(screen.getByRole("listbox")).toBeTruthy());
  await user.click(screen.getByRole("button", { name: /Curitiba/i }));
  await waitFor(() => expect(screen.getByTestId("purchase-intent-city-selected")).toBeTruthy());
}

describe("o cenário exato do relato", () => {
  it("cidade digitada mas não escolhida: o CTA EXPLICA em vez de ficar cinza", async () => {
    render(<SaleRequestForm />);
    const user = setupUser();

    await fillEverythingExceptCity(user, 9);
    await typeCityWithoutChoosing(user);

    // O sintoma visual original permanece — o texto continua no campo. É o
    // comportamento do componente de cidade, e não é o que esta tela conserta.
    expect(screen.getByTestId("purchase-intent-city-input")).toHaveValue("Curitiba");

    // O QUE MUDOU (1): o botão não está mais cinza.
    const submit = screen.getByTestId("sale-request-submit");
    expect(submit).not.toBeDisabled();

    await user.click(submit);

    // O QUE MUDOU (2): o clique não gasta uma requisição para descobrir o óbvio.
    expect(createSaleRequest).not.toHaveBeenCalled();

    // O QUE MUDOU (3): a tela diz exatamente o que falta, e onde.
    const error = screen.getByTestId("sale-request-error");
    expect(error).toHaveTextContent("Revise 1 informação antes de enviar: Cidade.");

    // O QUE MUDOU (4): o foco vai para o campo pendente.
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("Estado (UF)"))
    );

    // O QUE MUDOU (5): a seção do veículo é marcada como pendente.
    expect(screen.getByTestId("section-vehicle")).toHaveAttribute("data-complete", "false");
  });

  it("escolhendo a cidade na lista, a mesma ficha é reconhecida como COMPLETA", async () => {
    // Este é o teste de §53: nada mudou além de a cidade ter vindo do catálogo.
    // Se qualquer estado visualmente preenchido deixar de ser reconhecido pela
    // validação, este teste falha.
    createSaleRequest.mockResolvedValue({ sale_request: { id: 123 } });

    render(<SaleRequestForm />);
    const user = setupUser();

    await fillEverythingExceptCity(user, 9);
    await pickCityFromList(user);

    expect(screen.getByTestId("sale-request-progress-label")).toHaveTextContent("9 de 9 etapas");
    expect(screen.getByTestId("sale-request-ready")).toBeTruthy();

    await user.click(screen.getByTestId("sale-request-submit"));

    await waitFor(() => expect(createSaleRequest).toHaveBeenCalledTimes(1));
    expect(createSaleRequest.mock.calls[0][0]).toMatchObject({ city_id: 42 });
    expect(createSaleRequest.mock.calls[0][0].images).toHaveLength(9);
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith("/dashboard/vender-para-lojas/123"));
  });

  it("corrigir a cidade depois do erro limpa a pendência sem recarregar nada", async () => {
    createSaleRequest.mockResolvedValue({ sale_request: { id: 123 } });

    render(<SaleRequestForm />);
    const user = setupUser();

    await fillEverythingExceptCity(user, 9);
    await typeCityWithoutChoosing(user);
    await user.click(screen.getByTestId("sale-request-submit"));

    expect(screen.getByTestId("sale-request-error")).toHaveTextContent("Cidade");

    // A mensagem inline da cidade também aparece, dentro da própria seção.
    expect(screen.getByText(/escolha a cidade na lista/i)).toBeTruthy();

    await pickCityFromList(user);

    // O erro inline some sozinho: ele é DERIVADO do estado, não guardado.
    expect(screen.queryByText(/escolha a cidade na lista/i)).toBeNull();
    expect(screen.getByTestId("section-vehicle")).toHaveAttribute("data-complete", "true");
    expect(screen.getByTestId("sale-request-ready")).toBeTruthy();
  });
});
