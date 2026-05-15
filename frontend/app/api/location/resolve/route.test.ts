import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BFF POST /api/location/resolve.
 *
 * Cobertura:
 *   - validação local (lat/long fora de range → 400).
 *   - body inválido (JSON malformado) → 400.
 *   - proxy correto para o backend interno (URL, headers, body).
 *   - tradução do envelope do backend (data ou null).
 *   - rate limit per-IP (15 req/min).
 *   - token interno NUNCA aparece em resposta para client.
 *
 * Mocks: fetch global + `buildInternalBackendHeaders` para garantir que o
 * token aparece SÓ no header da chamada ao backend, não em outra parte.
 */

const mocks = vi.hoisted(() => ({
  buildInternalBackendHeaders: vi.fn(),
  resolveBackendApiUrl: vi.fn(),
  fetchSpy: vi.fn(),
}));

vi.mock("@/lib/http/internal-backend-headers", () => ({
  buildInternalBackendHeaders: mocks.buildInternalBackendHeaders,
  INTERNAL_USER_AGENT: "cnc-internal/1.0",
}));

vi.mock("@/lib/env/backend-api", () => ({
  resolveBackendApiUrl: mocks.resolveBackendApiUrl,
}));

vi.mock("@/lib/http/client-ip", () => ({
  getClientIpFromNextRequest: (req: { headers: Headers }) =>
    req.headers.get("x-test-ip") || "test-ip",
}));

// Substitui o fetch global para inspecionar a chamada ao backend.
const originalFetch = global.fetch;
beforeEach(() => {
  global.fetch = mocks.fetchSpy as unknown as typeof fetch;
  mocks.fetchSpy.mockReset();
  mocks.buildInternalBackendHeaders.mockReturnValue({
    "User-Agent": "cnc-internal/1.0",
    "X-Internal-Token": "test-token-32-chars",
  });
  mocks.resolveBackendApiUrl.mockImplementation(
    (path: string) => `https://backend.example.com${path}`
  );
});

afterEach(() => {
  global.fetch = originalFetch;
  vi.clearAllMocks();
});

import { POST } from "./route";

function makeRequest(body: unknown, ip = "1.2.3.4"): Parameters<typeof POST>[0] {
  return new Request("http://localhost/api/location/resolve", {
    method: "POST",
    headers: { "content-type": "application/json", "x-test-ip": ip },
    body: typeof body === "string" ? body : JSON.stringify(body),
  }) as unknown as Parameters<typeof POST>[0];
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("BFF /api/location/resolve — validação local", () => {
  it("JSON inválido → 400 invalid_json (não chama backend)", async () => {
    const res = await POST(makeRequest("not-json{") as never);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_json");
    expect(mocks.fetchSpy).not.toHaveBeenCalled();
  });

  it("latitude fora de [-90,90] → 400 invalid_coordinates", async () => {
    const res = await POST(makeRequest({ latitude: 200, longitude: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_coordinates");
    expect(mocks.fetchSpy).not.toHaveBeenCalled();
  });

  it("longitude fora de [-180,180] → 400", async () => {
    const res = await POST(makeRequest({ latitude: 0, longitude: -999 }));
    expect(res.status).toBe(400);
  });

  it("body sem latitude → 400", async () => {
    const res = await POST(makeRequest({ longitude: -46 }));
    expect(res.status).toBe(400);
  });

  it("backend URL ausente → 503", async () => {
    mocks.resolveBackendApiUrl.mockReturnValue("");
    const res = await POST(makeRequest({ latitude: -23, longitude: -46 }));
    expect(res.status).toBe(503);
  });
});

describe("BFF /api/location/resolve — proxy ao backend", () => {
  it("envia POST para /api/internal/location/resolve com headers internos", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: null })
    );

    await POST(makeRequest({ latitude: -23.117, longitude: -46.55 }));

    expect(mocks.fetchSpy).toHaveBeenCalledTimes(1);
    const [url, init] = mocks.fetchSpy.mock.calls[0];
    expect(url).toBe("https://backend.example.com/api/internal/location/resolve");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Internal-Token"]).toBe("test-token-32-chars");
    expect(headers["User-Agent"]).toBe("cnc-internal/1.0");
    expect(headers["Content-Type"]).toBe("application/json");

    // Body propaga lat/long validados.
    const sentBody = JSON.parse(init.body as string);
    expect(sentBody).toEqual({ latitude: -23.117, longitude: -46.55 });
  });

  it("backend 400 → 400 do BFF (invalid_coordinates)", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(400, { ok: false, error: "latitude inválida" })
    );

    const res = await POST(makeRequest({ latitude: 0, longitude: 0 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBe("invalid_coordinates");
  });

  it("backend 500 → 502 backend_error", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(jsonResponse(500, {}));
    const res = await POST(makeRequest({ latitude: 0, longitude: 0 }));
    expect(res.status).toBe(502);
  });

  it("falha de rede → 502 backend_unreachable", async () => {
    mocks.fetchSpy.mockRejectedValueOnce(new Error("ECONNRESET"));
    const res = await POST(makeRequest({ latitude: 0, longitude: 0 }));
    expect(res.status).toBe(502);
  });

  it("backend data:null (fora de cobertura) → 200 data:null", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: null })
    );
    const res = await POST(makeRequest({ latitude: 0, longitude: 0 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, data: null });
  });

  it("repassa data válida do backend", async () => {
    const data = {
      city: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
      state: { code: "SP", slug: "sp" },
      region: {
        slug: "atibaia-sp",
        name: "Região de Atibaia",
        href: "/carros-usados/regiao/atibaia-sp",
      },
      confidence: "high",
      distanceKm: 3.2,
    };
    mocks.fetchSpy.mockResolvedValueOnce(jsonResponse(200, { ok: true, data }));

    const res = await POST(makeRequest({ latitude: -23.117, longitude: -46.55 }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data).toEqual(data);
  });
});

describe("BFF /api/location/resolve — segurança", () => {
  it("Cache-Control private/no-store para evitar caching de CDN", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: null })
    );
    const res = await POST(makeRequest({ latitude: -23, longitude: -46 }));
    expect(res.headers.get("Cache-Control")).toContain("private");
    expect(res.headers.get("Cache-Control")).toContain("no-store");
  });

  it("token interno NÃO aparece no body de resposta para o client", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: null })
    );
    const res = await POST(makeRequest({ latitude: -23, longitude: -46 }));
    const text = await res.text();
    expect(text).not.toContain("test-token-32-chars");
    expect(text).not.toContain("X-Internal-Token");
  });

  it("token interno NÃO aparece nos headers de resposta para o client", async () => {
    mocks.fetchSpy.mockResolvedValueOnce(
      jsonResponse(200, { ok: true, data: null })
    );
    const res = await POST(makeRequest({ latitude: -23, longitude: -46 }));
    expect(res.headers.get("X-Internal-Token")).toBeNull();
    expect(res.headers.get("Authorization")).toBeNull();
  });
});

describe("BFF /api/location/resolve — rate limit", () => {
  it("16 requests do mesmo IP em <1min → 16ª recebe 429 com Retry-After", async () => {
    // mockImplementation cria um Response novo a cada call — Response.body
    // é stream consumível, mockResolvedValue reusa o mesmo objeto e a 2ª
    // leitura quebra com "body already used".
    mocks.fetchSpy.mockImplementation(async () =>
      jsonResponse(200, { ok: true, data: null })
    );
    const ip = `192.168.1.${Math.floor(Math.random() * 200)}`;

    // 15 deve passar.
    for (let i = 0; i < 15; i++) {
      const res = await POST(makeRequest({ latitude: -23, longitude: -46 }, ip));
      expect(res.status).toBe(200);
    }

    // 16ª bate o cap.
    const res = await POST(makeRequest({ latitude: -23, longitude: -46 }, ip));
    expect(res.status).toBe(429);
    expect(Number(res.headers.get("Retry-After"))).toBeGreaterThan(0);
  });
});
