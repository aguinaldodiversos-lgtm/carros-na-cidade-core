// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config.mjs";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

function getHeadersFn(): () => Promise<HeaderRule[]> {
  const fn = (nextConfig as { headers?: () => Promise<HeaderRule[]> }).headers;
  if (typeof fn !== "function") {
    throw new Error("nextConfig.headers não é uma função (config malformada).");
  }
  return fn;
}

describe("next.config.mjs — headers() para /images/*", () => {
  it("exporta async headers() function", () => {
    expect(typeof (nextConfig as { headers?: unknown }).headers).toBe("function");
  });

  it("retorna cache-control immutable de 1 ano para /images/:path*", async () => {
    const result = await getHeadersFn()();
    expect(Array.isArray(result)).toBe(true);

    const imagesRule = result.find((r) => r.source === "/images/:path*");
    expect(imagesRule).toBeDefined();

    const cacheControl = imagesRule!.headers.find((h) => h.key === "Cache-Control");
    expect(cacheControl).toBeDefined();
    expect(cacheControl!.value).toBe("public, max-age=31536000, immutable");
  });

  it("NÃO aplica cache long-lived a outras rotas (SSR, API, _next)", async () => {
    const result = await getHeadersFn()();
    const sources = result.map((r) => r.source);
    expect(sources).not.toContain("/");
    expect(sources).not.toContain("/(.*)");
    expect(sources).not.toContain("/api/:path*");
    expect(sources).not.toContain("/_next/:path*");
    expect(sources.every((s) => s.startsWith("/images/"))).toBe(true);
  });
});
