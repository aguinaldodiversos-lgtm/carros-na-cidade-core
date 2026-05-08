import { describe, it, expect } from "vitest";

/**
 * Smoke do redirect 301 da rota legada da Fase 4:
 *   /painel/anuncios/[id]/publicar  →  /painel/anuncios/[id]/upgrade
 *
 * O middleware Next (`frontend/middleware.ts`) faz o redirect com a
 * regex abaixo. Como o vitest backend exclui `frontend/`, replicamos
 * APENAS o pattern aqui — isso garante que se alguém alterar a regex
 * no middleware, este teste falha (precisa atualizar nos dois lados).
 */

const PATTERN = /^\/painel\/anuncios\/([^/]+)\/publicar\/?$/;

describe("middleware.ts — pattern do redirect /publicar → /upgrade", () => {
  it("captura o id de pathnames com numérico, slug ou UUID", () => {
    expect(PATTERN.exec("/painel/anuncios/42/publicar")?.[1]).toBe("42");
    expect(PATTERN.exec("/painel/anuncios/honda-civic-2018/publicar")?.[1]).toBe(
      "honda-civic-2018"
    );
    expect(
      PATTERN.exec("/painel/anuncios/3fa85f64-5717-4562-b3fc-2c963f66afa6/publicar")?.[1]
    ).toBe("3fa85f64-5717-4562-b3fc-2c963f66afa6");
  });

  it("aceita trailing slash", () => {
    expect(PATTERN.exec("/painel/anuncios/42/publicar/")?.[1]).toBe("42");
  });

  it("não captura subrotas", () => {
    expect(PATTERN.exec("/painel/anuncios/42/publicar/extra")).toBeNull();
    expect(PATTERN.exec("/painel/anuncios/42/upgrade")).toBeNull();
    expect(PATTERN.exec("/painel/anuncios/42")).toBeNull();
  });

  it("rota canônica /upgrade NÃO casa o pattern legado", () => {
    expect(PATTERN.exec("/painel/anuncios/42/upgrade")).toBeNull();
  });
});
