import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { shouldSkipNextImageOptimizer } from "./image-optimization";

describe("shouldSkipNextImageOptimizer", () => {
  let prev: string | undefined;

  beforeEach(() => {
    prev = process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    else process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = prev;
  });

  it("skip vazio/null", () => {
    expect(shouldSkipNextImageOptimizer("")).toBe(true);
  });

  it("skip data: URIs", () => {
    expect(shouldSkipNextImageOptimizer("data:image/png;base64,iVBOR...")).toBe(true);
  });

  it("skip SVGs", () => {
    expect(shouldSkipNextImageOptimizer("https://x.com/icon.svg")).toBe(true);
    expect(shouldSkipNextImageOptimizer("/images/placeholder.svg")).toBe(true);
  });

  it("skip /api/vehicle-images (caminho duplo Render→Render)", () => {
    expect(shouldSkipNextImageOptimizer("/api/vehicle-images?key=foo/bar.jpg")).toBe(true);
    expect(shouldSkipNextImageOptimizer("/api/vehicle-images?src=%2Fuploads%2Ffoo.jpg")).toBe(true);
  });

  it("skip /uploads/", () => {
    expect(shouldSkipNextImageOptimizer("/uploads/ad-123.jpg")).toBe(true);
  });

  it("skip /_next/image (idempotência)", () => {
    expect(shouldSkipNextImageOptimizer("/_next/image?url=x")).toBe(true);
  });

  it("skip /images/ (assets locais já servidos pelo Next static)", () => {
    expect(shouldSkipNextImageOptimizer("/images/hero.jpg")).toBe(true);
  });

  it("skip host R2 público quando NEXT_PUBLIC_R2_PUBLIC_BASE_URL setado", () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://cdn.carrosnacidade.com";
    expect(
      shouldSkipNextImageOptimizer("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp")
    ).toBe(true);
  });

  it("R2 público ignora case do host", () => {
    process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL = "https://CDN.CARROSNACIDADE.com";
    expect(shouldSkipNextImageOptimizer("https://cdn.carrosnacidade.com/x.webp")).toBe(true);
  });

  it("NÃO skip host R2 quando não configurado", () => {
    expect(
      shouldSkipNextImageOptimizer("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp")
    ).toBe(false);
  });

  it("skip qualquer *.onrender.com", () => {
    expect(
      shouldSkipNextImageOptimizer("https://carros-na-cidade-core.onrender.com/uploads/foo.jpg")
    ).toBe(true);
    expect(shouldSkipNextImageOptimizer("https://outroservico.onrender.com/x.jpg")).toBe(true);
  });

  it("NÃO skip URLs externas legítimas (Unsplash, CDN público alheio)", () => {
    expect(shouldSkipNextImageOptimizer("https://images.unsplash.com/photo-x.jpg")).toBe(false);
    expect(shouldSkipNextImageOptimizer("https://cdn.example.com/x.webp")).toBe(false);
  });

  it("skip qualquer *.r2.dev (Cloudflare R2 público) MESMO SEM NEXT_PUBLIC_R2_PUBLIC_BASE_URL", () => {
    // Caso exato do incidente da 2ª iteração: o env não estava setado e
    // imagens viravam /_next/image?url=https%3A%2F%2Fpub-...r2.dev.
    expect(
      shouldSkipNextImageOptimizer(
        "https://pub-662ff7f9e6a946168e27ca660899bc3f.r2.dev/vehicles/abc/foto.webp"
      )
    ).toBe(true);
    expect(shouldSkipNextImageOptimizer("https://anything.r2.dev/x.jpg")).toBe(true);
  });

  it("skip endpoint interno do R2 (*.r2.cloudflarestorage.com)", () => {
    expect(
      shouldSkipNextImageOptimizer("https://accountid.r2.cloudflarestorage.com/bucket/x.jpg")
    ).toBe(true);
  });

  it(".r2.dev case-insensitive", () => {
    expect(shouldSkipNextImageOptimizer("https://Pub-ABC.R2.DEV/x.webp")).toBe(true);
  });

  it("URLs http inválidas tratadas como skip (não otimiza lixo)", () => {
    expect(shouldSkipNextImageOptimizer("http://[invalid")).toBe(true);
  });

  it("paths relativos não-imagem (sem barra inicial) — não skip", () => {
    expect(shouldSkipNextImageOptimizer("foo/bar.jpg")).toBe(false);
  });
});
