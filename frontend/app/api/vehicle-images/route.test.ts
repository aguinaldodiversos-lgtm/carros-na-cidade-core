import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readImageFromR2Direct: vi.fn(),
  getSafeUploadPath: vi.fn((src: string) => (src ? src.replace(/^\/?/, "/") : null)),
  resolveBackendApiUrl: vi.fn(() => null),
}));

vi.mock("@/lib/painel/upload-draft-photos-direct-r2", () => ({
  readImageFromR2Direct: mocks.readImageFromR2Direct,
}));

vi.mock("@/lib/vehicle/vehicle-images-src", () => ({
  getSafeUploadPath: mocks.getSafeUploadPath,
}));

vi.mock("@/lib/env/backend-api", () => ({
  resolveBackendApiUrl: mocks.resolveBackendApiUrl,
}));

import { NextRequest } from "next/server";

import { GET } from "./route";

const envKeys = [
  "R2_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
  "VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED",
  "IMAGE_PROXY_DIAGNOSTICS_ENABLED",
] as const;

const snapshot: Partial<Record<(typeof envKeys)[number], string | undefined>> = {};

function makeRequest(url: string): NextRequest {
  return new NextRequest(new URL(url));
}

beforeEach(() => {
  for (const key of envKeys) {
    snapshot[key] = process.env[key];
    delete process.env[key];
  }
  mocks.readImageFromR2Direct.mockReset();
  mocks.getSafeUploadPath.mockReset();
  mocks.getSafeUploadPath.mockImplementation((src: string) =>
    src ? src.replace(/^\/?/, "/") : null
  );
  mocks.resolveBackendApiUrl.mockReset();
  mocks.resolveBackendApiUrl.mockReturnValue(null);
});

afterEach(() => {
  for (const key of envKeys) {
    const value = snapshot[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

describe("GET /api/vehicle-images?key=...", () => {
  it("com R2_PUBLIC_BASE_URL setado: 302 redirect para URL pública direta — não streamia bytes", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";

    const res = await GET(makeRequest("http://localhost/api/vehicle-images?key=vehicles/abc/foto.webp"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp");
    expect(res.headers.get("x-vehicle-images-source")).toBe("redirect-r2");
    expect(mocks.readImageFromR2Direct).not.toHaveBeenCalled();
  });

  it("aceita NEXT_PUBLIC_R2_PUBLIC_BASE_URL como source alternativo", async () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn-public.example.com";

    const res = await GET(makeRequest("http://localhost/api/vehicle-images?key=ads/foto.jpg"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://cdn-public.example.com/ads/foto.jpg");
  });

  it("encoda corretamente segmentos com espaços/especiais", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com";

    const res = await GET(
      makeRequest("http://localhost/api/vehicle-images?key=vehicles%2Fdraft%20id%2Ffoto%20bonita.webp")
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "https://cdn.example.com/vehicles/draft%20id/foto%20bonita.webp"
    );
  });

  it("sem R2 público e SEM fallback flag: 302 para placeholder, NÃO chama R2 stream", async () => {
    const res = await GET(makeRequest("http://localhost/api/vehicle-images?key=foo/bar.jpg"));

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/images/vehicle-placeholder.svg");
    expect(res.headers.get("x-vehicle-images-source")).toBe("blocked-no-public-base");
    expect(mocks.readImageFromR2Direct).not.toHaveBeenCalled();
  });

  it("sem R2 público mas COM fallback flag: tenta R2 BFF (legado)", async () => {
    process.env.VEHICLE_IMAGE_PROXY_FALLBACK_ENABLED = "true";
    mocks.readImageFromR2Direct.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
    });

    const res = await GET(makeRequest("http://localhost/api/vehicle-images?key=foo/bar.webp"));

    expect(res.status).toBe(200);
    expect(res.headers.get("x-vehicle-images-source")).toBe("bff-direct-r2");
    expect(mocks.readImageFromR2Direct).toHaveBeenCalledWith("foo/bar.webp");
  });

  it("path traversal em ?key= retorna 400", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com";

    const res = await GET(
      makeRequest("http://localhost/api/vehicle-images?key=..%2Fetc%2Fpasswd")
    );

    expect(res.status).toBe(400);
    expect(mocks.readImageFromR2Direct).not.toHaveBeenCalled();
  });
});

describe("GET /api/vehicle-images?src=...", () => {
  it("sem fallback flag: 302 para placeholder (não tenta ler disco/backend)", async () => {
    const res = await GET(
      makeRequest("http://localhost/api/vehicle-images?src=%2Fuploads%2Fads%2Ffoto.jpg")
    );

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("/images/vehicle-placeholder.svg");
    expect(res.headers.get("x-vehicle-images-source")).toBe("blocked-fallback-off");
  });

  it("src inválido retorna 400 independentemente da flag", async () => {
    mocks.getSafeUploadPath.mockReturnValue(null);
    const res = await GET(makeRequest("http://localhost/api/vehicle-images?src=evil"));
    expect(res.status).toBe(400);
  });
});

describe("GET /api/vehicle-images (sem params)", () => {
  it("sem key e sem src: 400 (src é falsy, getSafeUploadPath retorna null)", async () => {
    mocks.getSafeUploadPath.mockReturnValue(null);
    const res = await GET(makeRequest("http://localhost/api/vehicle-images"));
    expect(res.status).toBe(400);
  });
});
