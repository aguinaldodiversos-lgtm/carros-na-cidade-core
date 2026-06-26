// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import StepReview from "./StepReview";
import type { WizardFormState } from "./types";

// Sem rede: cards renderizam com os valores oficiais de fallback (spec §14).
vi.mock("@/lib/plans/plan-service", () => ({
  fetchPlansFromAPI: vi.fn(async () => []),
}));

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
    brandLabel: "Hyundai",
    modelLabel: "HB20",
    yearModel: "2025",
    yearManufacture: "2025",
    versionLabel: "Sense 1.0 Flex 12V",
    color: "Branco",
    armored: false,
    fuel: "Flex",
    transmission: "Manual",
    bodyStyle: "Hatch",
    fipeValue: "",
    mileage: "35000",
    price: "R$ 69.990,00",
    description: "Carro impecável, revisões em dia.",
    cityId: 123,
    city: "Atibaia",
    state: "SP",
    plateFinal: "",
    whatsapp: "",
    phone: "",
    acceptTerms: false,
    vehicleOptionKeys: ["air-conditioning"],
    boostOptionId: null,
    draftPhotoUrls: ["https://example.com/car.jpg"],
    ...over,
  };
}

type Handlers = {
  onBack?: () => void;
  onPublishFree?: () => void;
  onPublishBoost?: () => void;
  onSubscribe?: (planId: string) => void;
};

/** Harness com estado real para refletir patch() (checkbox de termos etc.). */
function Harness({
  initial,
  handlers,
}: {
  initial?: Partial<WizardFormState>;
  handlers?: Handlers;
}) {
  const [state, setState] = useState<WizardFormState>(makeState(initial));
  return (
    <StepReview
      state={state}
      patch={(partial) => setState((prev) => ({ ...prev, ...partial }))}
      dashboard={null}
      dashboardError={null}
      boostOptions={[]}
      submitState="idle"
      submitMessage=""
      subscribeState="idle"
      subscribeMessage=""
      onBack={handlers?.onBack ?? (() => {})}
      onPublishFree={handlers?.onPublishFree ?? (() => {})}
      onPublishBoost={handlers?.onPublishBoost ?? (() => {})}
      onSubscribe={handlers?.onSubscribe ?? (() => {})}
    />
  );
}

beforeEach(() => {
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
});
afterEach(cleanup);

describe("StepReview — renderização", () => {
  it("mostra o título comercial e o subtítulo", () => {
    render(<Harness />);
    expect(screen.getByText("Seu anúncio está quase no ar")).toBeTruthy();
    expect(screen.getByText(/Revise os dados e escolha como deseja publicar/i)).toBeTruthy();
  });

  it("mostra resumo do veículo com preço, km e cidade", () => {
    render(<Harness />);
    expect(screen.getByText(/2025 Hyundai HB20 Sense 1\.0 Flex 12V/)).toBeTruthy();
    expect(screen.getByText("R$ 69.990,00")).toBeTruthy();
    expect(screen.getByText("35.000 km")).toBeTruthy();
    expect(screen.getByText("Atibaia / SP")).toBeTruthy();
  });

  it("não renderiza mais o hero/card azul envolvendo o título (spec §2)", () => {
    const { container } = render(<Harness />);
    const title = screen.getByTestId("review-title");
    // Título fica sobre o fundo claro (texto escuro), não dentro de um hero azul.
    expect(title.className).toContain("text-cnc-text-strong");
    expect(title.className).not.toContain("text-white");
    // Nenhum elemento usa o gradiente azul do hero antigo.
    expect(container.querySelector('[class*="linear-gradient"]')).toBeNull();
  });

  it("mostra qualidade 100% / Muito boa para anúncio completo", () => {
    render(<Harness />);
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText("Muito boa")).toBeTruthy();
    expect(screen.getAllByText(/Anúncio completo/).length).toBeGreaterThan(0);
  });

  it("mostra descrição, Estado (UF), Cidade e checkbox de responsabilidade", () => {
    render(<Harness />);
    expect(screen.getByDisplayValue("Carro impecável, revisões em dia.")).toBeTruthy();
    expect(screen.getByText(/\/1000/)).toBeTruthy();
    expect(screen.getByText(/Estado \(UF\)/)).toBeTruthy();
    expect(screen.getAllByText(/Cidade/).length).toBeGreaterThan(0);
    expect(screen.getByText(/Confirmo que as informações são verdadeiras/)).toBeTruthy();
  });

  it("renderiza os 4 planos na ordem correta com os valores corretos", () => {
    render(<Harness />);
    expect(screen.getAllByText("Destaque 7 dias").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 39,90")).toBeTruthy();
    expect(screen.getAllByText("Lojista Pro").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 149,90")).toBeTruthy();
    expect(screen.getAllByText("Lojista Start").length).toBeGreaterThan(0);
    expect(screen.getByText("R$ 79,90")).toBeTruthy();
    expect(screen.getAllByText("Grátis").length).toBeGreaterThan(0);
    // R$ 0 aparece no card Grátis e na barra fixa (free selecionado por padrão).
    expect(screen.getAllByText("R$ 0").length).toBeGreaterThan(0);

    // Botões dos cards
    expect(screen.getByRole("button", { name: "Destacar agora" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assinar Pro" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Assinar Start" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Começar grátis" })).toBeTruthy();
  });

  it("mostra comparativo e bloco de confiança", () => {
    render(<Harness />);
    expect(screen.getByText("Compare as opções")).toBeTruthy();
    expect(screen.getByText("Pagamento seguro")).toBeTruthy();
    expect(screen.getByText("Ativação imediata")).toBeTruthy();
    expect(screen.getByText("Sem fidelidade")).toBeTruthy();
    expect(screen.getByText("Suporte especializado")).toBeTruthy();
  });
});

describe("StepReview — interação", () => {
  it("inicia com 'Grátis' selecionado e CTA de publicação grátis", () => {
    render(<Harness />);
    const cta = screen.getByTestId("review-primary-cta");
    expect(cta.textContent).toContain("Publicar anúncio grátis");
    expect(screen.getByText("Publicação grátis selecionada")).toBeTruthy();
  });

  it("selecionar Lojista Pro atualiza a barra fixa e o CTA", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar Pro" }));
    expect(screen.getByText("Lojista Pro selecionado")).toBeTruthy();
    expect(screen.getByTestId("review-primary-cta").textContent).toContain(
      "Continuar para pagamento"
    );
  });

  it("publicar sem marcar responsabilidade mostra erro e NÃO publica", () => {
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onPublishFree }} />);
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishFree).not.toHaveBeenCalled();
    expect(screen.getByText(/Marque a confirmação acima para publicar/)).toBeTruthy();
  });

  it("após marcar responsabilidade, publicar grátis chama o handler", () => {
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onPublishFree }} />);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishFree).toHaveBeenCalledTimes(1);
  });

  it("selecionar Pro e continuar chama onSubscribe com o plano correto (sem exigir termo)", () => {
    const onSubscribe = vi.fn();
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onSubscribe, onPublishFree }} />);
    fireEvent.click(screen.getByRole("button", { name: "Assinar Pro" }));
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onSubscribe).toHaveBeenCalledWith("cnpj-store-pro");
    expect(onPublishFree).not.toHaveBeenCalled();
  });

  it("selecionar Destaque, marcar termo e continuar chama onPublishBoost", () => {
    const onPublishBoost = vi.fn();
    render(<Harness handlers={{ onPublishBoost }} />);
    fireEvent.click(screen.getByRole("button", { name: "Destacar agora" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishBoost).toHaveBeenCalledTimes(1);
  });

  it("a opção paga oferece atalho 'Publicar grátis' que respeita o termo", () => {
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onPublishFree }} />);
    // Seleciona Pro (pago) → aparece o botão secundário "Publicar grátis"
    fireEvent.click(screen.getByRole("button", { name: "Assinar Pro" }));
    const shortcut = screen.getByRole("button", { name: "Publicar grátis" });
    fireEvent.click(shortcut);
    expect(onPublishFree).not.toHaveBeenCalled(); // termo ainda não marcado
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(shortcut);
    expect(onPublishFree).toHaveBeenCalledTimes(1);
  });
});
