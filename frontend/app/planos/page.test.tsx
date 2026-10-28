// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import PlanosPage, { metadata } from "./page";
import { fetchPlansFromAPI } from "@/lib/plans/plan-service";
import { fetchVerifiedPublicBoost } from "@/lib/commercial/public-boost";

vi.mock("@/lib/commercial/public-boost", () => ({
  fetchVerifiedPublicBoost: vi.fn(async () => ({
    id: "boost-7d",
    name: "Destaque 7 dias",
    price_cents: 3990,
    duration_days: 7,
    active: true,
  })),
  formatBoostPriceBRL: (cents: number) =>
    (cents / 100).toLocaleString("pt-BR", {
      style: "currency",
      currency: "BRL",
    }),
}));

vi.mock("@/lib/plans/plan-service", () => ({
  fetchPlansFromAPI: vi.fn(async () => [
    { id: "cpf-free-essential", is_active: true, public_visible: true, ad_limit: 3, max_photos: 8 },
    {
      id: "cnpj-free-store",
      is_active: true,
      public_visible: true,
      ad_limit: 10,
      max_photos: 8,
      has_store_profile: true,
    },
    {
      id: "cnpj-store-start",
      name: "Lojista Start",
      is_active: true,
      public_visible: true,
      subscribable: true,
      type: "CNPJ",
      ad_limit: 20,
      max_photos: 12,
      weight: 2,
      price: 79.9,
      has_store_profile: true,
      benefits: ["Veículos para avaliação"],
      description: "Presença e oportunidades para sua loja.",
    },
    {
      id: "cnpj-store-pro",
      name: "Lojista Pro",
      is_active: true,
      public_visible: true,
      subscribable: true,
      type: "CNPJ",
      ad_limit: 1000,
      max_photos: 15,
      weight: 3,
      price: 149.9,
      has_store_profile: true,
      recommended: true,
      benefits: ["Compradores procurando", "Veículos para avaliação"],
      description: "Mais visibilidade, mais fotos e acesso a oportunidades para sua loja.",
    },
  ]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function page() {
  return render(await PlanosPage());
}
function cardText(container: HTMLElement, id: string) {
  return container.querySelector('[data-plan-id="' + id + '"]')?.textContent || "";
}

describe("página de planos — fonte comercial e layout aprovado", () => {
  it("preserva hero, SEO e ordem Destaque → Pro → Start → Grátis", async () => {
    const { container } = await page();
    expect(String(metadata.title)).toContain("Planos");
    expect(metadata.alternates?.canonical).toBe("/planos");
    expect(container.textContent).toContain("Escolha o plano ideal para anunciar seu veículo");
    expect(
      Array.from(container.querySelectorAll("[data-plan-id]")).map((el) =>
        el.getAttribute("data-plan-id")
      )
    ).toEqual(["destaque-7-dias", "lojista-pro", "lojista-start", "gratis"]);
  });

  it("não usa fotos de veículos nos cards de planos", async () => {
    const { container } = await page();
    const cards = Array.from(container.querySelectorAll("[data-plan-id]"));
    expect(cards).toHaveLength(4);
    for (const card of cards) {
      expect(card.querySelector("img, picture")).toBeNull();
    }
    expect(cardText(container, "lojista-pro")).toContain("Lojista Pro");
    expect(cardText(container, "lojista-start")).toContain("Lojista Start");
    expect(cardText(container, "gratis")).toContain("Grátis");
  });

  it("exibe limites, pesos, oportunidades e ausência de recursos não entregues", async () => {
    const { container } = await page();
    expect(cardText(container, "destaque-7-dias")).toMatch(/R\$\s*39,90/);
    expect(cardText(container, "destaque-7-dias")).toContain("peso 4");
    expect(cardText(container, "lojista-pro")).not.toMatch(/\d+ fotos? por anúncio/i);
    expect(cardText(container, "lojista-pro")).toContain(
      "Mais visibilidade e acesso a oportunidades para sua loja."
    );
    expect(cardText(container, "lojista-pro")).not.toMatch(/mais fotos/i);
    expect(cardText(container, "lojista-pro")).toContain("peso 3");
    expect(cardText(container, "lojista-pro")).toContain("Compradores procurando");
    expect(cardText(container, "lojista-start")).not.toMatch(/\d+ fotos? por anúncio/i);
    expect(cardText(container, "lojista-start")).toContain("peso 2");
    expect(cardText(container, "gratis")).not.toMatch(/\d+ fotos? por anúncio/i);
    expect(container.textContent).not.toMatch(/vídeo 360|créditos mensais de destaque/i);
  });

  it("edição de preço do Admin aparece no card após a leitura do catálogo", async () => {
    vi.mocked(fetchPlansFromAPI).mockResolvedValueOnce([
      {
        id: "cnpj-store-start",
        name: "Plano Loja Start",
        type: "CNPJ",
        price: 89.9,
        ad_limit: 20,
        max_photos: 12,
        weight: 2,
        subscribable: true,
        is_active: true,
        public_visible: true,
        benefits: [],
        has_store_profile: true,
      } as never,
    ]);
    const { container } = await page();
    expect(cardText(container, "lojista-start")).toMatch(/R\$\s*89,90/);
    expect(container.querySelector('[data-plan-id="lojista-pro"]')).toBeNull();
  });

  it("falha na API não anuncia valores de um fallback desatualizado", async () => {
    vi.mocked(fetchPlansFromAPI).mockRejectedValueOnce(new Error("backend indisponível"));
    const { container } = await page();
    expect(container.textContent).toMatch(/não foi possível confirmar os preços/i);
    expect(container.querySelectorAll("[data-plan-id]")).toHaveLength(0);
  });

  it("preserva o card Destaque e os quatro planos, sem anunciar preço não confirmado", async () => {
    vi.mocked(fetchVerifiedPublicBoost).mockResolvedValueOnce(null);
    const { container } = await page();
    expect(
      Array.from(container.querySelectorAll("[data-plan-id]")).map((el) =>
        el.getAttribute("data-plan-id")
      )
    ).toEqual(["destaque-7-dias", "lojista-pro", "lojista-start", "gratis"]);
    const boost = container.querySelector('[data-plan-id="destaque-7-dias"]');
    expect(boost?.textContent).toContain("Preço indisponível");
    expect(boost?.textContent).toContain("Não foi possível confirmar o preço");
    expect(boost?.textContent).not.toContain("R$ 39,90");
    expect(boost?.querySelector('a[href*="destaque"]')).toBeNull();
    expect(boost?.querySelector('[aria-disabled="true"]')).toBeTruthy();
  });

  it("plano não público ou inativo desaparece da vitrine", async () => {
    vi.mocked(fetchPlansFromAPI).mockResolvedValueOnce([
      {
        id: "cnpj-store-pro",
        type: "CNPJ",
        price: 149.9,
        is_active: true,
        public_visible: false,
      } as never,
    ]);
    const { container } = await page();
    expect(container.querySelector('[data-plan-id="lojista-pro"]')).toBeNull();
  });
});
