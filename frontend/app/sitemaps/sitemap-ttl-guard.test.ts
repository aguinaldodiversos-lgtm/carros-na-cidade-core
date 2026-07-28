/**
 * TRAVA DE REGRESSÃO — incidente 2026-07-27 (sitemaps vazios em produção).
 *
 * O que aconteceu: os route.ts repetiam um try/catch cujo `catch` — o único
 * lugar que aplicava TTL curto — era INALCANÇÁVEL, porque o cliente de sitemap
 * nunca lançava (devolvia `[]` em toda falha). Um 429 do rate limit do backend
 * virava urlset VAZIO servido com `s-maxage=3600`, congelando o sitemap errado
 * por uma hora. Nada logava, e o estado durou semanas sem ser notado.
 *
 * A ausência DESTE teste foi o que deixou o problema invisível. Ele trava a
 * bicondicional:
 *
 *     TTL longo  ⟺  ok === true && entries.length > 0
 *
 * O teste exercita os HANDLERS REAIS, não só o helper: uma rota que volte a
 * montar `NextResponse` na mão, com header fixo de 3600, falha aqui.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env/backend-api", () => ({
  resolveInternalBackendApiUrl: vi.fn((path: string) => `https://backend.test${path}`),
}));

vi.mock("@/lib/net/ssr-resilient-fetch", () => ({
  ssrResilientFetch: vi.fn(),
}));

import { ssrResilientFetch } from "@/lib/net/ssr-resilient-fetch";
import {
  SITEMAP_TTL_DEGRADED_SECONDS,
  SITEMAP_TTL_OK_SECONDS,
  shouldUseLongTtl,
  sitemapResponse,
} from "./_lib/sitemap-response";

const mockedFetch = vi.mocked(ssrResilientFetch);

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Todas as rotas de sitemap alimentadas pelo backend. */
const BACKEND_ROUTES: Array<{ name: string; load: () => Promise<{ GET: Function }> }> = [
  { name: "cities.xml", load: () => import("./cities.xml/route") },
  { name: "content.xml", load: () => import("./content.xml/route") },
  { name: "brands.xml", load: () => import("./brands.xml/route") },
  { name: "models.xml", load: () => import("./models.xml/route") },
  { name: "below-fipe.xml", load: () => import("./below-fipe.xml/route") },
  { name: "vehicles.xml", load: () => import("./vehicles.xml/route") },
];

function maxAge(res: Response): number {
  const header = res.headers.get("Cache-Control") || "";
  const match = /s-maxage=(\d+)/.exec(header);
  return match ? Number(match[1]) : -1;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
  // O cliente loga toda degradação; silenciar mantém a saída do teste legível.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("invariante de TTL do sitemap", () => {
  it("TTL longo exige sucesso E conteúdo", () => {
    const entry = { loc: "/carros-em/atibaia-sp" };
    expect(shouldUseLongTtl({ entries: [entry], ok: true })).toBe(true);
    expect(shouldUseLongTtl({ entries: [], ok: true })).toBe(false);
    expect(shouldUseLongTtl({ entries: [entry], ok: false })).toBe(false);
    expect(shouldUseLongTtl({ entries: [], ok: false })).toBe(false);
  });

  it("urlset VAZIO nunca sai com TTL longo — nem marcado como sucesso", () => {
    expect(maxAge(sitemapResponse({ entries: [], ok: true }))).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("degradado com conteúdo (último bom) também usa TTL curto", () => {
    const res = sitemapResponse({ entries: [{ loc: "/carros-em/atibaia-sp" }], ok: false });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });
});

describe.each(BACKEND_ROUTES)("$name — TTL por estado do backend", ({ load }) => {
  it("backend 429 (rate limit) → urlset vazio com TTL CURTO", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(await res.clone().text()).not.toContain("<url>");
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("backend fora (exceção de rede) → TTL CURTO", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("backend saudável mas SEM URLs → TTL CURTO (vazio nunca congela 1h)", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("backend saudável COM URLs → TTL LONGO", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [{ loc: "/carros-em/atibaia-sp", lastmod: "2026-07-27T00:00:00.000Z" }],
      })
    );
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });

    expect(await res.clone().text()).toContain("<url>");
    expect(maxAge(res)).toBe(SITEMAP_TTL_OK_SECONDS);
  });
});

describe("regiao/[state].xml", () => {
  it("UF ausente → vazio com TTL curto", async () => {
    const { GET } = await import("./regiao/[state].xml/route");
    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("backend 429 → TTL curto", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const { GET } = await import("./regiao/[state].xml/route");
    const res: Response = await GET(new Request("https://x.test"), { params: { state: "sp" } });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });
});
