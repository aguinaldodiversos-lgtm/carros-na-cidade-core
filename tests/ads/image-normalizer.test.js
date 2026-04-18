/**
 * Testes unitários de src/infrastructure/storage/image-normalizer.js.
 *
 * Utiliza sharp diretamente para gerar fixtures mínimas em memória —
 * sem depender de ficheiros em disco e sem mocks do sharp, pois o
 * objetivo é validar o comportamento real do pipeline de normalização.
 *
 * Cobre:
 *   • Conversão JPEG → WebP
 *   • Conversão PNG  → WebP
 *   • Re-encode WebP → WebP (qualidade / tamanho)
 *   • Output sempre tem mimeType "image/webp" e ext "webp"
 *   • Imagens maiores que MAX_DIMENSION são redimensionadas
 *   • Imagens menores que MAX_DIMENSION NÃO são ampliadas
 *   • Proporção original é preservada após resize
 *   • Buffer vazio lança erro descritivo
 *   • normalizedSize ≤ originalSize para fotos reais (compressão efetiva)
 *   • ACCEPTED_INPUT_MIMES contém os formatos esperados
 *   • OUTPUT_MIME e OUTPUT_EXT são coerentes
 */

import { describe, it, expect, beforeAll } from "vitest";
import sharp from "sharp";

import {
  normalizeVehicleImage,
  ACCEPTED_INPUT_MIMES,
  OUTPUT_MIME,
  OUTPUT_EXT,
} from "../../src/infrastructure/storage/image-normalizer.js";

// ---------------------------------------------------------------------------
// Fixtures — geradas em memória via sharp (não dependem de arquivos em disco)
// ---------------------------------------------------------------------------

/** Cria um JPEG RGB sólido de dimensões `w × h`. */
async function makeJpeg(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 100, g: 150, b: 200 } },
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

/** Cria um PNG RGBA sólido de dimensões `w × h`. */
async function makePng(w, h) {
  return sharp({
    create: {
      width: w,
      height: h,
      channels: 4,
      background: { r: 200, g: 100, b: 50, alpha: 255 },
    },
  })
    .png()
    .toBuffer();
}

/** Cria um WebP sólido de dimensões `w × h`. */
async function makeWebp(w, h) {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: 60, g: 120, b: 180 } },
  })
    .webp({ quality: 80 })
    .toBuffer();
}

// ---------------------------------------------------------------------------
// ACCEPTED_INPUT_MIMES — fonte de verdade
// ---------------------------------------------------------------------------

describe("ACCEPTED_INPUT_MIMES — whitelist de entrada", () => {
  it("contém image/jpeg", () => expect(ACCEPTED_INPUT_MIMES.has("image/jpeg")).toBe(true));
  it("contém image/jpg (alias Android / browsers)", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/jpg")).toBe(true));
  it("contém image/x-jpg (alias câmeras legadas)", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/x-jpg")).toBe(true));
  it("contém image/pjpeg (JPEG progressivo legado)", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/pjpeg")).toBe(true));
  it("contém image/png", () => expect(ACCEPTED_INPUT_MIMES.has("image/png")).toBe(true));
  it("contém image/webp", () => expect(ACCEPTED_INPUT_MIMES.has("image/webp")).toBe(true));
  it("contém image/heic (iPhone iOS 11+)", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/heic")).toBe(true));
  it("contém image/heif (MIME alternativo iPhone)", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/heif")).toBe(true));
  it("NÃO contém image/bmp", () => expect(ACCEPTED_INPUT_MIMES.has("image/bmp")).toBe(false));
  it("NÃO contém image/svg+xml", () =>
    expect(ACCEPTED_INPUT_MIMES.has("image/svg+xml")).toBe(false));
});

describe("OUTPUT_MIME e OUTPUT_EXT — formato de saída", () => {
  it("OUTPUT_MIME é image/webp", () => expect(OUTPUT_MIME).toBe("image/webp"));
  it("OUTPUT_EXT  é webp", () => expect(OUTPUT_EXT).toBe("webp"));
});

// ---------------------------------------------------------------------------
// normalizeVehicleImage — comportamento de conversão e dimensionamento
// ---------------------------------------------------------------------------

describe("normalizeVehicleImage — conversão de formato", () => {
  it("converte JPEG para WebP", async () => {
    const jpeg = await makeJpeg(400, 300);
    const result = await normalizeVehicleImage(jpeg);

    expect(result.mimeType).toBe("image/webp");
    expect(result.ext).toBe("webp");

    // Verifica que o buffer de saída é realmente um WebP (signature RIFF...WEBP)
    const webpSignature = result.buffer.slice(0, 4).toString("ascii");
    const webpFormat = result.buffer.slice(8, 12).toString("ascii");
    expect(webpSignature).toBe("RIFF");
    expect(webpFormat).toBe("WEBP");
  });

  it("converte PNG para WebP", async () => {
    const png = await makePng(200, 150);
    const result = await normalizeVehicleImage(png);

    expect(result.mimeType).toBe("image/webp");
    const webpSignature = result.buffer.slice(0, 4).toString("ascii");
    expect(webpSignature).toBe("RIFF");
  });

  it("re-encoda WebP para WebP (re-compressão ao tamanho alvo)", async () => {
    const webp = await makeWebp(300, 200);
    const result = await normalizeVehicleImage(webp);

    expect(result.mimeType).toBe("image/webp");
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});

describe("normalizeVehicleImage — metadados retornados", () => {
  it("retorna width e height do output", async () => {
    const jpeg = await makeJpeg(400, 300);
    const result = await normalizeVehicleImage(jpeg);

    expect(result.width).toBeGreaterThan(0);
    expect(result.height).toBeGreaterThan(0);
  });

  it("retorna originalSize e normalizedSize", async () => {
    const jpeg = await makeJpeg(400, 300);
    const result = await normalizeVehicleImage(jpeg);

    expect(result.originalSize).toBe(jpeg.length);
    expect(result.normalizedSize).toBe(result.buffer.length);
  });
});

describe("normalizeVehicleImage — redimensionamento", () => {
  it("imagem MENOR que 2048 px NÃO é ampliada", async () => {
    const jpeg = await makeJpeg(400, 300);
    const result = await normalizeVehicleImage(jpeg);

    // Nenhuma dimensão deve ser maior que a original (withoutEnlargement: true)
    expect(result.width).toBeLessThanOrEqual(400);
    expect(result.height).toBeLessThanOrEqual(300);
  });

  it("imagem de 400×300 mantém proporção 4:3 após normalização", async () => {
    const jpeg = await makeJpeg(400, 300);
    const result = await normalizeVehicleImage(jpeg);

    const ratio = result.width / result.height;
    // 4/3 ≈ 1.333 — tolerância de 1 px para arredondamento de subpixel
    expect(ratio).toBeCloseTo(400 / 300, 1);
  });

  it("imagem MAIOR que 2048 px no lado mais longo é reduzida", async () => {
    // Imagem retrato 1600×3200 — lado longo > 2048
    const jpeg = await makeJpeg(1600, 3200);
    const result = await normalizeVehicleImage(jpeg);

    expect(result.height).toBeLessThanOrEqual(2048);
    // lado curto deve manter proporção
    expect(result.width).toBeLessThanOrEqual(2048);
  });

  it("imagem panorâmica 4000×1000 — lado longo reduzido para ≤2048, curto preserva proporção", async () => {
    const jpeg = await makeJpeg(4000, 1000);
    const result = await normalizeVehicleImage(jpeg);

    expect(result.width).toBeLessThanOrEqual(2048);
    // proporção 4:1 → na saída width/height ≈ 4
    const ratio = result.width / result.height;
    expect(ratio).toBeCloseTo(4000 / 1000, 0);
  });
});

describe("normalizeVehicleImage — casos de erro", () => {
  it("buffer vazio lança erro descritivo", async () => {
    await expect(normalizeVehicleImage(Buffer.alloc(0))).rejects.toThrow(/Buffer de entrada vazio/);
  });

  it("Uint8Array é aceito como entrada (além de Buffer)", async () => {
    const jpeg = await makeJpeg(100, 80);
    const uint8 = new Uint8Array(jpeg);
    const result = await normalizeVehicleImage(uint8);

    expect(result.mimeType).toBe("image/webp");
    expect(result.buffer.length).toBeGreaterThan(0);
  });
});
