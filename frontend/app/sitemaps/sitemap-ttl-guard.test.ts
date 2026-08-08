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
    expect(shouldUseLongTtl({ entries: [entry], ok: true, source: "fresh" })).toBe(true);
    expect(shouldUseLongTtl({ entries: [], ok: true, source: "fresh" })).toBe(false);
    expect(shouldUseLongTtl({ entries: [entry], ok: false, source: "memory-stale" })).toBe(false);
    expect(shouldUseLongTtl({ entries: [], ok: false, source: "unavailable" })).toBe(false);
  });

  it("urlset VAZIO nunca sai com TTL longo — nem marcado como sucesso", () => {
    expect(maxAge(sitemapResponse({ entries: [], ok: true, source: "fresh" }))).toBe(
      SITEMAP_TTL_DEGRADED_SECONDS
    );
  });

  it("degradado com conteúdo (último bom) também usa TTL curto", () => {
    const res = sitemapResponse({
      entries: [{ loc: "/carros-em/atibaia-sp" }],
      ok: false,
      source: "memory-stale",
    });
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  /**
   * A correção da Fase 2B.1: sem estado confiável a resposta deixa de ser um
   * urlset vazio — que o Google lê como "estas URLs não existem mais" — e passa
   * a ser 503, que ele trata como transitório.
   */
  it("`unavailable` → 503, não 200 vazio", () => {
    const res = sitemapResponse({ entries: [], ok: false, source: "unavailable" });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("Content-Type")).not.toContain("xml");
  });

  it("`fresh` com zero URLs continua 200 — vazio legítimo é uma afirmação", () => {
    const res = sitemapResponse({ entries: [], ok: true, source: "fresh" });
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("xml");
  });

  it.each(["memory-stale", "redis-stale"] as const)("`%s` serve 200 com o conteúdo", (source) => {
    const res = sitemapResponse({
      entries: [{ loc: "/carros-em/atibaia-sp" }],
      ok: false,
      source,
    });
    expect(res.status).toBe(200);
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });
});

describe.each(BACKEND_ROUTES)("$name — status e TTL por estado do backend", ({ load }) => {
  /**
   * ATUALIZADO NA FASE 2B.1. Estes dois casos exigiam "200 com urlset vazio e
   * TTL curto" — o TTL curto estava certo, o 200 vazio era o defeito. Um
   * urlset vazio não é um erro que o Google ignora: é a afirmação de que
   * aquelas URLs não existem mais. Sem estado confiável, a resposta é 503.
   */
  it("backend 429 (rate limit), sem estado confiável → 503", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(await res.clone().text()).not.toContain("<urlset");
  });

  it("backend fora (exceção de rede), sem estado confiável → 503", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    expect(res.status).toBe(503);
  });

  it("backend saudável mas SEM URLs → 200 com TTL CURTO (vazio legítimo)", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const { GET } = await load();

    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    // 200: a consulta funcionou. O TTL é curto porque vazio é barato de
    // reconsultar, não porque houve falha.
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
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

describe("regiao/[state]", () => {
  // A pasta era `[state].xml` — segmento dinâmico malformado, que o Next trata
  // como literal e nunca casa. Ver `regional-route.test.ts`.
  it("UF ausente → 404 real (antes: 200 com HTML de not-found)", async () => {
    const { GET } = await import("./regiao/[state]/route");
    const res: Response = await GET(new Request("https://x.test"), { params: {} });
    expect(res.status).toBe(404);
  });

  it("backend 429 sem estado confiável → 503 (antes: 200 vazio)", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const { GET } = await import("./regiao/[state]/route");
    const res: Response = await GET(new Request("https://x.test"), {
      params: { state: "sp.xml" },
    });
    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
  });
});

/**
 * `blog.xml` era o único sitemap fora da política central: tinha `catch {
 * entries = [] }` próprio e devolvia 200 vazio com TTL de 1 HORA — congelando
 * "não há posts" pelo tempo mais longo entre todos os sitemaps.
 */
describe("blog.xml — deixou de ser caso especial", () => {
  const load = () => import("./blog.xml/route");

  it("backend fora, sem estado confiável → 503 (antes: 200 vazio por 1 h)", async () => {
    mockedFetch.mockRejectedValue(new Error("fetch failed"));
    const { GET } = await load();

    const res: Response = await GET();

    expect(res.status).toBe(503);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
  });

  it("backend 429 → 503, nunca urlset vazio com TTL longo", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(429, { error: "rate_limited" }));
    const { GET } = await load();

    const res: Response = await GET();
    expect(res.status).toBe(503);
  });

  it("payload success=false → 503, não lista vazia", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: false }));
    const { GET } = await load();

    const res: Response = await GET();
    expect(res.status).toBe(503);
  });

  it("backend OK com posts → 200 com as URLs e TTL longo", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          {
            slug: "melhores-suvs-2026",
            is_indexable: true,
            updated_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      })
    );
    const { GET } = await load();

    const res: Response = await GET();

    expect(res.status).toBe(200);
    expect(await res.clone().text()).toContain("/blog/melhores-suvs-2026");
    expect(maxAge(res)).toBe(SITEMAP_TTL_OK_SECONDS);
  });

  it("blog sem post publicado → 200 vazio LEGÍTIMO (a consulta funcionou)", async () => {
    mockedFetch.mockResolvedValue(jsonResponse(200, { success: true, data: [] }));
    const { GET } = await load();

    const res: Response = await GET();

    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("application/xml");
    expect(maxAge(res)).toBe(SITEMAP_TTL_DEGRADED_SECONDS);
  });

  it("post marcado noindex não entra no sitemap", async () => {
    mockedFetch.mockResolvedValue(
      jsonResponse(200, {
        success: true,
        data: [
          { slug: "post-publico", is_indexable: true },
          { slug: "post-oculto", is_indexable: false },
        ],
      })
    );
    const { GET } = await load();

    const body = await (await GET()).text();
    expect(body).toContain("/blog/post-publico");
    expect(body).not.toContain("/blog/post-oculto");
  });
});
