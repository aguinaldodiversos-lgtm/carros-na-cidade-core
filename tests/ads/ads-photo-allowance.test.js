import { describe, expect, it } from "vitest";
import { assertPhotoAllowance } from "../../src/modules/ads/ads.photo-allowance.js";

const photos = (n) => Array.from({ length: n }, (_, i) => `https://example.com/ads/${i}.webp`);

describe("limite de fotografias por plano — publicação e edição", () => {
  it.each([
    ["Grátis", 8],
    ["Start", 12],
    ["Pro", 15],
  ])("%s permite até %i fotos e bloqueia uma a mais", (_name, limit) => {
    expect(() => assertPhotoAllowance(photos(limit), limit)).not.toThrow();
    expect(() => assertPhotoAllowance(photos(limit + 1), limit)).toThrow(
      `Seu plano permite até ${limit} fotos por anúncio.`
    );
  });

  it("edição parcial sem imagens não altera anúncios legados", () => {
    expect(() => assertPhotoAllowance(undefined, 8)).not.toThrow();
  });

  it("configuração inválida falha de modo seguro", () => {
    expect(() => assertPhotoAllowance(photos(1), 0)).toThrow("não configurado");
    expect(() => assertPhotoAllowance(photos(1), Number.NaN)).toThrow("não configurado");
  });
});
