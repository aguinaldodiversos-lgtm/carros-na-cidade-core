import { describe, it, expect, vi, beforeEach, afterEach, type MockInstance } from "vitest";
import {
  extractUploadImageItemsFromResponse,
  uploadPublishPhotosToBackendR2,
} from "./upload-ad-images-backend";

const keys = ["AUTH_API_BASE_URL", "BACKEND_API_URL", "API_URL", "NEXT_PUBLIC_API_URL"] as const;

function clearBackendEnv() {
  const env = process.env as Record<string, string | undefined>;
  for (const k of keys) delete env[k];
}

describe("extractUploadImageItemsFromResponse", () => {
  it("lê data.urls (contrato Express)", () => {
    const items = extractUploadImageItemsFromResponse({
      success: true,
      data: { urls: ["https://x/a.jpg", "  "] },
    });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://x/a.jpg");
    expect(items[0].source).toBe("backend-r2");
  });

  it("aceita urls no topo (defensivo)", () => {
    const items = extractUploadImageItemsFromResponse({
      urls: ["/api/vehicle-images?key=k"],
    });
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("/api/vehicle-images?key=k");
  });

  it("retorna vazio para payload inválido", () => {
    expect(extractUploadImageItemsFromResponse(null)).toEqual([]);
    expect(extractUploadImageItemsFromResponse({ data: {} })).toEqual([]);
  });
});

describe("uploadPublishPhotosToBackendR2", () => {
  let fetchSpy: MockInstance<typeof fetch>;

  beforeEach(() => {
    clearBackendEnv();
    const env = process.env as Record<string, string | undefined>;
    env.NODE_ENV = "development";
    env.NEXT_PUBLIC_API_URL = "http://127.0.0.1:4000";
    fetchSpy = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    fetchSpy.mockRestore();
    clearBackendEnv();
  });

  it("sucesso: devolve URLs do backend", async () => {
    fetchSpy.mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: { urls: ["https://pub/1.jpg"] },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );

    const fd = new FormData();
    fd.append("photos", new File([new Uint8Array([1, 2, 3])], "a.jpg", { type: "image/jpeg" }));

    const items = await uploadPublishPhotosToBackendR2(fd, "token-test");
    expect(items).toHaveLength(1);
    expect(items[0].url).toBe("https://pub/1.jpg");
    expect(items[0].source).toBe("backend-r2");
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const call = fetchSpy.mock.calls[0];
    expect(String(call[0])).toContain("/api/ads/upload-images");
    const init = call[1] as RequestInit;
    expect(init.headers).toMatchObject({
      Authorization: "Bearer token-test",
    });
  });

  it("falha HTTP: inclui código de estado na mensagem", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ message: "Bucket indisponível" }), {
        status: 503,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("photos", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));

    await expect(uploadPublishPhotosToBackendR2(fd, "t")).rejects.toThrow(/HTTP 503/);
  });

  it("falha: resposta OK sem URLs", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: {} }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("photos", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));

    await expect(uploadPublishPhotosToBackendR2(fd, "t")).rejects.toThrow(/sem URLs/);
  });

  it("encaminha forwardHeaders (ex.: IP do cliente)", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { urls: ["https://x/1.jpg"] } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );

    const fd = new FormData();
    fd.append("photos", new File([new Uint8Array([1])], "a.jpg", { type: "image/jpeg" }));

    await uploadPublishPhotosToBackendR2(fd, "t", {
      forwardHeaders: { "X-Cnc-Client-Ip": "203.0.113.10" },
    });

    const init = fetchSpy.mock.calls[0][1] as RequestInit;
    const h = init.headers as Record<string, string>;
    expect(h["X-Cnc-Client-Ip"]).toBe("203.0.113.10");
    expect(h.Authorization).toBe("Bearer t");
  });
});
