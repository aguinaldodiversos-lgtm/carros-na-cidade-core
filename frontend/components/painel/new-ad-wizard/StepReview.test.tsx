// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import StepReview from "./StepReview";
import type { DashboardPayload } from "@/lib/dashboard-types";
import type { WizardFormState } from "./types";
import { fetchPlansFromAPI } from "@/lib/plans/plan-service";

const CATALOG = [
  {
    id: "cpf-free-essential",
    type: "CPF",
    is_active: true,
    public_visible: true,
    ad_limit: 3,
    max_photos: 8,
  },
  {
    id: "cnpj-free-store",
    type: "CNPJ",
    is_active: true,
    public_visible: true,
    ad_limit: 10,
    max_photos: 8,
    has_store_profile: true,
  },
  {
    id: "cnpj-store-start",
    name: "Start",
    type: "CNPJ",
    price: 79.9,
    is_active: true,
    public_visible: true,
    subscribable: true,
    ad_limit: 20,
    max_photos: 12,
    weight: 2,
    has_store_profile: true,
    benefits: ["Veículos para avaliação"],
  },
  {
    id: "cnpj-store-pro",
    name: "Pro",
    type: "CNPJ",
    price: 149.9,
    is_active: true,
    public_visible: true,
    subscribable: true,
    ad_limit: 1000,
    max_photos: 15,
    weight: 3,
    has_store_profile: true,
    recommended: true,
    benefits: ["Compradores procurando", "Veículos para avaliação"],
  },
];

vi.mock("@/lib/plans/plan-service", () => ({
  fetchPlansFromAPI: vi.fn(),
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

function makeDashboard(accountType: "CPF" | "CNPJ" = "CNPJ"): DashboardPayload {
  return {
    user: {
      id: "user-1",
      name: "Usuário Teste",
      email: "teste@example.com",
      type: accountType,
      cnpj_verified: accountType === "CNPJ",
    },
    current_plan: null,
    stats: {} as DashboardPayload["stats"],
    active_ads: [],
    paused_ads: [],
    boost_options: [],
  } as DashboardPayload;
}

function Harness({
  initial,
  handlers,
  accountType = "CNPJ",
}: {
  initial?: Partial<WizardFormState>;
  handlers?: Handlers;
  accountType?: "CPF" | "CNPJ";
}) {
  const [state, setState] = useState<WizardFormState>(makeState(initial));
  return (
    <StepReview
      state={state}
      patch={(partial) => setState((prev) => ({ ...prev, ...partial }))}
      dashboard={makeDashboard(accountType)}
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
  vi.mocked(fetchPlansFromAPI).mockReset();
  vi.mocked(fetchPlansFromAPI).mockResolvedValue(CATALOG as never);
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({
      ok: true,
      json: async () => ({
        boost: {
          id: "boost-7d",
          name: "Destaque 7 dias",
          price_cents: 3990,
          duration_days: 7,
          active: true,
        },
      }),
    }))
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("revisão do anúncio — ofertas integradas a /planos", () => {
  it("preserva resumo do veículo, título, qualidade, cidade e responsabilidade", () => {
    render(<Harness />);
    expect(screen.getByText("Seu anúncio está quase no ar")).toBeTruthy();
    expect(screen.getByText(/2025 Hyundai HB20 Sense 1.0 Flex 12V/)).toBeTruthy();
    expect(screen.getByText("R$ 69.990,00")).toBeTruthy();
    expect(screen.getByText("35.000 km")).toBeTruthy();
    expect(screen.getByText("Atibaia / SP")).toBeTruthy();
    expect(screen.getByText("100%")).toBeTruthy();
    expect(screen.getByText(/Confirmo que as informações são verdadeiras/)).toBeTruthy();
  });

  it("renderiza quatro planos e link para detalhes na ordem correta para CNPJ", async () => {
    const { container } = render(<Harness />);
    await waitFor(() => expect(container.querySelectorAll("[data-plan-key]")).toHaveLength(4));
    expect(
      Array.from(container.querySelectorAll("[data-plan-key]")).map((el) =>
        el.getAttribute("data-plan-key")
      )
    ).toEqual(["boost-7d", "lojista-pro", "lojista-start", "free"]);
    expect(
      screen.getByRole("link", { name: /Ver detalhes de todos os planos/ }).getAttribute("href")
    ).toBe("/planos");
    expect(screen.getByText("R$ 39,90")).toBeTruthy();
    expect(screen.getByText("R$ 149,90")).toBeTruthy();
    expect(screen.getByText("R$ 79,90")).toBeTruthy();
    expect(screen.getAllByText("R$ 0").length).toBeGreaterThan(0);
    expect(container.textContent).toContain("15 fotos por anúncio");
    expect(container.textContent).toContain("12 fotos por anúncio");
    expect(container.textContent).toContain("peso 4");
    expect(container.textContent).toContain("peso 3");
    expect(container.textContent).toContain("peso 2");
    expect(container.textContent).not.toMatch(/vídeo 360|créditos mensais/i);
  });

  it("CPF não recebe assinatura exclusiva para CNPJ", async () => {
    const { container } = render(<Harness accountType="CPF" />);
    await waitFor(() => expect(container.querySelector('[data-plan-key="boost-7d"]')).toBeTruthy());
    expect(container.querySelector('[data-plan-key="lojista-pro"]')).toBeNull();
    expect(container.querySelector('[data-plan-key="lojista-start"]')).toBeNull();
    expect(container.querySelector('[data-plan-key="free"]')).toBeTruthy();
  });

  it("preço editado no Admin reflete na última etapa, sem valores fixos", async () => {
    vi.mocked(fetchPlansFromAPI).mockResolvedValueOnce(
      CATALOG.map((plan) =>
        plan.id === "cnpj-store-start"
          ? { ...plan, price: 89.9, ad_limit: 25, max_photos: 13, weight: 2.5 }
          : plan
      ) as never
    );
    const { container } = render(<Harness />);
    await waitFor(() => expect(container.textContent).toMatch(/R\$\s*89,90/));
    expect(container.textContent).toContain("Até 25 anúncios ativos");
    expect(container.textContent).toContain("13 fotos por anúncio");
    expect(container.textContent).toContain("peso 2.5");
  });

  it("plano oculto ou não contratável não fica selecionável", async () => {
    vi.mocked(fetchPlansFromAPI).mockResolvedValueOnce(
      CATALOG.map((plan) =>
        plan.id === "cnpj-store-pro" ? { ...plan, public_visible: false } : plan
      ) as never
    );
    const { container } = render(<Harness />);
    await waitFor(() =>
      expect(container.querySelector('[data-plan-key="lojista-start"]')).toBeTruthy()
    );
    expect(container.querySelector('[data-plan-key="lojista-pro"]')).toBeNull();
  });

  it("falha comercial mantém apenas publicação sem destaque e informa indisponibilidade", async () => {
    vi.mocked(fetchPlansFromAPI).mockRejectedValueOnce(new Error("API fora"));
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("API fora");
      })
    );
    const { container } = render(<Harness />);
    await waitFor(() =>
      expect(screen.getByText(/Não foi possível confirmar os planos pagos/)).toBeTruthy()
    );
    expect(container.querySelectorAll("[data-plan-key]")).toHaveLength(1);
    expect(container.querySelector('[data-plan-key="free"]')).toBeTruthy();
  });

  it("termina em publicação grátis somente após aceitar responsabilidade", async () => {
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onPublishFree }} />);
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishFree).not.toHaveBeenCalled();
    expect(screen.getByText(/Marque a confirmação acima para publicar/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishFree).toHaveBeenCalledTimes(1);
  });

  it("selecionar Pro envia o plan_id real ao checkout sem publicar antes", async () => {
    const onSubscribe = vi.fn();
    const onPublishFree = vi.fn();
    render(<Harness handlers={{ onSubscribe, onPublishFree }} />);
    await waitFor(() => expect(screen.getByRole("button", { name: "Assinar Pro" })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "Assinar Pro" }));
    expect(screen.getByText("Lojista Pro selecionado")).toBeTruthy();
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onSubscribe).toHaveBeenCalledWith("cnpj-store-pro");
    expect(onPublishFree).not.toHaveBeenCalled();
  });

  it("Destaque só é publicado após termo, com opção avulsa validada", async () => {
    const onPublishBoost = vi.fn();
    render(<Harness handlers={{ onPublishBoost }} />);
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Destacar agora" })).toBeTruthy()
    );
    fireEvent.click(screen.getByRole("button", { name: "Destacar agora" }));
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByTestId("review-primary-cta"));
    expect(onPublishBoost).toHaveBeenCalledTimes(1);
  });
});
