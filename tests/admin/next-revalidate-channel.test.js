/**
 * Fase 4.10A (correção) — canal backend → Next de invalidação de cache.
 *
 * O que precisa ser verdade:
 *   1. bloquear e reativar disparam a invalidação, SEMPRE depois do commit;
 *   2. o segredo vai no header e NUNCA em URL, corpo ou log;
 *   3. a falha do canal não desfaz o bloqueio — o banco é a fonte de verdade;
 *   4. um no-op idempotente não dispara invalidação.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const state = { adRow: null, queries: [] };

function fakeQuery(sql, params = []) {
  state.queries.push({ sql: String(sql), params });
  const text = String(sql);
  if (text.includes("FOR UPDATE")) {
    return Promise.resolve({ rows: state.adRow ? [state.adRow] : [] });
  }
  if (text.includes("UPDATE ads")) {
    const next = { ...state.adRow };
    if (text.includes("blocked_reason_code     = $3")) {
      next.status = params[1];
      next.blocked_reason_code = params[2];
      next.blocked_previous_status = params[4];
    } else {
      next.status = params[1];
      next.blocked_reason_code = null;
      next.blocked_previous_status = null;
    }
    state.adRow = next;
    return Promise.resolve({ rows: [next] });
  }
  return Promise.resolve({ rows: [] });
}

vi.mock("../../src/infrastructure/database/db.js", () => ({
  query: (sql, params) => fakeQuery(sql, params),
  pool: { query: (sql, params) => fakeQuery(sql, params) },
  withTransaction: (cb) => cb({ query: (sql, params) => fakeQuery(sql, params) }),
  default: { query: (sql, params) => fakeQuery(sql, params) },
}));

vi.mock("../../src/modules/admin/admin.audit.js", () => ({
  recordAdminAction: vi.fn(),
}));

const invalidateAdsCachesAfterMutation = vi.fn().mockResolvedValue(undefined);
vi.mock("../../src/modules/ads/ads.mutation-cache.js", () => ({
  invalidateAdsCachesAfterMutation: () => invalidateAdsCachesAfterMutation(),
}));

const { blockAd, unblockAd } = await import(
  "../../src/modules/admin/ads/admin-ad-block.service.js"
);
const { PUBLIC_ADS_CACHE_TAG, resolveFrontendBaseUrl, requestNextRevalidate } = await import(
  "../../src/shared/cache/next-revalidate.js"
);

const ORIGINAL_ENV = { ...process.env };
let fetchCalls = [];

beforeEach(() => {
  state.queries = [];
  state.adRow = {
    id: "42",
    status: "active",
    blocked_reason_code: null,
    blocked_reason: null,
    blocked_at: null,
    blocked_previous_status: null,
    blocked_by_user_id: null,
  };
  invalidateAdsCachesAfterMutation.mockClear();
  fetchCalls = [];

  process.env.FRONTEND_URL = "http://frontend.test";
  process.env.REVALIDATE_TOKEN = "s3cr3t-token";

  vi.stubGlobal("fetch", async (url, init) => {
    fetchCalls.push({ url: String(url), init });
    return { ok: true, status: 200, json: async () => ({ ok: true }) };
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  process.env = { ...ORIGINAL_ENV };
});

describe("disparo da invalidação", () => {
  it("bloquear pede revalidação da tag pública de anúncios", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("http://frontend.test/api/revalidate");
    expect(fetchCalls[0].init.method).toBe("POST");

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.tags).toContain(PUBLIC_ADS_CACHE_TAG);
  });

  it("reativar também pede revalidação", async () => {
    await blockAd("admin1", "42", { reasonCode: "invalid_photos" });
    fetchCalls = [];

    await unblockAd("admin1", "42", {});

    expect(fetchCalls).toHaveLength(1);
    const body = JSON.parse(fetchCalls[0].init.body);
    expect(body.tags).toContain(PUBLIC_ADS_CACHE_TAG);
  });

  it("reativar para 'paused' também revalida — releitura confirma que segue fora do ar", async () => {
    state.adRow.status = "paused";
    await blockAd("admin1", "42", { reasonCode: "invalid_photos" });
    fetchCalls = [];

    const result = await unblockAd("admin1", "42", {});

    expect(result.ad.status).toBe("paused");
    expect(fetchCalls).toHaveLength(1);
  });

  it("o Redis do backend é limpo ANTES de pedir a releitura ao Next", async () => {
    let redisAt = -1;
    let nextAt = -1;
    let seq = 0;
    invalidateAdsCachesAfterMutation.mockImplementation(async () => {
      redisAt = seq++;
    });
    vi.stubGlobal("fetch", async (url, init) => {
      nextAt = seq++;
      fetchCalls.push({ url: String(url), init });
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    });

    await blockAd("admin1", "42", { reasonCode: "duplicate_ad" });

    // Ordem invertida reaqueceria o Next com a resposta velha do Redis.
    expect(redisAt).toBeGreaterThanOrEqual(0);
    expect(nextAt).toBeGreaterThan(redisAt);
  });

  it("um no-op idempotente NÃO dispara invalidação", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });
    fetchCalls = [];

    const second = await blockAd("admin2", "42", { reasonCode: "duplicate_ad" });

    expect(second.changed).toBe(false);
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("segurança do canal", () => {
  it("o segredo vai no header Authorization, nunca na URL nem no corpo", async () => {
    await blockAd("admin1", "42", { reasonCode: "terms_violation" });

    const { url, init } = fetchCalls[0];
    expect(init.headers.Authorization).toBe("Bearer s3cr3t-token");
    expect(url).not.toContain("s3cr3t-token");
    expect(init.body).not.toContain("s3cr3t-token");
  });

  it("o corpo carrega só tags e paths — nada do anúncio nem do admin", async () => {
    await blockAd("admin-secreto-1", "42", {
      reasonCode: "other",
      note: "nota interna confidencial",
    });

    const body = JSON.parse(fetchCalls[0].init.body);
    expect(Object.keys(body).sort()).toEqual(["paths", "tags"]);
    const raw = fetchCalls[0].init.body;
    expect(raw).not.toContain("admin-secreto-1");
    expect(raw).not.toContain("nota interna confidencial");
  });

  it("os paths enviados são fixos — não vêm de dado do anúncio", async () => {
    await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    const body = JSON.parse(fetchCalls[0].init.body);
    // Se um dia isto passar a derivar path de slug/cidade do anúncio, a rota
    // vira um purge parametrizável por dado — este teste obriga a decisão.
    expect(body.paths).toEqual(["/", "/comprar"]);
  });
});

describe("falha do canal não desfaz o bloqueio", () => {
  it("erro de rede: o anúncio continua bloqueado", async () => {
    vi.stubGlobal("fetch", async () => {
      throw new Error("ECONNREFUSED");
    });

    const result = await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    expect(result.changed).toBe(true);
    expect(result.ad.status).toBe("blocked");
    expect(result.revalidated.ok).toBe(false);
    expect(result.revalidated.reason).toBe("network-error");
  });

  it("frontend devolve 401: o anúncio continua bloqueado", async () => {
    vi.stubGlobal("fetch", async () => ({ ok: false, status: 401, json: async () => ({}) }));

    const result = await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    expect(result.ad.status).toBe("blocked");
    expect(result.revalidated).toMatchObject({ ok: false, status: 401 });
  });

  it("sem URL de frontend configurada, o bloqueio segue válido", async () => {
    delete process.env.FRONTEND_URL;
    delete process.env.SITE_URL;
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.PUBLIC_SITE_URL;

    const result = await blockAd("admin1", "42", { reasonCode: "suspected_fraud" });

    expect(result.ad.status).toBe("blocked");
    expect(result.revalidated.reason).toBe("frontend-url-missing");
    expect(fetchCalls).toHaveLength(0);
  });
});

describe("resolveFrontendBaseUrl", () => {
  it("segue a mesma ordem de envs já usada no projeto", () => {
    expect(resolveFrontendBaseUrl({ FRONTEND_URL: "http://a" })).toBe("http://a");
    expect(resolveFrontendBaseUrl({ SITE_URL: "http://b" })).toBe("http://b");
    expect(resolveFrontendBaseUrl({ NEXT_PUBLIC_SITE_URL: "http://c" })).toBe("http://c");
    expect(resolveFrontendBaseUrl({ PUBLIC_SITE_URL: "http://d" })).toBe("http://d");
    expect(resolveFrontendBaseUrl({ FRONTEND_URL: "http://a", SITE_URL: "http://b" })).toBe(
      "http://a"
    );
  });

  it("remove barra final para não gerar // na URL", () => {
    expect(resolveFrontendBaseUrl({ FRONTEND_URL: "http://a/" })).toBe("http://a");
  });

  it("sem env nenhuma devolve vazio", () => {
    expect(resolveFrontendBaseUrl({})).toBe("");
  });
});

describe("requestNextRevalidate", () => {
  it("sem tags nem paths não faz chamada nenhuma", async () => {
    const res = await requestNextRevalidate({}, { FRONTEND_URL: "http://frontend.test" });
    expect(res).toEqual({ ok: false, reason: "nothing-to-revalidate" });
    expect(fetchCalls).toHaveLength(0);
  });

  it("funciona sem token (dev), sem enviar header Authorization vazio", async () => {
    await requestNextRevalidate({ tags: ["public-ads"] }, { FRONTEND_URL: "http://frontend.test" });
    expect(fetchCalls[0].init.headers).not.toHaveProperty("Authorization");
  });
});
