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

  it("sem apiBase/token → unavailable (nunca bloqueia por falta de config)", async () => {
    expect((await validateDealerSlug("x", { token: "t", fetchImpl: fakeFetch(200) })).kind).toBe(
      "unavailable"
    );
    expect(
      (await validateDealerSlug("x", { apiBase: "https://b.test", fetchImpl: fakeFetch(200) })).kind
    ).toBe("unavailable");
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

  it("unavailable → pass-unavailable (fail-open, não 503)", () => {
    expect(
      decideDealerMiddlewareAction({ kind: "unavailable", reason: "backend-timeout" })
    ).toEqual({ kind: "pass-unavailable", reason: "backend-timeout" });
  });
});
