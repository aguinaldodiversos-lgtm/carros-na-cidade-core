import { describe, it, expect } from "vitest";

import {
  decideDealerMiddlewareAction,
  extractDealerSlug,
  validateDealerSlug,
} from "./dealer-gate";

function fakeFetch(status: number): typeof fetch {
  return (async () => new Response(null, { status })) as unknown as typeof fetch;
}

const OK_CONFIG = { apiBase: "https://backend.test", token: "internal-tok" };

describe("extractDealerSlug", () => {
  it("captura /lojas/<slug>", () => {
    expect(extractDealerSlug("/lojas/auto-nova-atibaia")).toBe("auto-nova-atibaia");
    expect(extractDealerSlug("/lojas/auto-nova-atibaia/")).toBe("auto-nova-atibaia");
  });

  it("ignora rotas que não são /lojas/<slug>", () => {
    expect(extractDealerSlug("/lojas")).toBeNull();
    expect(extractDealerSlug("/lojas/")).toBeNull();
    expect(extractDealerSlug("/lojas/x/y")).toBeNull();
    expect(extractDealerSlug("/veiculo/abc")).toBeNull();
    expect(extractDealerSlug("/")).toBeNull();
  });
});

describe("validateDealerSlug — mapeamento de status", () => {
  it("200 → valid", async () => {
    const v = await validateDealerSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(200) });
    expect(v.kind).toBe("valid");
  });

  it("404 e 410 → not_found", async () => {
    expect((await validateDealerSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(404) })).kind).toBe(
      "not_found"
    );
    expect((await validateDealerSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(410) })).kind).toBe(
      "not_found"
    );
  });

  it("5xx → unavailable (fail-open)", async () => {
    const v = await validateDealerSlug("x", { ...OK_CONFIG, fetchImpl: fakeFetch(500) });
    expect(v.kind).toBe("unavailable");
  });

  it("slug vazio → not_found sem fetch", async () => {
    expect((await validateDealerSlug("   ", OK_CONFIG)).kind).toBe("not_found");
  });

  it("sem apiBase → unavailable (não há o que chamar)", async () => {
    expect((await validateDealerSlug("x", { token: "t", fetchImpl: fakeFetch(200) })).kind).toBe(
      "unavailable"
    );
  });

  // O token é bypass de rate-limit, não autorização. Exigi-lo fazia o gate se
  // recusar a tentar uma chamada que funciona — e como o Next inlina
  // `process.env` no bundle Edge em tempo de build, bastava a env faltar no
  // BUILD para o gate se desligar sozinho.
  it("sem token a chamada ACONTECE — o endpoint é público", async () => {
    const fetchImpl = fakeFetch(200);
    const res = await validateDealerSlug("x", { apiBase: "https://b.test", fetchImpl });
    expect(res.kind).toBe("valid");
  });
});

describe("decideDealerMiddlewareAction", () => {
  it("valid → pass-valid", () => {
    expect(decideDealerMiddlewareAction({ kind: "valid" })).toEqual({ kind: "pass-valid" });
  });

  it("not_found → block-not-found (404 real)", () => {
    expect(decideDealerMiddlewareAction({ kind: "not_found" })).toEqual({
      kind: "block-not-found",
    });
  });

  it("unavailable → block-unavailable (503), nunca passa", () => {
    expect(
      decideDealerMiddlewareAction({ kind: "unavailable", reason: "backend-timeout" })
    ).toEqual({ kind: "block-unavailable", reason: "backend-timeout" });
  });
});
