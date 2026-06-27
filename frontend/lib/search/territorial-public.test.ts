// @vitest-environment node
import { describe, expect, it } from "vitest";

import { apiRouteToPublicPath, buildEmptyTerritorialPayload } from "./territorial-public";

describe("apiRouteToPublicPath — API route → path público self", () => {
  it.each([
    ["/api/public/cities/atibaia-sp", "/cidade/atibaia-sp"],
    ["/api/public/cities/atibaia-sp/brand/fiat", "/cidade/atibaia-sp/marca/fiat"],
    [
      "/api/public/cities/atibaia-sp/brand/fiat/model/argo",
      "/cidade/atibaia-sp/marca/fiat/modelo/argo",
    ],
    ["/api/public/cities/atibaia-sp/below-fipe", "/cidade/atibaia-sp/abaixo-da-fipe"],
    ["/api/public/cities/atibaia-sp/opportunities", "/cidade/atibaia-sp/oportunidades"],
  ])("%s → %s", (route, expected) => {
    expect(apiRouteToPublicPath(route)).toBe(expected);
  });
});

describe("buildEmptyTerritorialPayload — fallback nunca indexa nem canonicaliza p/ home", () => {
  it("marca/modelo: seo = noindex,follow + canonical self (nunca '/')", () => {
    const payload = buildEmptyTerritorialPayload(
      "/api/public/cities/atibaia-sp/brand/fiat/model/argo",
      "not_found"
    );

    expect(payload.seo?.robots).toBe("noindex,follow");
    expect(payload.seo?.indexable).toBe(false);
    expect(payload.seo?.hasActiveInventory).toBe(false);
    expect(payload.seo?.activeCount).toBe(0);
    expect(payload.seo?.noindexReason).toBe("not_found");
    expect(payload.seo?.canonicalPath).toBe("/cidade/atibaia-sp/marca/fiat/modelo/argo");
    expect(payload.seo?.canonicalPath).not.toBe("/");
  });

  it("default reason é backend_unavailable", () => {
    const payload = buildEmptyTerritorialPayload("/api/public/cities/atibaia-sp/brand/fiat");
    expect(payload.seo?.noindexReason).toBe("backend_unavailable");
    expect(payload.seo?.canonicalPath).toBe("/cidade/atibaia-sp/marca/fiat");
  });

  it("sections vêm vazias (não quebra render do client)", () => {
    const payload = buildEmptyTerritorialPayload("/api/public/cities/atibaia-sp");
    expect(payload.sections?.ads).toEqual([]);
    expect(payload.city?.slug).toBe("atibaia-sp");
  });
});
