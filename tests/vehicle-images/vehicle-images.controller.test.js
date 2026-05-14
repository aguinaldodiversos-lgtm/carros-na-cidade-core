import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  readVehicleImage: vi.fn(),
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  readVehicleImage: mocks.readVehicleImage,
}));

import {
  getVehicleImageByKey,
  validateStorageKey,
} from "../../src/modules/vehicle-images/vehicle-images.controller.js";

const readVehicleImage = mocks.readVehicleImage;

const envKeys = [
  "R2_PUBLIC_BASE_URL",
  "NEXT_PUBLIC_R2_PUBLIC_BASE_URL",
  "BACKEND_IMAGE_PROXY_FALLBACK_ENABLED",
];
const snapshot = {};

function makeRes() {
  const headers = {};
  const res = {
    statusCode: 200,
    locals: {},
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
      return this;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    json(payload) {
      this.body = payload;
      headers["content-type"] = headers["content-type"] || "application/json";
      return this;
    },
    send(body) {
      this.body = body;
      return this;
    },
    redirect(code, url) {
      this.statusCode = code;
      headers.location = url;
      return this;
    },
  };
  res._headers = headers;
  return res;
}

function makeReq(query = {}) {
  return { query };
}

beforeEach(() => {
  for (const k of envKeys) {
    snapshot[k] = process.env[k];
    delete process.env[k];
  }
  readVehicleImage.mockReset();
});

afterEach(() => {
  for (const k of envKeys) {
    const v = snapshot[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("validateStorageKey", () => {
  it("aceita key válida e remove a barra inicial única", () => {
    expect(validateStorageKey("vehicles/abc/foto.webp")).toEqual({
      ok: true,
      key: "vehicles/abc/foto.webp",
    });
    expect(validateStorageKey("/vehicles/abc/foto.webp")).toEqual({
      ok: true,
      key: "vehicles/abc/foto.webp",
    });
  });

  it("rejeita ausência ou string vazia", () => {
    expect(validateStorageKey("").ok).toBe(false);
    expect(validateStorageKey(" ").ok).toBe(false);
    expect(validateStorageKey(undefined).ok).toBe(false);
    expect(validateStorageKey(null).ok).toBe(false);
    expect(validateStorageKey(123).ok).toBe(false);
  });

  it("rejeita path traversal (..)", () => {
    const result = validateStorageKey("../etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("traversal");
    expect(validateStorageKey("vehicles/../../etc").ok).toBe(false);
  });

  it("rejeita backslash (Windows ou injeção)", () => {
    expect(validateStorageKey("vehicles\\abc.webp").ok).toBe(false);
  });

  it("rejeita URLs absolutas (http, https, ftp, etc.)", () => {
    expect(validateStorageKey("https://evil.com/x").ok).toBe(false);
    expect(validateStorageKey("http://evil.com/x").ok).toBe(false);
    expect(validateStorageKey("ftp://evil.com/x").ok).toBe(false);
  });

  it("rejeita schemes data:/javascript:/file:/blob:", () => {
    expect(validateStorageKey("data:image/png;base64,xx").ok).toBe(false);
    expect(validateStorageKey("javascript:alert(1)").ok).toBe(false);
    expect(validateStorageKey("file:///etc/passwd").ok).toBe(false);
    expect(validateStorageKey("blob:abc").ok).toBe(false);
  });

  it("rejeita protocol-relative //host/...", () => {
    expect(validateStorageKey("//evil.com/x").ok).toBe(false);
  });
});

describe("getVehicleImageByKey — caminho padrão (302)", () => {
  it("com R2_PUBLIC_BASE_URL setado: 302 para CDN + Cache-Control + sem chamar R2 SDK", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "vehicles/abc/foto.webp" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res.statusCode).toBe(302);
    expect(res._headers.location).toBe("https://pub-xyz.r2.dev/vehicles/abc/foto.webp");
    expect(res._headers["cache-control"]).toContain("max-age=3600");
    expect(res._headers["x-vehicle-images-source"]).toBe("redirect-r2");
    expect(res._headers["referrer-policy"]).toBe("no-referrer");
    expect(readVehicleImage).not.toHaveBeenCalled();
  });

  it("aceita NEXT_PUBLIC_R2_PUBLIC_BASE_URL como source alternativo", async () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.example.com";
    const req = makeReq({ key: "ads/foto.jpg" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res.statusCode).toBe(302);
    expect(res._headers.location).toBe("https://cdn.example.com/ads/foto.jpg");
  });

  it("R2_PUBLIC_BASE_URL precede NEXT_PUBLIC quando ambos setados", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://server.r2.dev";
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://client.example.com";
    const req = makeReq({ key: "x.jpg" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res._headers.location).toBe("https://server.r2.dev/x.jpg");
  });

  it("trailing slash no base URL é normalizado", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev/";
    const req = makeReq({ key: "vehicles/a/b.jpg" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res._headers.location).toBe("https://pub-xyz.r2.dev/vehicles/a/b.jpg");
  });

  it("encoda cada segmento da key sem destruir as /", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com";
    const req = makeReq({ key: "vehicles/draft id 1/foto bonita.webp" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res._headers.location).toBe(
      "https://cdn.example.com/vehicles/draft%20id%201/foto%20bonita.webp"
    );
  });

  it("remove barras iniciais antes de juntar", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://cdn.example.com";
    const req = makeReq({ key: "/vehicles/a/b.jpg" });
    const res = makeRes();

    await getVehicleImageByKey(req, res, vi.fn());

    expect(res._headers.location).toBe("https://cdn.example.com/vehicles/a/b.jpg");
  });
});

describe("getVehicleImageByKey — validação", () => {
  it("retorna 400 para key vazia (sem chamar R2)", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect(readVehicleImage).not.toHaveBeenCalled();
  });

  it("retorna 400 para path traversal", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "../etc/passwd" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
    expect(res.body?.reason).toBe("traversal");
  });

  it("retorna 400 para URL absoluta na key", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "https://evil.com/poison.jpg" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
  });

  it("retorna 400 para data: URI", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "data:image/png;base64,abc" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());
    expect(res.statusCode).toBe(400);
  });

  it("400 vem com Cache-Control no-store (não cachear erro)", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());
    expect(res._headers["cache-control"]).toBe("no-store");
  });
});

describe("getVehicleImageByKey — fallback OFF (default)", () => {
  it("sem R2_PUBLIC_BASE_URL e sem fallback: 404 leve + sem chamar R2 SDK", async () => {
    const req = makeReq({ key: "vehicles/abc/foto.webp" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());

    expect(res.statusCode).toBe(404);
    expect(res._headers["cache-control"]).toContain("max-age=60");
    expect(res._headers["x-vehicle-images-source"]).toBe("no-public-base");
    expect(readVehicleImage).not.toHaveBeenCalled();
  });
});

describe("getVehicleImageByKey — fallback ON (env explícita)", () => {
  beforeEach(() => {
    process.env.BACKEND_IMAGE_PROXY_FALLBACK_ENABLED = "true";
  });

  it("sem R2_PUBLIC_BASE_URL mas com fallback ON: faz streaming via SDK", async () => {
    readVehicleImage.mockResolvedValue({
      buffer: Buffer.from([1, 2, 3]),
      contentType: "image/webp",
      contentLength: 3,
      cacheControl: "public, max-age=86400",
    });
    const req = makeReq({ key: "vehicles/abc/foto.webp" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());

    expect(readVehicleImage).toHaveBeenCalledWith("vehicles/abc/foto.webp");
    expect(res.statusCode).toBe(200);
    expect(res._headers["content-type"]).toBe("image/webp");
    expect(res._headers["x-vehicle-images-source"]).toBe("backend-stream-fallback");
  });

  it("com R2_PUBLIC_BASE_URL setado E fallback ON: AINDA prefere redirect (não streamia)", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://pub-xyz.r2.dev";
    const req = makeReq({ key: "vehicles/abc/foto.webp" });
    const res = makeRes();
    await getVehicleImageByKey(req, res, vi.fn());

    expect(res.statusCode).toBe(302);
    expect(readVehicleImage).not.toHaveBeenCalled();
  });
});
