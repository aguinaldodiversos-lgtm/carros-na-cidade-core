import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Homologação pré-lançamento — GRUPO F (FIPE), camada de ROTA.
 *
 * Motivo de existir: `lib/http/public-origin.test.ts` já prova a função
 * `buildPublicRedirectUrl` isoladamente — mas função pura verde não prova
 * ALCANCE. O defeito de produção (Location com `srv-…:10000`, que rendia
 * DNS_PROBE_FINISHED_NXDOMAIN) mora na ROTA: basta alguém trocar a chamada por
 * `new URL(target, request.url)` e o helper continua verde enquanto o portal
 * volta a quebrar. Este arquivo trava o Route Handler REAL.
 *
 * IDs cobertos:
 *   FIN-02  GET /tabela-fipe sem cookie → 307 para destino válido
 *   FIN-03  cookie de Atibaia → /tabela-fipe/atibaia-sp
 *   FIN-04  atrás de proxy (host interno srv-* + x-forwarded-host) → Location público
 *   FIN-05  host interno SEM forwarded headers → origem canônica pública
 *
 * (FIN-10 aplica as mesmas asserções a `/simulador-financiamento` — ver o
 * arquivo irmão nessa rota.)
 */

const cookieGet = vi.fn();
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: (name: string) => cookieGet(name) }),
}));

const fetchPublicCitySet = vi.fn();
const isPublicCity = vi.fn();
vi.mock("@/lib/city/public-city-set", () => ({
  fetchPublicCitySet: (...args: unknown[]) => fetchPublicCitySet(...args),
  isPublicCity: (...args: unknown[]) => isPublicCity(...args),
}));

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

/** Conjunto público com Atibaia como cidade primária. */
function citySetComAtibaia() {
  fetchPublicCitySet.mockResolvedValue({
    primaryCity: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
  });
  isPublicCity.mockImplementation((slug: string) =>
    ["atibaia-sp", "braganca-paulista-sp"].includes(String(slug))
  );
}

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

beforeEach(() => {
  cookieGet.mockReset().mockReturnValue(undefined);
  fetchPublicCitySet.mockReset();
  isPublicCity.mockReset();
  process.env.NEXT_PUBLIC_SITE_URL = "https://www.carrosnacidade.com";
});

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  vi.resetModules();
});

async function GET(request: Request) {
  const mod = await import("./route");
  return mod.GET(request);
}

describe("FIN-02 — GET /tabela-fipe sem cookie", () => {
  it("responde 307 (temporário) e não 200 nem 308", async () => {
    citySetComAtibaia();

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(res.status).toBe(307);
  });

  it("o destino é a cidade pública primária, não um slug fixo", async () => {
    citySetComAtibaia();

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/tabela-fipe/atibaia-sp");
  });

  it("sem NENHUMA cidade pública cai em /comprar — nunca inventa slug", async () => {
    fetchPublicCitySet.mockResolvedValue({ primaryCity: null });
    isPublicCity.mockReturnValue(false);

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/comprar");
  });

  it("backend indisponível (set null) também cai em /comprar, sem lançar", async () => {
    fetchPublicCitySet.mockResolvedValue(null);
    isPublicCity.mockReturnValue(false);

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/comprar");
  });
});

describe("FIN-03 — cookie de cidade", () => {
  it("cookie de Atibaia leva a /tabela-fipe/atibaia-sp", async () => {
    citySetComAtibaia();
    cookieGet.mockReturnValue({ value: JSON.stringify({ slug: "atibaia-sp" }) });

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/tabela-fipe/atibaia-sp");
  });

  it("cookie de cidade que PERDEU o estoque não é obedecido (evita 404)", async () => {
    citySetComAtibaia();
    cookieGet.mockReturnValue({ value: JSON.stringify({ slug: "sao-paulo-sp" }) });

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    const destino = new URL(res.headers.get("location")!).pathname;
    expect(destino).not.toBe("/tabela-fipe/sao-paulo-sp");
    expect(destino).toBe("/tabela-fipe/atibaia-sp");
  });

  it("cookie corrompido não quebra a rota — cai no destino padrão", async () => {
    citySetComAtibaia();
    cookieGet.mockReturnValue({ value: "{isso-nao-e-json" });

    const res = await GET(req("https://www.carrosnacidade.com/tabela-fipe"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe("/tabela-fipe/atibaia-sp");
  });
});

describe("FIN-04 — request atrás de proxy (host interno + forwarded)", () => {
  it("Location usa o host público e NUNCA contém srv-*", async () => {
    citySetComAtibaia();

    const res = await GET(
      req("http://srv-d61cc7q4d50c739s8c70:10000/tabela-fipe", {
        host: "srv-d61cc7q4d50c739s8c70:10000",
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    const location = res.headers.get("location")!;
    expect(location).not.toContain("srv-");
    expect(location).not.toContain(":10000");
    expect(location).toBe("https://www.carrosnacidade.com/tabela-fipe/atibaia-sp");
  });

  it("o esquema vem de x-forwarded-proto (https), não do http interno", async () => {
    citySetComAtibaia();

    const res = await GET(
      req("http://srv-abc:10000/tabela-fipe", {
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    expect(new URL(res.headers.get("location")!).protocol).toBe("https:");
  });
});

describe("FIN-05 — host interno SEM forwarded headers", () => {
  it("cai na origem canônica pública, não no host do contêiner", async () => {
    citySetComAtibaia();

    const res = await GET(
      req("http://srv-d61cc7q4d50c739s8c70:10000/tabela-fipe", {
        host: "srv-d61cc7q4d50c739s8c70:10000",
      })
    );

    const location = res.headers.get("location")!;
    expect(location).not.toContain("srv-");
    expect(new URL(location).host).toBe("www.carrosnacidade.com");
  });

  it("SEO-10: nenhum dos cenários acima produz Location com hostname interno", async () => {
    citySetComAtibaia();

    const cenarios = [
      req("https://www.carrosnacidade.com/tabela-fipe"),
      req("http://srv-x:10000/tabela-fipe", { host: "srv-x:10000" }),
      req("http://srv-x:10000/tabela-fipe", {
        "x-forwarded-host": "carrosnacidade.com",
        "x-forwarded-proto": "https",
      }),
      req("http://localhost:3000/tabela-fipe", { host: "localhost:3000" }),
    ];

    for (const cenario of cenarios) {
      const res = await GET(cenario);
      const location = res.headers.get("location") ?? "";
      expect(location).toMatch(/^https?:\/\//);
      expect(location).not.toMatch(/srv-|:10000/);
    }
  });
});
