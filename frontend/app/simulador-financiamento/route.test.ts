import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Homologação pré-lançamento — FIN-10.
 *
 * `/simulador-financiamento` é a rota-índice IRMÃ de `/tabela-fipe`: mesmo
 * Route Handler, mesmo `buildPublicRedirectUrl`, mesmo risco de `Location`
 * com host interno. O motivo de um arquivo próprio é que a correção das duas
 * rotas foi feita por CÓPIA — e cópia é exatamente onde uma volta a divergir
 * sem ninguém notar. Se alguém "simplificar" só esta rota para
 * `new URL(target, request.url)`, este arquivo é o único que fica vermelho.
 *
 * ID coberto:
 *   FIN-10  mesma validação de origem pública aplicada ao /simulador-financiamento
 *
 * Nota de política (não é asserção de indexabilidade): o destino
 * `/simulador-financiamento/[cidade]` é `noindex, follow` por decisão de
 * produto. Este teste não mexe nisso — só no status e no Location.
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

function citySetComAtibaia() {
  fetchPublicCitySet.mockResolvedValue({
    primaryCity: { slug: "atibaia-sp", name: "Atibaia", state: "SP" },
  });
  isPublicCity.mockImplementation((_set: unknown, slug: string) =>
    ["atibaia-sp", "braganca-paulista-sp"].includes(String(slug))
  );
}

function req(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

async function GET(request: Request) {
  const mod = await import("./route");
  return mod.GET(request);
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

describe("FIN-10 — /simulador-financiamento herda o contrato de /tabela-fipe", () => {
  it("307 para a cidade pública primária quando não há cookie", async () => {
    citySetComAtibaia();

    const res = await GET(req("https://www.carrosnacidade.com/simulador-financiamento"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/simulador-financiamento/atibaia-sp"
    );
  });

  it("cookie de Atibaia é obedecido", async () => {
    citySetComAtibaia();
    cookieGet.mockReturnValue({ value: JSON.stringify({ slug: "atibaia-sp" }) });

    const res = await GET(req("https://www.carrosnacidade.com/simulador-financiamento"));

    expect(new URL(res.headers.get("location")!).pathname).toBe(
      "/simulador-financiamento/atibaia-sp"
    );
  });

  it("atrás de proxy: Location público, jamais srv-*", async () => {
    citySetComAtibaia();

    const res = await GET(
      req("http://srv-d61cc7q4d50c739s8c70:10000/simulador-financiamento", {
        host: "srv-d61cc7q4d50c739s8c70:10000",
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    expect(res.headers.get("location")).toBe(
      "https://www.carrosnacidade.com/simulador-financiamento/atibaia-sp"
    );
  });

  it("host interno SEM forwarded → origem canônica pública", async () => {
    citySetComAtibaia();

    const res = await GET(
      req("http://srv-abc:10000/simulador-financiamento", { host: "srv-abc:10000" })
    );

    const location = res.headers.get("location")!;
    expect(location).not.toMatch(/srv-|:10000/);
    expect(new URL(location).host).toBe("www.carrosnacidade.com");
  });

  it("sem cidade pública cai em /comprar (não inventa slug de cidade)", async () => {
    fetchPublicCitySet.mockResolvedValue({ primaryCity: null });
    isPublicCity.mockReturnValue(false);

    const res = await GET(req("https://www.carrosnacidade.com/simulador-financiamento"));

    expect(new URL(res.headers.get("location")!).pathname).toBe("/comprar");
  });
});
