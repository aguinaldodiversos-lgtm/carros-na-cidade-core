/**
 * Testes HTTP de POST /api/ads/upload-images (fotos do wizard → R2 via backend).
 *
 * Cobre:
 *   • Todos os formatos de MIME aceitos pelo middleware (whitelist)
 *   • Rejeição de formatos não suportados
 *   • Autenticação obrigatória
 *   • Ausência de ficheiros multipart → 400
 *   • Contrato JSON da resposta (wizard / publicação)
 *   • Integridade dos campos passados a uploadVehicleImages
 *
 * Infra real de R2 e normalização são mockadas — validamos a camada HTTP,
 * o roteamento e o contrato entre controller e storage service.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import { readFileSync } from "node:fs";
import path from "node:path";

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------

const { uploadVehicleImagesMock } = vi.hoisted(() => ({
  uploadVehicleImagesMock: vi.fn(),
}));

vi.mock("../../src/shared/middlewares/auth.middleware.js", () => ({
  authMiddleware: vi.fn((req, _res, next) => next()),
}));

vi.mock("../../src/infrastructure/storage/r2.service.js", () => ({
  uploadVehicleImages: (...args) => uploadVehicleImagesMock(...args),
}));

// ---------------------------------------------------------------------------
// Imports after mocks
// ---------------------------------------------------------------------------

import { authMiddleware } from "../../src/shared/middlewares/auth.middleware.js";
import adsRouter from "../../src/modules/ads/ads.routes.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const GENERIC_USER = { id: "user-anuncio-generico", role: "user", plan: "free" };

function fixtureJpegPath() {
  return path.join(process.cwd(), "frontend", "e2e", "fixtures", "carro.jpg");
}

/** Minimal valid JPEG bytes (3-byte SOI + APP0-like stub). */
const MINIMAL_JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);

function buildUploadApp() {
  const app = express();

  vi.mocked(authMiddleware).mockImplementation((req, _res, next) => {
    req.user = GENERIC_USER;
    next();
  });

  app.use("/api/ads", adsRouter);

  app.use((err, _req, res, _next) => {
    const status = err.statusCode ?? err.status ?? 500;
    res.status(status).json({
      success: false,
      message: err.message ?? String(err),
    });
  });

  return app;
}

/** Factory de resposta R2 mockada para um único ficheiro. */
function mockR2Upload(overrides = {}) {
  uploadVehicleImagesMock.mockResolvedValue([
    {
      key: "vehicles/publish-user-anuncio-generico-abc/original/2026/04/uuid-foto.webp",
      publicUrl:
        "https://pub.example.r2.dev/vehicles/publish-user-anuncio-generico-abc/original/2026/04/uuid-foto.webp",
      mimeType: "image/webp",
      sizeBytes: 1024,
      sortOrder: 0,
      isCover: true,
      originalName: "foto.webp",
      ...overrides,
    },
  ]);
}

// ---------------------------------------------------------------------------
// Testes
// ---------------------------------------------------------------------------

describe("POST /api/ads/upload-images — formatos aceitos e contrato", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── Contrato básico ──────────────────────────────────────────────────────

  it("aceita JPEG (image/jpeg) e devolve contrato correto", async () => {
    const buf = readFileSync(fixtureJpegPath());
    mockR2Upload({ originalName: "carro.webp" });

    const app = buildUploadApp();
    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", buf, { filename: "carro.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.urls).toHaveLength(1);
    expect(res.body.data.keys).toHaveLength(1);

    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
    const call = uploadVehicleImagesMock.mock.calls[0][0];
    expect(call.uploadedByUserId).toBe(GENERIC_USER.id);
    expect(call.coverIndex).toBe(0);
    expect(call.vehicleId).toMatch(/^publish-user-anuncio-generico-[0-9a-f-]{36}$/i);
  });

  // ── Aliases JPEG ─────────────────────────────────────────────────────────

  it("aceita alias não canônico image/jpg (enviado por muitos browsers / Android)", async () => {
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "foto.jpg", contentType: "image/jpg" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  it("aceita alias image/x-jpg (câmeras antigas / servidores HTTP legados)", async () => {
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "foto.jpg", contentType: "image/x-jpg" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  it("aceita alias image/pjpeg (JPEG progressivo — IE legado)", async () => {
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "foto.jpg", contentType: "image/pjpeg" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  // ── PNG ──────────────────────────────────────────────────────────────────

  it("aceita PNG (image/png)", async () => {
    // Minimal 1x1 PNG (67 bytes)
    const PNG_1X1 = Buffer.from(
      "89504e470d0a1a0a0000000d49484452000000010000000108020000009001" +
        "2e00000000c49444154789c6260000000020001e221bc330000000049454e44ae426082",
      "hex"
    );
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", PNG_1X1, { filename: "foto.png", contentType: "image/png" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  // ── WebP ─────────────────────────────────────────────────────────────────

  it("aceita WebP (image/webp) — imagem já no formato de destino", async () => {
    // Minimal WebP RIFF header (12 bytes enough for multer MIME check)
    const WEBP_HEADER = Buffer.from("524946460000000057454250", "hex");
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", WEBP_HEADER, { filename: "foto.webp", contentType: "image/webp" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  // ── HEIC / HEIF (iPhone) ─────────────────────────────────────────────────

  it("aceita HEIC (image/heic) — fotos de iPhone iOS 11+", async () => {
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "IMG_0001.heic", contentType: "image/heic" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  it("aceita HEIF (image/heif) — MIME alternativo para fotos de iPhone", async () => {
    mockR2Upload();
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "IMG_0001.heif", contentType: "image/heif" });

    expect(res.status).toBe(200);
    expect(uploadVehicleImagesMock).toHaveBeenCalledTimes(1);
  });

  // ── Rejeição ─────────────────────────────────────────────────────────────

  it("rejeita formato não suportado (image/bmp) antes de chegar ao storage", async () => {
    const BMP_HEADER = Buffer.from("424d1e00000000000000", "hex");
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", BMP_HEADER, { filename: "foto.bmp", contentType: "image/bmp" });

    expect(res.status).toBe(500);
    expect(String(res.body?.message || "")).toMatch(/não suportado/i);
    expect(uploadVehicleImagesMock).not.toHaveBeenCalled();
  });

  it("rejeita PDF (application/pdf) — não é imagem", async () => {
    const PDF_HEADER = Buffer.from("%PDF-1.4");
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", PDF_HEADER, { filename: "doc.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(500);
    expect(uploadVehicleImagesMock).not.toHaveBeenCalled();
  });

  // ── Auth / multipart guard ────────────────────────────────────────────────

  it("sem ficheiros multipart retorna 400", async () => {
    const app = buildUploadApp();

    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste");

    expect(res.status).toBe(400);
    expect(String(res.body?.message || "")).toMatch(/Nenhuma imagem/i);
    expect(uploadVehicleImagesMock).not.toHaveBeenCalled();
  });

  it("sem autenticação retorna 401 e não chega ao storage", async () => {
    vi.mocked(authMiddleware).mockImplementation((_req, res) => {
      res.status(401).json({ error: "Nao autenticado" });
    });

    const app = express();
    app.use("/api/ads", adsRouter);

    const res = await request(app)
      .post("/api/ads/upload-images")
      .attach("photos", MINIMAL_JPEG, { filename: "carro.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(401);
    expect(uploadVehicleImagesMock).not.toHaveBeenCalled();
  });

  // ── Regressão: contrato retornado ao frontend ─────────────────────────────

  it("resposta contém urls e keys; URLs WebP quando normalizado", async () => {
    const webpUrl = "https://pub.r2.dev/vehicles/v1/original/2026/04/uuid.webp";
    const webpKey = "vehicles/v1/original/2026/04/uuid.webp";

    uploadVehicleImagesMock.mockResolvedValue([
      {
        key: webpKey,
        publicUrl: webpUrl,
        mimeType: "image/webp",
        sizeBytes: 4096,
        sortOrder: 0,
        isCover: true,
        originalName: "foto.webp",
      },
    ]);

    const app = buildUploadApp();
    const res = await request(app)
      .post("/api/ads/upload-images")
      .set("Authorization", "Bearer token-teste")
      .attach("photos", MINIMAL_JPEG, { filename: "carro.jpg", contentType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      success: true,
      data: { urls: [webpUrl], keys: [webpKey] },
    });
  });
});
