// @vitest-environment jsdom
import { describe, expect, it, afterEach, vi, beforeEach } from "vitest";
import { render, fireEvent, cleanup, waitFor } from "@testing-library/react";

import BoostCheckoutButton from "./BoostCheckoutButton";

/**
 * Fase 3B — botão de Destaque 7 dias no painel do anúncio.
 *
 * Cobre:
 *   - chama POST /api/payments/boost-7d/checkout (endpoint dedicado)
 *   - envia ad_id no body, NUNCA preço/dias
 *   - 200 + init_point → window.location.href = init_point
 *   - 401 → redireciona para /login?next=...
 *   - erro → mostra mensagem
 *   - sem ad_id → mostra erro local sem chamar fetch
 */

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

beforeEach(() => {
  // jsdom não permite reescrever location.href direto sem stub.
  Object.defineProperty(window, "location", {
    writable: true,
    value: {
      pathname: "/painel/anuncios/ad1",
      search: "",
      href: "",
      assign: vi.fn(),
    },
  });
});

function mockFetchOnce(response: Partial<Response> & { jsonValue?: unknown }) {
  const fetchSpy = vi.fn().mockResolvedValueOnce({
    ok: response.ok ?? true,
    status: response.status ?? 200,
    json: async () => response.jsonValue ?? {},
  } as Response);
  vi.stubGlobal("fetch", fetchSpy);
  return fetchSpy;
}

describe("BoostCheckoutButton — endpoint dedicado boost-7d", () => {
  it("clica → POST /api/payments/boost-7d/checkout com { ad_id }", async () => {
    const fetchSpy = mockFetchOnce({
      ok: true,
      jsonValue: { init_point: "https://mercadopago.com/sandbox/abc" },
    });

    const { getByRole } = render(<BoostCheckoutButton adId="ad-123" />);
    fireEvent.click(getByRole("button"));

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(1));
    const [url, init] = fetchSpy.mock.calls[0];
    expect(url).toBe("/api/payments/boost-7d/checkout");
    expect(init.method).toBe("POST");
    const body = JSON.parse(String(init.body));
    expect(body).toEqual({ ad_id: "ad-123" });
    // GARANTIA: nunca envia preço, dias, boost_option_id ou amount
    expect(body).not.toHaveProperty("amount");
    expect(body).not.toHaveProperty("price");
    expect(body).not.toHaveProperty("boost_option_id");
    expect(body).not.toHaveProperty("days");
  });

  it("200 + init_point → window.location.href = init_point (Mercado Pago)", async () => {
    mockFetchOnce({
      ok: true,
      jsonValue: { init_point: "https://mercadopago.com/sandbox/xyz" },
    });

    const { getByRole } = render(<BoostCheckoutButton adId="ad-1" />);
    fireEvent.click(getByRole("button"));

    await waitFor(() =>
      expect(window.location.href).toBe("https://mercadopago.com/sandbox/xyz")
    );
  });

  it("401 → redireciona para /login?next=PATH atual", async () => {
    mockFetchOnce({ ok: false, status: 401 });

    const { getByRole } = render(<BoostCheckoutButton adId="ad-1" />);
    fireEvent.click(getByRole("button"));

    await waitFor(() => expect(window.location.assign).toHaveBeenCalledTimes(1));
    expect(window.location.assign).toHaveBeenCalledWith(
      expect.stringMatching(/^\/login\?next=/)
    );
  });

  it("erro do backend (4xx ≠ 401) → mostra mensagem amigável", async () => {
    mockFetchOnce({
      ok: false,
      status: 400,
      jsonValue: { error: "ad_id e obrigatorio" },
    });

    const { getByRole, findByRole } = render(<BoostCheckoutButton adId="ad-1" />);
    fireEvent.click(getByRole("button"));

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/ad_id e obrigatorio/);
  });

  it("sem ad_id → mostra erro local SEM chamar fetch", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { getByRole, findByRole } = render(<BoostCheckoutButton adId="" />);
    fireEvent.click(getByRole("button"));

    const alert = await findByRole("alert");
    expect(alert.textContent).toMatch(/ID do anúncio ausente/);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("data attributes para audit/E2E (data-boost-cta + data-ad-id)", () => {
    const { container } = render(<BoostCheckoutButton adId="ad-42" />);
    const btn = container.querySelector("button");
    expect(btn?.getAttribute("data-boost-cta")).toBe("boost-7d");
    expect(btn?.getAttribute("data-ad-id")).toBe("ad-42");
  });

  it("label customizado é renderizado", () => {
    const { getByRole } = render(
      <BoostCheckoutButton adId="ad-1" label="Impulsionar este Civic" />
    );
    expect(getByRole("button").textContent).toMatch(/Impulsionar este Civic/);
  });
});
