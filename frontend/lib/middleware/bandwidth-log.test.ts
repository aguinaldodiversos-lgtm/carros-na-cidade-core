import { describe, expect, it } from "vitest";
import {
  buildBandwidthLogEntry,
  classifyUserAgent,
  groupPathname,
  isBandwidthDiagnosticsEnabled,
  refererHost,
} from "./bandwidth-log";

describe("groupPathname — agrupa rota para análise", () => {
  it("rotas específicas viram grupos curtos", () => {
    expect(groupPathname("/")).toBe("/");
    expect(groupPathname("/robots.txt")).toBe("/robots.txt");
    expect(groupPathname("/favicon.ico")).toBe("/favicon.ico");
    expect(groupPathname("/healthcheck")).toBe("/healthcheck");
    expect(groupPathname("/api/healthcheck")).toBe("/healthcheck");
  });

  it("rotas territoriais com slug viram template", () => {
    expect(groupPathname("/comprar/estado/sp")).toBe("/comprar/estado/[uf]");
    expect(groupPathname("/comprar/cidade/atibaia-sp")).toBe("/comprar/cidade/[slug]");
    expect(groupPathname("/carros-em/atibaia-sp")).toBe("/carros-em/[slug]");
    expect(groupPathname("/carros-usados/regiao/atibaia-sp")).toBe("/carros-usados/regiao/[slug]");
    expect(groupPathname("/cidade/atibaia-sp")).toBe("/cidade/[slug]");
    expect(groupPathname("/veiculo/honda-civic-123")).toBe("/veiculo/[slug]");
  });

  it("assets e APIs viram grupos", () => {
    expect(groupPathname("/_next/static/chunks/main.js")).toBe("/_next/static/*");
    expect(groupPathname("/_next/image?url=x")).toBe("/_next/image");
    expect(groupPathname("/images/banner-home.png")).toBe("/images/*");
    expect(groupPathname("/api/ads/search")).toBe("/api/*");
    expect(groupPathname("/sitemaps/cities.xml")).toBe("/sitemaps/*");
  });

  it("rota desconhecida vira 'other'", () => {
    expect(groupPathname("/algo-nao-mapeado/xyz")).toBe("other");
  });
});

describe("classifyUserAgent — categoriza UA preservando privacidade", () => {
  it("navegadores reais → 'browser'", () => {
    expect(classifyUserAgent("Mozilla/5.0 ... Chrome/120")).toBe("browser");
    expect(classifyUserAgent("Mozilla/5.0 ... Firefox/130")).toBe("browser");
    expect(classifyUserAgent("Mozilla/5.0 ... Safari/605")).toBe("browser");
  });

  it("bots conhecidos → 'bot'", () => {
    expect(classifyUserAgent("Googlebot/2.1")).toBe("bot");
    expect(classifyUserAgent("Bingbot/2.0")).toBe("bot");
    expect(classifyUserAgent("DuckDuckBot")).toBe("bot");
    expect(classifyUserAgent("YandexBot")).toBe("bot");
  });

  it("ferramentas de CLI/HTTP → 'bot'", () => {
    expect(classifyUserAgent("curl/7.81.0")).toBe("bot");
    expect(classifyUserAgent("wget")).toBe("bot");
    expect(classifyUserAgent("python-requests/2.31")).toBe("bot");
    expect(classifyUserAgent("Java/17.0.1")).toBe("bot");
    expect(classifyUserAgent("Go-http-client/2.0")).toBe("bot");
    expect(classifyUserAgent("axios/1.6.0")).toBe("bot");
    expect(classifyUserAgent("node-fetch/2.6.7")).toBe("bot");
  });

  it("vazio/nulo → 'empty'", () => {
    expect(classifyUserAgent("")).toBe("empty");
    expect(classifyUserAgent(null)).toBe("empty");
    expect(classifyUserAgent(undefined)).toBe("empty");
    expect(classifyUserAgent("   ")).toBe("empty");
  });

  it("UA desconhecido → 'unknown'", () => {
    expect(classifyUserAgent("SomeRandomThing/1.0")).toBe("unknown");
  });
});

describe("refererHost — extrai só o host (sem path/query)", () => {
  it("extrai host de URL válida", () => {
    expect(refererHost("https://www.carrosnacidade.com/blog/post")).toBe("www.carrosnacidade.com");
    expect(refererHost("https://google.com/search?q=carros")).toBe("google.com");
  });

  it("URL inválida → null", () => {
    expect(refererHost("not-a-url")).toBeNull();
    expect(refererHost("")).toBeNull();
    expect(refererHost(null)).toBeNull();
    expect(refererHost(undefined)).toBeNull();
  });
});

describe("buildBandwidthLogEntry — entry sem PII", () => {
  it("monta entry com todos os campos esperados", () => {
    const entry = buildBandwidthLogEntry({
      method: "GET",
      pathname: "/carros-em/atibaia-sp",
      status: 200,
      contentType: "text/html; charset=utf-8",
      host: "www.carrosnacidade.com",
      referer: "https://google.com/search?q=carros",
      userAgent: "Mozilla/5.0 ... Chrome/120",
      cacheControl: "private, no-cache",
      durationMs: 45,
    });
    expect(entry.event).toBe("bandwidth");
    expect(entry.method).toBe("GET");
    expect(entry.pathGroup).toBe("/carros-em/[slug]");
    expect(entry.status).toBe(200);
    expect(entry.contentType).toBe("text/html; charset=utf-8");
    expect(entry.host).toBe("www.carrosnacidade.com");
    expect(entry.refererHost).toBe("google.com");
    expect(entry.uaGroup).toBe("browser");
    expect(entry.cacheControl).toBe("private, no-cache");
    expect(entry.durationMs).toBe(45);
    expect(typeof entry.timestamp).toBe("string");
  });

  it("NÃO inclui campos sensíveis (IP, cookies, referer completo, body)", () => {
    const entry = buildBandwidthLogEntry({
      method: "GET",
      pathname: "/comprar/estado/sp",
      status: 200,
      durationMs: 10,
    });
    const keys = Object.keys(entry);
    expect(keys).not.toContain("ip");
    expect(keys).not.toContain("cookie");
    expect(keys).not.toContain("authorization");
    expect(keys).not.toContain("body");
    // referer é normalizado para host apenas
    expect(keys).toContain("refererHost");
    expect(keys).not.toContain("referer");
  });

  it("usa null defensivo para campos faltantes", () => {
    const entry = buildBandwidthLogEntry({
      method: "GET",
      pathname: "/",
      status: 200,
      durationMs: 5,
    });
    expect(entry.contentType).toBeNull();
    expect(entry.host).toBeNull();
    expect(entry.refererHost).toBeNull();
    expect(entry.cacheControl).toBeNull();
    expect(entry.uaGroup).toBe("empty");
  });
});

describe("isBandwidthDiagnosticsEnabled — gate por env var", () => {
  const originalValue = process.env.BANDWIDTH_DIAGNOSTICS_ENABLED;

  it("false quando env var não setada", () => {
    delete process.env.BANDWIDTH_DIAGNOSTICS_ENABLED;
    expect(isBandwidthDiagnosticsEnabled()).toBe(false);
  });

  it("true APENAS quando BANDWIDTH_DIAGNOSTICS_ENABLED='true' (string exata)", () => {
    process.env.BANDWIDTH_DIAGNOSTICS_ENABLED = "true";
    expect(isBandwidthDiagnosticsEnabled()).toBe(true);
  });

  it("'1', 'yes', 'TRUE' NÃO ativam (case-sensitive deliberadamente)", () => {
    process.env.BANDWIDTH_DIAGNOSTICS_ENABLED = "1";
    expect(isBandwidthDiagnosticsEnabled()).toBe(false);
    process.env.BANDWIDTH_DIAGNOSTICS_ENABLED = "TRUE";
    expect(isBandwidthDiagnosticsEnabled()).toBe(false);
    process.env.BANDWIDTH_DIAGNOSTICS_ENABLED = "yes";
    expect(isBandwidthDiagnosticsEnabled()).toBe(false);
    // restore
    if (originalValue === undefined) delete process.env.BANDWIDTH_DIAGNOSTICS_ENABLED;
    else process.env.BANDWIDTH_DIAGNOSTICS_ENABLED = originalValue;
  });
});
