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

    // A asserção original era `sources.every(s => s.startsWith("/images/"))`.
    // Ela dizia mais do que pretendia: o objetivo é "nenhuma OUTRA rota recebe
    // cache público de 1 ano", não "só existe regra de imagem". A Fase 0.1
    // acrescentou regras de PRIVACIDADE (no-store) para os painéis, que não
    // conflitam com essa intenção. Agora afirmamos a intenção diretamente.
    const longLived = result.filter((r) =>
      r.headers.some((h) => h.key === "Cache-Control" && /max-age=31536000/.test(h.value))
    );
    expect(longLived.map((r) => r.source)).toEqual(["/images/:path*"]);
  });
});

/**
 * Fase 0.1 — áreas privadas não são conteúdo público nem cacheável.
 *
 * O robots.txt já tinha `Disallow` para os painéis, mas `Disallow` impede
 * RASTREAR, não INDEXAR — e não diz nada a proxies/caches sobre uma resposta
 * que contém dados de uma pessoa específica. Estes testes travam a política.
 */
describe("next.config.mjs — headers() das áreas privadas", () => {
  const PRIVATE_SOURCES = [
    "/dashboard",
    "/dashboard/:path*",
    "/dashboard-loja",
    "/dashboard-loja/:path*",
  ];

  it.each(PRIVATE_SOURCES)("%s recebe no-store + noindex", async (source) => {
    const result = await getHeadersFn()();
    const rule = result.find((r) => r.source === source);
    expect(rule, `regra ausente para ${source}`).toBeDefined();

    const cacheControl = rule!.headers.find((h) => h.key === "Cache-Control");
    expect(cacheControl?.value).toBe("private, no-store");

    const robots = rule!.headers.find((h) => h.key === "X-Robots-Tag");
    expect(robots?.value).toBe("noindex, nofollow, noarchive");
  });

  it("cobre a raiz do painel, não só as sub-rotas", async () => {
    // `/dashboard/:path*` sozinho dependeria do comportamento de
    // zero-ocorrências do `*` para pegar `/dashboard`. Não dependemos disso.
    const sources = (await getHeadersFn()()).map((r) => r.source);
    expect(sources).toContain("/dashboard");
    expect(sources).toContain("/dashboard-loja");
  });

  it("NENHUMA rota pública casa com os prefixos privados", async () => {
    // Guarda contra a falha catastrófica: um `source` largo demais aqui
    // desindexaria o site inteiro. A checagem é por prefixo literal, que é
    // como o path-to-regexp do Next avalia estas regras.
    const publicPaths = [
      "/",
      "/comprar",
      "/comprar/estado/sp",
      "/carros-em/atibaia-sp",
      "/carros-usados/regiao/atibaia-sp",
      "/veiculo/algum-carro-2020",
      "/lojas/alguma-loja",
      "/blog/atibaia-sp",
      "/planos",
      "/simulador-financiamento",
      "/tabela-fipe",
      "/sitemap.xml",
      "/robots.txt",
    ];

    const result = await getHeadersFn()();
    const privateRules = result.filter((r) =>
      r.headers.some((h) => h.key === "X-Robots-Tag" && h.value.includes("noindex"))
    );

    for (const path of publicPaths) {
      for (const rule of privateRules) {
        const prefix = rule.source.replace("/:path*", "");
        const matches = path === prefix || path.startsWith(`${prefix}/`);
        expect(matches, `rota pública ${path} casaria com ${rule.source}`).toBe(false);
      }
    }
  });

  it("as regras privadas não carregam cache público", async () => {
    const result = await getHeadersFn()();
    const privateRules = result.filter((r) => PRIVATE_SOURCES.includes(r.source));

    for (const rule of privateRules) {
      const cacheControl = rule.headers.find((h) => h.key === "Cache-Control");
      expect(cacheControl?.value).not.toMatch(/public|max-age=[1-9]/);
    }
  });
});
