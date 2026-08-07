/**
 * `/comprar/cidade/[slug]` — contrato de ALIAS.
 *
 * ── História desta suíte ─────────────────────────────────────────────────────
 * Ela travava um gate de INDEXAÇÃO: a rota era a única da família territorial
 * sem gate de estoque no robots (auditoria 2026-07-28) e, somada ao fallback
 * territorial, virou doorway page — milhares de cidades servindo o estoque de
 * outra, cada uma se declarando local.
 *
 * O gate consertou o sintoma. A causa era a rota existir como segunda página
 * indexável do mesmo recurso. Agora ela só redireciona (308 → `/carros-em/
 * [slug]`), então não há mais "quando indexar": a resposta é NUNCA. É isto que
 * esta suíte trava — junto do invariante de que o slug pedido é o slug
 * entregue, e de que cidade inexistente continua 404 em vez de virar redirect.
 *
 * O 308 HTTP real é emitido pelo middleware; a decisão pura está coberta em
 * `lib/middleware/canonical-redirects.test.ts`. Aqui é a defesa em profundidade
 * da própria rota.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

// `vi.hoisted` porque `vi.mock` sobe para o topo do arquivo: mocks declarados
// como const normal ainda não existem quando a factory roda.
const { notFoundMock, permanentRedirectMock } = vi.hoisted(() => ({
  notFoundMock: vi.fn(() => {
    const error = new Error("NEXT_NOT_FOUND");
    (error as { digest?: string }).digest = "NEXT_NOT_FOUND";
    throw error;
  }),
  permanentRedirectMock: vi.fn((path: string) => {
    const error = new Error(`NEXT_REDIRECT:${path}`);
    (error as { digest?: string }).digest = `NEXT_REDIRECT;replace;${path};308`;
    throw error;
  }),
}));

vi.mock("next/navigation", () => ({
  notFound: notFoundMock,
  permanentRedirect: permanentRedirectMock,
}));

import ComprarCidadeLegacyRedirect, { generateMetadata } from "./page";

const CIDADE_A = "atibaia-sp";
const CIDADE_B = "braganca-paulista-sp";

beforeEach(() => {
  notFoundMock.mockClear();
  permanentRedirectMock.mockClear();
});

describe("metadata — a rota nunca é indexável", () => {
  it("emite noindex mesmo com a URL limpa", async () => {
    const meta = await generateMetadata({ params: { slug: CIDADE_A }, searchParams: {} });
    expect(meta.robots).toMatchObject({ index: false, follow: true });
  });

  it("canonicaliza para a irmã canônica, preservando a cidade", async () => {
    expect(
      (await generateMetadata({ params: { slug: CIDADE_A }, searchParams: {} })).alternates
        ?.canonical
    ).toBe("/carros-em/atibaia-sp");

    expect(
      (await generateMetadata({ params: { slug: CIDADE_B }, searchParams: {} })).alternates
        ?.canonical
    ).toBe("/carros-em/braganca-paulista-sp");
  });

  it("cidade inexistente → 404, nunca metadata de cidade", async () => {
    await expect(
      generateMetadata({ params: { slug: "xpto-zz" }, searchParams: {} })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(notFoundMock).toHaveBeenCalled();
  });
});

describe("redirect — destino final, sem cadeia e sem cidade fixa", () => {
  it.each([
    [CIDADE_A, "/carros-em/atibaia-sp"],
    [CIDADE_B, "/carros-em/braganca-paulista-sp"],
    ["curitiba-pr", "/carros-em/curitiba-pr"],
  ])("%s → %s", async (slug, esperado) => {
    await expect(
      ComprarCidadeLegacyRedirect({ params: { slug }, searchParams: {} })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock).toHaveBeenCalledWith(esperado);
  });

  it("descarta sort=relevance e page=1 no destino", async () => {
    await expect(
      ComprarCidadeLegacyRedirect({
        params: { slug: CIDADE_A },
        searchParams: { sort: "relevance", page: "1" },
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock).toHaveBeenCalledWith("/carros-em/atibaia-sp");
  });

  it("preserva filtro real do usuário", async () => {
    await expect(
      ComprarCidadeLegacyRedirect({
        params: { slug: CIDADE_B },
        searchParams: { brand: "Honda" },
      })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(permanentRedirectMock).toHaveBeenCalledWith(
      "/carros-em/braganca-paulista-sp?brand=Honda"
    );
  });

  it("o destino nunca passa por /comprar (sem cadeia de redirects)", async () => {
    await expect(
      ComprarCidadeLegacyRedirect({ params: { slug: CIDADE_A }, searchParams: {} })
    ).rejects.toThrow(/NEXT_REDIRECT/);
    expect(String(permanentRedirectMock.mock.calls[0][0])).not.toContain("/comprar");
  });

  it("cidade inexistente → 404, jamais redirect para outra cidade", async () => {
    await expect(
      ComprarCidadeLegacyRedirect({ params: { slug: "cidade-falsa-xx" }, searchParams: {} })
    ).rejects.toThrow(/NEXT_NOT_FOUND/);
    expect(permanentRedirectMock).not.toHaveBeenCalled();
  });
});
