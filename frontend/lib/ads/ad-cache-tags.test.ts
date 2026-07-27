import { describe, expect, it } from "vitest";

import { adDetailTag, adDetailTagsFor } from "./ad-cache-tags";

/**
 * `revalidateTag` é SILENCIOSO: tag divergente entre leitura e escrita não
 * gera erro, só deixa o cache velho. Estes testes fixam o formato para que
 * `fetchAdDetail` (que tagueia) e o BFF (que invalida) não possam divergir.
 */

describe("adDetailTag", () => {
  it("formato estável e normalizado", () => {
    expect(adDetailTag("fiat-pulse-2024-123")).toBe("ad-detail:fiat-pulse-2024-123");
    expect(adDetailTag(105)).toBe("ad-detail:105");
  });

  it("normaliza caixa e espaços (o slug pode chegar de fontes diferentes)", () => {
    expect(adDetailTag("  Fiat-Pulse  ")).toBe(adDetailTag("fiat-pulse"));
  });

  it("devolve null para identificador vazio (não gera tag inútil)", () => {
    expect(adDetailTag("")).toBeNull();
    expect(adDetailTag("   ")).toBeNull();
    expect(adDetailTag(null)).toBeNull();
    expect(adDetailTag(undefined)).toBeNull();
  });
});

describe("adDetailTagsFor", () => {
  /**
   * O ponto central: a página pública lê por SLUG e o painel escreve por ID.
   * Invalidar só uma das chaves deixaria a página servindo payload antigo.
   */
  it("cobre id E slug", () => {
    expect(adDetailTagsFor({ id: 105, slug: "hyundai-hb20-2025-178" })).toEqual([
      "ad-detail:105",
      "ad-detail:hyundai-hb20-2025-178",
    ]);
  });

  it("descarta o que faltar, sem gerar tag vazia", () => {
    expect(adDetailTagsFor({ id: 105, slug: null })).toEqual(["ad-detail:105"]);
    expect(adDetailTagsFor({ id: null, slug: "x-1" })).toEqual(["ad-detail:x-1"]);
    expect(adDetailTagsFor({})).toEqual([]);
  });

  it("a tag da escrita bate com a da leitura para o mesmo identificador", () => {
    const slug = "hyundai-hb20-sense-plus-2025-1785114668773";
    // Leitura: fetchAdDetail(slug) → adDetailTag(slug)
    // Escrita: BFF conhece id + slug → adDetailTagsFor
    expect(adDetailTagsFor({ id: 105, slug })).toContain(adDetailTag(slug));
  });
});
