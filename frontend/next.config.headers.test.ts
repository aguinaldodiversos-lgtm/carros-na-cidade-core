// @vitest-environment node
import { describe, expect, it } from "vitest";
// @ts-expect-error — Next.js config é .mjs sem tipos; importamos para validar shape em runtime.
import nextConfig from "./next.config.mjs";

type HeaderRule = {
  source: string;
  headers: Array<{ key: string; value: string }>;
};

describe("next.config.mjs — headers() para /images/*", () => {
  it("exporta async headers() function", () => {
    expect(typeof nextConfig.headers).toBe("function");
  });

  it("retorna cache-control immutable de 1 ano para /images/:path*", async () => {
    const result = (await nextConfig.headers()) as HeaderRule[];
    expect(Array.isArray(result)).toBe(true);

    const imagesRule = result.find((r) => r.source === "/images/:path*");
    expect(imagesRule).toBeDefined();

    const cacheControl = imagesRule!.headers.find((h) => h.key === "Cache-Control");
    expect(cacheControl).toBeDefined();
    expect(cacheControl!.value).toBe("public, max-age=31536000, immutable");
  });

  it("NÃO aplica cache long-lived a outras rotas (SSR, API, _next)", async () => {
    const result = (await nextConfig.headers()) as HeaderRule[];
    const sources = result.map((r) => r.source);
    expect(sources).not.toContain("/");
    expect(sources).not.toContain("/(.*)");
    expect(sources).not.toContain("/api/:path*");
    expect(sources).not.toContain("/_next/:path*");
    expect(sources.every((s) => s.startsWith("/images/"))).toBe(true);
  });
});
