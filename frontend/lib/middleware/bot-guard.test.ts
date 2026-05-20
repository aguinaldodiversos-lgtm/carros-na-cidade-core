import { describe, expect, it } from "vitest";
import { decideBotGuard } from "./bot-guard";

const NORMAL_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15";
const GOOGLEBOT_UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)";

describe("decideBotGuard — bloqueia UA vazio em rotas SSR pesadas", () => {
  const HOT_PATHS = [
    "/comprar/estado/sp",
    "/comprar/cidade/atibaia-sp",
    "/carros-em/atibaia-sp",
    "/carros-baratos-em/atibaia-sp",
    "/carros-automaticos-em/atibaia-sp",
    "/carros-usados/regiao/atibaia-sp",
    "/cidade/atibaia-sp",
  ];

  for (const path of HOT_PATHS) {
    it(`UA vazio em ${path} → block-429`, () => {
      expect(decideBotGuard("", path).kind).toBe("block-429");
      expect(decideBotGuard(null, path).kind).toBe("block-429");
      expect(decideBotGuard(undefined, path).kind).toBe("block-429");
      expect(decideBotGuard("   ", path).kind).toBe("block-429"); // whitespace só
    });

    it(`Navegador normal (Mozilla...) em ${path} → pass`, () => {
      expect(decideBotGuard(NORMAL_UA, path).kind).toBe("pass");
    });

    it(`Googlebot (UA preenchido) em ${path} → pass (não bloqueia bot legítimo)`, () => {
      expect(decideBotGuard(GOOGLEBOT_UA, path).kind).toBe("pass");
    });
  }
});

describe("decideBotGuard — NÃO aplica em rotas não-hot (escopo restrito)", () => {
  const SAFE_PATHS = [
    "/",
    "/blog",
    "/blog/post-x",
    "/veiculo/honda-civic-123",
    "/anuncios",
    "/tabela-fipe",
    "/simulador-financiamento",
    "/api/ads/search",
    "/api/healthcheck",
    "/_next/static/chunks/main.js",
    "/_next/image",
    "/images/banner-home.png",
    "/favicon.ico",
    "/robots.txt",
    "/sitemap.xml",
    "/sitemaps/cities.xml",
    "/healthcheck",
  ];

  for (const path of SAFE_PATHS) {
    it(`${path} com UA vazio NÃO bloqueia (fora do escopo)`, () => {
      expect(decideBotGuard("", path).kind).toBe("pass");
      expect(decideBotGuard(null, path).kind).toBe("pass");
    });
  }
});

describe("decideBotGuard — defesas / casos limites", () => {
  it("UA com whitespace na borda é tratado como preenchido", () => {
    expect(decideBotGuard("  Mozilla/5.0  ", "/comprar/estado/sp").kind).toBe("pass");
  });

  it("UA curto mas válido (1 char) ainda passa (não validamos qualidade aqui)", () => {
    // Este é defesa de primeira linha — UA mínimo só precisa existir.
    // Detecção de bots reais é trabalho do Cloudflare/WAF.
    expect(decideBotGuard("X", "/comprar/estado/sp").kind).toBe("pass");
  });
});
