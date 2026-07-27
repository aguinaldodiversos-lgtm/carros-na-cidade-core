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

  /**
   * CONTRATO INVERTIDO EM 2026-07-26 — de propósito.
   *
   * Este teste assertava `false`: sem `NEXT_PUBLIC_R2_PUBLIC_BASE_URL`, uma
   * imagem no NOSSO próprio subdomínio de CDN seria roteada pelo
   * `/_next/image`. Isso não era um contrato a preservar, era o buraco
   * documentado no cabeçalho do módulo — o Render baixando a imagem de uma
   * origem nossa para servir variantes, o caminho duplo que estourou o
   * outbound bandwidth em 2026-05-13, dependendo de uma env estar presente
   * no build para não acontecer.
   *
   * Com `SELF_DOMAIN_SUFFIXES`, domínio nosso pula o otimizador sempre,
   * setada ou não a env.
   */
  it("skip host de CDN próprio MESMO sem NEXT_PUBLIC_R2_PUBLIC_BASE_URL", () => {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    expect(
      shouldSkipNextImageOptimizer("https://cdn.carrosnacidade.com/vehicles/abc/foto.webp")
    ).toBe(true);
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

  it("skip domínio próprio na frente do R2 (img.carrosnacidade.com) SEM env", () => {
    // Migração 2026-07-26: as fotos saíram do `pub-*.r2.dev` (endpoint de
    // desenvolvimento, limitado por taxa) para domínio próprio. O host novo
    // não casa `.r2.dev` nem `.onrender.com`; sem a regra de domínio próprio
    // ele voltaria a passar pelo otimizador do Render — o caminho duplo do
    // incidente de banda de 2026-05-13 — e, como não estava em
    // remotePatterns, daria 400.
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    expect(
      shouldSkipNextImageOptimizer(
        "https://img.carrosnacidade.com/vehicles/publish-122-abc/original/2026/07/foto.webp"
      )
    ).toBe(true);
  });

  it("skip qualquer subdomínio nosso, case-insensitive", () => {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    expect(shouldSkipNextImageOptimizer("https://IMG.CarrosNaCidade.com/x.webp")).toBe(true);
    expect(shouldSkipNextImageOptimizer("https://www.carrosnacidade.com/images/banner.png")).toBe(
      true
    );
  });

  it("domínio parecido NÃO é confundido com o nosso (defesa de sufixo)", () => {
    delete process.env.NEXT_PUBLIC_R2_PUBLIC_BASE_URL;
    expect(shouldSkipNextImageOptimizer("https://carrosnacidade.com.br/x.webp")).toBe(false);
    expect(shouldSkipNextImageOptimizer("https://fakecarrosnacidade.com/x.webp")).toBe(false);
  });

  it("URLs http inválidas tratadas como skip (não otimiza lixo)", () => {
    expect(shouldSkipNextImageOptimizer("http://[invalid")).toBe(true);
  });

  it("paths relativos não-imagem (sem barra inicial) — não skip", () => {
    expect(shouldSkipNextImageOptimizer("foo/bar.jpg")).toBe(false);
  });
});
