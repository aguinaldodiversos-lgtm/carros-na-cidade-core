// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";

import PublicationPlanSelector from "./PublicationPlanSelector";
import type {
  PublicationOptionsPayload,
} from "@/lib/painel/publication-options-types";

/**
 * Fase 4 — tela interna pós-revisão.
 *
 * Cobre:
 *   - loading / error / empty
 *   - perfis: free CPF, free CNPJ, Start ativo, Pro ativo, sem
 *     assinatura (subscribe oferecido)
 *   - boost_7d formatado a partir de price_cents (3990 → R$ 39,90)
 *   - boost_7d exige ad_id no body do checkout
 *   - subscribe_start/pro NÃO aparecem se houver assinatura viva
 *   - upgrade_to_pro disabled com motivo
 *   - frontend NÃO calcula preço (boost.price_cents=12345 → R$ 123,45)
 *   - Mercado Pago não chamado na renderização
 *   - checkout só ocorre após clique
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      pathname: "/painel/anuncios/ad-1/publicar",
      search: "",
      href: "",
      assign: vi.fn(),
    },
  });
});

const BASE_AD = {
  id: "ad-1",
  title: "Civic 2018",
  status: "active" as const,
  highlight_until: null,
  highlight_active: false,
};

function payload(
  overrides: Partial<PublicationOptionsPayload>
): PublicationOptionsPayload {
  return {
    ad: BASE_AD,
    user: {
      id: "u1",
      type: "CPF",
      cnpj_verified: false,
      document_verified: true,
    },
    current_plan: { id: "cpf-free-essential", name: "Plano Gratuito (CPF)", ad_limit: 3 },
    active_subscription: null,
    ad_limit: { used: 1, total: 3, available: 2 },
    eligibility: { can_publish_free: true, reason: null },
    actions: [],
    ...overrides,
  };
}

function mockOptionsFetch(
  payloadOrError:
    | { ok: true; data: PublicationOptionsPayload }
    | { ok: false; status: number; error?: string }
) {
  const fetchSpy = vi.fn().mockImplementation(async (url: string) => {
    if (typeof url === "string" && url.includes("/publication-options")) {
      if (payloadOrError.ok) {
        return {
          ok: true,
          status: 200,
          json: async () => payloadOrError.data,
        } as Response;
      }
      return {
        ok: false,
        status: payloadOrError.status,
        json: async () => ({ error: payloadOrError.error || "erro" }),
      } as Response;
    }
    // Default: never reached without explicit mock
    return {
      ok: true,
      status: 200,
      json: async () => ({}),
    } as Response;
  });
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("PublicationPlanSelector — loading / error / empty", () => {
  it("loading state aparece antes do fetch resolver", () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        () =>
          new Promise<Response>(() => {
            /* never resolves */
          })
      )
    );
    render(<PublicationPlanSelector adId="ad-1" />);
    expect(screen.getByTestId("publication-plan-loading")).toBeTruthy();
  });

  it("erro do backend (4xx ≠ 401) → mostra error state com mensagem", async () => {
    mockOptionsFetch({ ok: false, status: 410, error: "Anuncio bloqueado" });
    render(<PublicationPlanSelector adId="ad-1" />);
    const err = await screen.findByTestId("publication-plan-error");
    expect(err.textContent).toMatch(/Anuncio bloqueado/);
  });

  it("401 → redireciona para /login?next=...", async () => {
    mockOptionsFetch({ ok: false, status: 401 });
    render(<PublicationPlanSelector adId="ad-1" />);
    await waitFor(() =>
      expect(window.location.assign).toHaveBeenCalledWith(
        expect.stringMatching(/^\/login\?next=/)
      )
    );
  });

  it("actions=[] → empty state explícito", async () => {
    mockOptionsFetch({ ok: true, data: payload({ actions: [] }) });
    render(<PublicationPlanSelector adId="ad-1" />);
    expect(await screen.findByTestId("publication-plan-empty")).toBeTruthy();
  });
});

describe("PublicationPlanSelector — perfil Free CPF dentro do limite", () => {
  it("publish_free habilitado, sem subscribe_*, boost com R$ 39,90", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        actions: [
          { id: "publish_free", enabled: true, reason: null },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    expect(await screen.findByTestId("cta-publish-free")).toBeTruthy();
    expect(screen.queryByTestId("cta-subscribe_start")).toBeNull();
    expect(screen.queryByTestId("cta-subscribe_pro")).toBeNull();
    const price = await screen.findByTestId("price-boost_7d");
    expect(price.textContent).toMatch(/39,90/);
  });

  it("publish_free desabilitado quando enabled=false (mostra reason)", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        ad_limit: { used: 3, total: 3, available: 0 },
        eligibility: {
          can_publish_free: false,
          reason: "Limite de anuncios atingido.",
        },
        actions: [
          {
            id: "publish_free",
            enabled: false,
            reason: "Limite de anuncios atingido.",
          },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    const cta = (await screen.findByTestId("cta-publish-free")) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
    expect(screen.getByTestId("publish-free-reason").textContent).toMatch(/Limite/);
  });
});

describe("PublicationPlanSelector — perfil Free CNPJ verificado", () => {
  it("oferece subscribe_start (R$ 79,90) e subscribe_pro (R$ 149,90), sem hardcode no client", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        user: {
          id: "u1",
          type: "CNPJ",
          cnpj_verified: true,
          document_verified: true,
        },
        actions: [
          { id: "publish_free", enabled: true, reason: null },
          {
            id: "subscribe_start",
            enabled: true,
            plan_id: "cnpj-store-start",
            price_cents: 7990,
          },
          {
            id: "subscribe_pro",
            enabled: true,
            plan_id: "cnpj-store-pro",
            price_cents: 14990,
          },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    expect((await screen.findByTestId("price-subscribe_start")).textContent).toMatch(
      /79,90/
    );
    expect(screen.getByTestId("price-subscribe_pro").textContent).toMatch(/149,90/);
  });
});

describe("PublicationPlanSelector — Start ativo", () => {
  it("publish_with_subscription aparece, subscribe_start NÃO aparece, upgrade_to_pro disabled com motivo", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        user: {
          id: "u1",
          type: "CNPJ",
          cnpj_verified: true,
          document_verified: true,
        },
        active_subscription: { plan_id: "cnpj-store-start", status: "active" },
        actions: [
          {
            id: "publish_with_subscription",
            enabled: true,
            plan_id: "cnpj-store-start",
            subscription_status: "active",
            reason: null,
          },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
          {
            id: "upgrade_to_pro",
            enabled: false,
            plan_id: "cnpj-store-pro",
            reason: "Cancele o Start e assine o Pro.",
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    expect(await screen.findByTestId("cta-publish-with-subscription")).toBeTruthy();
    expect(screen.queryByTestId("cta-subscribe_start")).toBeNull();
    const upgradeCta = screen.getByTestId("cta-upgrade_to_pro") as HTMLButtonElement;
    expect(upgradeCta.disabled).toBe(true);
    expect(screen.getByTestId("upgrade-reason").textContent).toMatch(/Start/i);
  });
});

describe("PublicationPlanSelector — Pro ativo", () => {
  it("apenas publish_with_subscription + boost; sem subscribe_* nem upgrade", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        user: {
          id: "u1",
          type: "CNPJ",
          cnpj_verified: true,
          document_verified: true,
        },
        active_subscription: { plan_id: "cnpj-store-pro", status: "active" },
        actions: [
          {
            id: "publish_with_subscription",
            enabled: true,
            plan_id: "cnpj-store-pro",
            subscription_status: "active",
            reason: null,
          },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    expect(await screen.findByTestId("cta-publish-with-subscription")).toBeTruthy();
    expect(screen.queryByTestId("cta-subscribe_start")).toBeNull();
    expect(screen.queryByTestId("cta-subscribe_pro")).toBeNull();
    expect(screen.queryByTestId("cta-upgrade_to_pro")).toBeNull();
  });
});

describe("PublicationPlanSelector — checkout boost", () => {
  it("clique no Destaque chama POST /api/payments/boost-7d/checkout com APENAS ad_id (não preço, não dias)", async () => {
    let optionsCalled = false;
    const fetchSpy = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (typeof url === "string" && url.includes("/publication-options")) {
        optionsCalled = true;
        return {
          ok: true,
          status: 200,
          json: async () =>
            payload({
              actions: [
                {
                  id: "boost_7d",
                  enabled: true,
                  ad_id: "ad-1",
                  price_cents: 3990,
                  days: 7,
                  already_active: false,
                  highlight_until: null,
                  note: null,
                },
              ],
            }),
        } as Response;
      }
      if (typeof url === "string" && url === "/api/payments/boost-7d/checkout") {
        const parsedBody = JSON.parse(String((init as { body?: string })?.body));
        // GARANTIA: nunca envia preço, dias, boost_option_id ou amount
        if ("price" in parsedBody || "amount" in parsedBody || "days" in parsedBody) {
          throw new Error("Body must not contain price/amount/days");
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ init_point: "https://mp.example/abc" }),
        } as Response;
      }
      return { ok: true, status: 200, json: async () => ({}) } as Response;
    });
    vi.stubGlobal("fetch", fetchSpy);

    render(<PublicationPlanSelector adId="ad-1" />);
    const cta = await screen.findByTestId("cta-boost_7d");
    expect(optionsCalled).toBe(true);
    // Antes do clique, NÃO há chamada para checkout
    const callsBefore = fetchSpy.mock.calls.filter(
      ([u]) => typeof u === "string" && u.includes("/api/payments/boost-7d/checkout")
    );
    expect(callsBefore.length).toBe(0);

    fireEvent.click(cta);

    await waitFor(() =>
      expect(window.location.href).toBe("https://mp.example/abc")
    );

    const checkoutCall = fetchSpy.mock.calls.find(
      ([u]) => typeof u === "string" && u.includes("/api/payments/boost-7d/checkout")
    );
    expect(checkoutCall).toBeTruthy();
    const body = JSON.parse(String((checkoutCall![1] as RequestInit).body));
    expect(body).toEqual({ ad_id: "ad-1" });
  });

  it("boost desabilitado quando ad_id ausente do payload", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        actions: [
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    const cta = (await screen.findByTestId("cta-boost_7d")) as HTMLButtonElement;
    expect(cta.disabled).toBe(true);
  });
});

describe("PublicationPlanSelector — formatação de preço", () => {
  it("price_cents arbitrário do backend é formatado pelo client (12345 → R$ 123,45)", async () => {
    mockOptionsFetch({
      ok: true,
      data: payload({
        actions: [
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 12345,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    const price = await screen.findByTestId("price-boost_7d");
    expect(price.textContent).toMatch(/123,45/);
  });
});

describe("PublicationPlanSelector — Mercado Pago não é tocado no render", () => {
  it("apenas o GET de publication-options é chamado durante render — checkouts ficam pra clique do user", async () => {
    const fetchSpy = mockOptionsFetch({
      ok: true,
      data: payload({
        actions: [
          { id: "publish_free", enabled: true, reason: null },
          {
            id: "boost_7d",
            enabled: true,
            ad_id: "ad-1",
            price_cents: 3990,
            days: 7,
            already_active: false,
            highlight_until: null,
            note: null,
          },
          {
            id: "subscribe_start",
            enabled: true,
            plan_id: "cnpj-store-start",
            price_cents: 7990,
          },
        ],
      }),
    });

    render(<PublicationPlanSelector adId="ad-1" />);
    await screen.findByTestId("cta-boost_7d");

    const checkoutCalls = fetchSpy.mock.calls.filter(([u]) => {
      const url = String(u);
      return (
        url.includes("/api/payments/") || url.includes("mercadopago") || url.includes("boost-7d")
      );
    });
    expect(checkoutCalls.length).toBe(0);
  });
});
