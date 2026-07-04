import { describe, it, expect } from "vitest";

import {
  decideBlogMiddlewareAction,
  extractBlogSlug,
  isCityHubSlug,
  validateBlogPostSlug,
} from "./blog-gate";

function fakeFetch(status: number): typeof fetch {
  return (async () => new Response(null, { status })) as unknown as typeof fetch;
}

const OK_CONFIG = { apiBase: "https://backend.test", token: "internal-tok" };

describe("extractBlogSlug", () => {
  it("captura /blog/<slug> (um segmento)", () => {
    expect(extractBlogSlug("/blog/atibaia-sp")).toBe("atibaia-sp");
    expect(extractBlogSlug("/blog/melhores-suvs-2026/")).toBe("melhores-suvs-2026");
  });

  it("ignora /blog índice e sub-rotas", () => {
    expect(extractBlogSlug("/blog")).toBeNull();
    expect(extractBlogSlug("/blog/")).toBeNull();
    expect(extractBlogSlug("/blog/atibaia-sp/algum-post")).toBeNull();
    expect(extractBlogSlug("/blog/atibaia-sp/categoria/dicas")).toBeNull();
    expect(extractBlogSlug("/veiculo/x")).toBeNull();
  });
});

describe("isCityHubSlug — short-circuit sem backend", () => {
  it("true para cidade canônica com UF real", () => {
    expect(isCityHubSlug("atibaia-sp")).toBe(true);
    expect(isCityHubSlug("belo-horizonte-mg")).toBe(true);
  });

  it("false para UF inexistente ou forma que não é cidade", () => {
    expect(isCityHubSlug("cidade-falsa-xx")).toBe(false); // UF fake → checa post
    expect(isCityHubSlug("melhores-suvs-2026")).toBe(false); // termina em "26"? não é 2 letras
    expect(isCityHubSlug("guia-de-compra")).toBe(false);
  });
});

describe("validateBlogPostSlug — mapeamento de status", () => {
  it("200 → valid", async () => {
    expect((await validateBlogPostSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(200) })).kind).toBe(
      "valid"
    );
  });

  it("404 e 410 → not_found", async () => {
    expect((await validateBlogPostSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(404) })).kind).toBe(
      "not_found"
    );
    expect((await validateBlogPostSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(410) })).kind).toBe(
      "not_found"
    );
  });

  it("5xx → unavailable (fail-open)", async () => {
    expect((await validateBlogPostSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(503) })).kind).toBe(
      "unavailable"
    );
  });

  it("sem apiBase/token → unavailable (nunca bloqueia por falta de config)", async () => {
    expect((await validateBlogPostSlug("x", { token: "t", fetchImpl: fakeFetch(404) })).kind).toBe(
      "unavailable"
    );
  });
});

describe("decideBlogMiddlewareAction", () => {
  it("valid → pass-valid; not_found → block-not-found; unavailable → pass-unavailable", () => {
    expect(decideBlogMiddlewareAction({ kind: "valid" })).toEqual({ kind: "pass-valid" });
    expect(decideBlogMiddlewareAction({ kind: "not_found" })).toEqual({ kind: "block-not-found" });
    expect(
      decideBlogMiddlewareAction({ kind: "unavailable", reason: "backend-timeout" })
    ).toEqual({ kind: "pass-unavailable", reason: "backend-timeout" });
  });
});
