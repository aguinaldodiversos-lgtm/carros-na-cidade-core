// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * BFF POST /api/account/sale-requests/photos.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * O QUE ESTE ARQUIVO PROTEGE
 * ────────────────────────────────────────────────────────────────────────────
 * O bug do smoke da Fase 4.1 foi o backend classificar falha de STORAGE como
 * foto inválida. A correção vive lá — mas o BFF fica no meio do caminho, e se
 * ele achatar o status (503 → 500) ou trocar a mensagem, o usuário volta a
 * receber a orientação errada com o backend já corrigido.
 *
 * Por isso os testes abaixo verificam PROPAGAÇÃO, não lógica: o BFF não decide
 * nada sobre a foto.
 */

afterEach(() => {
  vi.restoreAllMocks();
  // `vi.stubGlobal("fetch", ...)` NÃO é desfeito por `restoreAllMocks`. Sem esta
  // linha o stub sobrevive ao arquivo e vaza para o PRÓXIMO teste executado na
  // mesma worker — foi o que derrubou `upload-draft-photos-direct-r2.test.ts`
  // (que usa o S3Client de verdade) na suíte completa, enquanto ele passava
  // isolado.
  vi.unstubAllGlobals();
  vi.resetModules();
});

beforeEach(() => {
  vi.resetModules();
});

function mockAuthOk() {
  vi.doMock("@/lib/http/bff-session", () => ({
    authenticateBffRequest: async () => ({
      ok: true,
      ctx: {
        session: { accessToken: "tok", id: "7" },
        backendHeaders: { Authorization: "Bearer tok", Accept: "application/json" },
      },
    }),
    applyBffCookies: (res: unknown) => res,
  }));
}

function mockBackendUrl() {
  vi.doMock("@/lib/env/backend-api", () => ({
    resolveInternalBackendApiUrl: () => "http://backend.test/api/account/sale-requests/photos",
  }));
}

/** Request multipart com um arquivo no campo `photos`. */
function makeRequest(files: Array<{ name: string; type: string }> = [{ name: "foto.jpg", type: "image/jpeg" }]) {
  const form = new FormData();
  for (const file of files) {
    form.append("photos", new File([new Uint8Array([1, 2, 3])], file.name, { type: file.type }));
  }

  return {
    headers: new Headers(),
    formData: async () => form,
  } as unknown as import("next/server").NextRequest;
}

/** Resposta do backend, com o envelope real de erro do projeto. */
function backendResponds(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    status,
    json: async () => body,
  } as unknown as Response);
}

describe("BFF de upload — autenticação", () => {
  it("401 quando não há sessão, sem chamar o backend", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    vi.doMock("@/lib/http/bff-session", () => ({
      authenticateBffRequest: async () => ({ ok: false }),
      applyBffCookies: (res: unknown) => res,
    }));
    mockBackendUrl();

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(401);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("BFF de upload — propagação de status", () => {
  it("propaga 201 e as chaves de storage", async () => {
    mockAuthOk();
    mockBackendUrl();

    const images = [{ storage_key: "sale-requests/7/sess/2026/08/uuid-0.webp", url: "/u" }];
    vi.stubGlobal("fetch", backendResponds(201, { success: true, images }));

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({ images });
  });

  it("propaga 400 de arquivo inválido com o código intacto", async () => {
    mockAuthOk();
    mockBackendUrl();

    vi.stubGlobal(
      "fetch",
      backendResponds(400, {
        success: false,
        error: true,
        message: "Não foi possível enviar uma das fotos. Use JPG, PNG ou WebP de até 10 MB.",
        details: { code: "SALE_REQUEST_INVALID_PHOTO", field: "photos", index: 0 },
      })
    );

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      details: { code: "SALE_REQUEST_INVALID_PHOTO" },
    });
  });

  it("propaga 503 de storage — NÃO vira 400 nem 500", async () => {
    // É a regressão do smoke: se o BFF achatar este status, o usuário volta a
    // ser mandado converter uma foto que está perfeita.
    mockAuthOk();
    mockBackendUrl();

    vi.stubGlobal(
      "fetch",
      backendResponds(503, {
        success: false,
        error: true,
        message: "Não foi possível enviar a foto agora. Tente novamente em instantes.",
        details: { code: "SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE", field: "photos" },
      })
    );

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.status).toBe(503);

    const body = await response.json();
    expect(body.message).toBe(
      "Não foi possível enviar a foto agora. Tente novamente em instantes."
    );
    expect(body.details.code).toBe("SALE_REQUEST_PHOTO_STORAGE_UNAVAILABLE");

    // E nada da infraestrutura atravessou.
    const serialized = JSON.stringify(body);
    for (const leak of [/R2_/, /bucket/i, /endpoint/i, /secret/i, /access.?key/i]) {
      expect(serialized).not.toMatch(leak);
    }
  });

  it("toda resposta é privada e não cacheável", async () => {
    mockAuthOk();
    mockBackendUrl();
    vi.stubGlobal("fetch", backendResponds(503, { success: false, message: "x" }));

    const { POST } = await import("./route");
    const response = await POST(makeRequest());

    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("BFF de upload — o que ele NÃO faz", () => {
  it("não repassa Content-Type do request original", async () => {
    // O corpo é REMONTADO; anunciar o boundary antigo quebraria o parse no
    // backend. O `fetch` gera o cabeçalho a partir do FormData novo.
    mockAuthOk();
    mockBackendUrl();

    const fetchSpy = backendResponds(201, { success: true, images: [] });
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    await POST(makeRequest());

    const headers = fetchSpy.mock.calls[0][1].headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(headers["content-type"]).toBeUndefined();
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("recusa requisição sem arquivo, sem chamar o backend", async () => {
    mockAuthOk();
    mockBackendUrl();

    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await import("./route");
    const response = await POST(makeRequest([]));

    expect(response.status).toBe(400);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("descarta campos que não sejam `photos`", async () => {
    mockAuthOk();
    mockBackendUrl();

    const fetchSpy = backendResponds(201, { success: true, images: [] });
    vi.stubGlobal("fetch", fetchSpy);

    const form = new FormData();
    form.append("photos", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));
    // O destino no storage é derivado no BACKEND, de `req.user.id`. Nada que o
    // cliente mande junto pode influenciá-lo.
    form.append("owner_user_id", "999");
    form.append("storage_key", "sale-requests/999/forjada.webp");

    const request = {
      headers: new Headers(),
      formData: async () => form,
    } as unknown as import("next/server").NextRequest;

    const { POST } = await import("./route");
    await POST(request);

    const forwarded = fetchSpy.mock.calls[0][1].body as FormData;
    expect(forwarded.getAll("photos")).toHaveLength(1);
    expect(forwarded.get("owner_user_id")).toBeNull();
    expect(forwarded.get("storage_key")).toBeNull();
  });
});
