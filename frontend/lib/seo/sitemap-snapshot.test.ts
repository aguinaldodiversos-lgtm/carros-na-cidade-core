// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Snapshot persistente dos sitemaps — a camada que fecha o cold start.
 *
 * ── O defeito medido em 2026-08-07 ───────────────────────────────────────────
 * Processo novo + backend já fora produzia, para cities, vehicles, brands,
 * models, blog e regional:
 *
 *     HTTP 200  +  <urlset></urlset>
 *
 * O `lastGoodByPath` em memória cobria o caso quente e nascia vazio a cada
 * boot — e deploy/restart coincidindo com backend instável é justamente o
 * cenário mais provável de acontecer junto.
 */

const redisMock = vi.hoisted(() => ({
  store: new Map<string, string>(),
  failOnGet: false,
  failOnSet: false,
  hangMs: 0,
  get: vi.fn(),
  set: vi.fn(),
  client: null as unknown,
}));

vi.mock("@/lib/redis", () => ({
  getRedisClient: () => redisMock.client,
}));

const {
  readSitemapSnapshot,
  writeSitemapSnapshot,
  snapshotKeyForPath,
  __testing,
} = await import("./sitemap-snapshot");

const PATH = "/api/public/seo/sitemap/type/city_home?limit=50000";
const ENTRIES = [{ loc: "/carros-em/atibaia-sp", lastmod: "2026-08-07T00:00:00.000Z" }];

function armarRedis() {
  redisMock.get.mockImplementation(async (key: string) => {
    if (redisMock.hangMs) await new Promise((r) => setTimeout(r, redisMock.hangMs));
    if (redisMock.failOnGet) throw new Error("ECONNREFUSED");
    return redisMock.store.get(key) ?? null;
  });
  redisMock.set.mockImplementation(async (key: string, value: string) => {
    if (redisMock.failOnSet) throw new Error("ECONNREFUSED");
    redisMock.store.set(key, value);
    return "OK";
  });
  redisMock.client = { get: redisMock.get, set: redisMock.set };
}

beforeEach(() => {
  vi.clearAllMocks();
  redisMock.store.clear();
  redisMock.failOnGet = false;
  redisMock.failOnSet = false;
  redisMock.hangMs = 0;
  armarRedis();
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("chave — namespace próprio e estável", () => {
  it("deriva do path, sem query", () => {
    expect(snapshotKeyForPath(PATH)).toBe("type-city_home");
    expect(snapshotKeyForPath("/api/public/seo/sitemap/region/SP?limit=50000")).toBe("region-sp");
    expect(snapshotKeyForPath("/api/public/seo/sitemap/vehicles?limit=50000")).toBe("vehicles");
  });

  it("o limit não muda a chave — é a mesma coleção", () => {
    expect(snapshotKeyForPath("/api/public/seo/sitemap/type/city_home?limit=10")).toBe(
      snapshotKeyForPath("/api/public/seo/sitemap/type/city_home?limit=50000")
    );
  });

  it("usa namespace `seo:sitemap:last-good:` — não colide com o cacheGet do backend", () => {
    expect(__testing.KEY_PREFIX).toBe("seo:sitemap:last-good:");
    expect(__testing.KEY_PREFIX.startsWith("public:")).toBe(false);
  });
});

describe("ciclo grava → lê", () => {
  it("grava resultado confirmado e recupera", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 1000);
    const lido = await readSitemapSnapshot(PATH, 2000);

    expect(lido.kind).toBe("hit");
    if (lido.kind === "hit") {
      expect(lido.entries).toEqual(ENTRIES);
      expect(lido.ageMs).toBe(1000);
    }
  });

  it("grava com TTL físico definido", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 1000);
    expect(redisMock.set).toHaveBeenCalledWith(
      expect.stringContaining("seo:sitemap:last-good:type-city_home"),
      expect.any(String),
      "EX",
      __testing.REDIS_TTL_SECONDS
    );
  });

  it("chaves diferentes não se misturam", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 1000);
    const outro = await readSitemapSnapshot("/api/public/seo/sitemap/vehicles?limit=1", 1000);
    expect(outro.kind).toBe("miss");
  });
});

describe("o que NUNCA vira snapshot", () => {
  /**
   * Guardar `[]` como "último estado bom" tornaria indistinguível, mais tarde,
   * "estava vazio de verdade" de "não consegui buscar". Foi essa confusão que
   * congelou o sitemap vazio por semanas em 2026-07-27.
   */
  it("resultado vazio não é gravado", async () => {
    await writeSitemapSnapshot(PATH, [], 1000);
    expect(redisMock.set).not.toHaveBeenCalled();
    expect((await readSitemapSnapshot(PATH, 1000)).kind).toBe("miss");
  });

  it("vazio NÃO sobrescreve um snapshot bom existente", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 1000);
    await writeSitemapSnapshot(PATH, [], 2000);

    const lido = await readSitemapSnapshot(PATH, 2000);
    expect(lido.kind).toBe("hit");
    if (lido.kind === "hit") expect(lido.entries).toEqual(ENTRIES);
  });

  it("payload malformado no Redis é ignorado, não interpretado", async () => {
    for (const lixo of [
      "não é json",
      JSON.stringify({ v: 999, at: 1, entries: ENTRIES }),
      JSON.stringify({ v: 1, at: "ontem", entries: ENTRIES }),
      JSON.stringify({ v: 1, at: 1, entries: "não é array" }),
      JSON.stringify({ v: 1, at: 1, entries: [{ semLoc: true }] }),
    ]) {
      redisMock.store.set(`${__testing.KEY_PREFIX}type-city_home`, lixo);
      expect((await readSitemapSnapshot(PATH, 2000)).kind, lixo.slice(0, 30)).toBe("miss");
    }
  });
});

describe("idade máxima — snapshot velho não é estado, é palpite", () => {
  it("dentro da janela → hit", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 0);
    expect((await readSitemapSnapshot(PATH, __testing.MAX_USABLE_AGE_MS - 1)).kind).toBe("hit");
  });

  it("além da janela → expired (e o caller vai para 503)", async () => {
    await writeSitemapSnapshot(PATH, ENTRIES, 0);
    expect((await readSitemapSnapshot(PATH, __testing.MAX_USABLE_AGE_MS + 1)).kind).toBe("expired");
  });

  it("a idade máxima utilizável é MENOR que o TTL físico do Redis", () => {
    // O TTL maior deixa a chave sobreviver um pouco além da validade: "existia
    // snapshot, mas velho demais" é diagnóstico diferente de "nunca houve".
    expect(__testing.MAX_USABLE_AGE_MS).toBeLessThan(__testing.REDIS_TTL_SECONDS * 1000);
  });

  it("6 horas — mais curto que as 24 h do snapshot dos gates, de propósito", () => {
    // Lá o erro é negar uma página que existe (recuperável no próximo crawl);
    // aqui é convidar o Google a rastrear URL morta.
    expect(__testing.MAX_USABLE_AGE_MS).toBe(6 * 60 * 60 * 1000);
  });
});

describe("Redis é OPCIONAL — nunca pode quebrar o sitemap", () => {
  it("sem REDIS_URL, leitura devolve unavailable sem lançar", async () => {
    redisMock.client = null;
    expect(await readSitemapSnapshot(PATH, 1000)).toEqual({
      kind: "unavailable",
      reason: "redis-nao-configurado",
    });
  });

  it("sem REDIS_URL, gravação é no-op silenciosa", async () => {
    redisMock.client = null;
    await expect(writeSitemapSnapshot(PATH, ENTRIES, 1000)).resolves.toBeUndefined();
  });

  it("Redis fora na LEITURA → unavailable, sem propagar exceção", async () => {
    redisMock.failOnGet = true;
    const lido = await readSitemapSnapshot(PATH, 1000);
    expect(lido.kind).toBe("unavailable");
  });

  it("Redis fora na GRAVAÇÃO não impede servir conteúdo fresco", async () => {
    redisMock.failOnSet = true;
    await expect(writeSitemapSnapshot(PATH, ENTRIES, 1000)).resolves.toBeUndefined();
  });

  it("Redis lento não trava o sitemap — há timeout", async () => {
    redisMock.hangMs = 5000;
    const inicio = Date.now();
    const lido = await readSitemapSnapshot(PATH, 1000);
    expect(lido.kind).toBe("unavailable");
    expect(Date.now() - inicio).toBeLessThan(4000);
  }, 10000);
});
