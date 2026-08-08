// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * `/sitemaps/regiao/[uf].xml` — o sitemap regional voltou a ser XML.
 *
 * ── O bug ────────────────────────────────────────────────────────────────────
 * A pasta se chamava `[state].xml`. No App Router, segmento dinâmico é a pasta
 * INTEIRA entre colchetes; `[state].xml` não fecha em `]`, então virava pasta
 * literal e a rota nunca casava. A requisição caía em `app/[uf]/regiao/
 * [ancora]` (uf="sitemaps", ancora="sp.xml"), que chama `notFound()` — e no
 * Next 14.2 isso comita HTTP 200 com HTML de not-found. O sitemap index
 * apontava para uma URL que devolvia página de erro em `text/html`.
 *
 * O primeiro teste abaixo é de ESTRUTURA DE ARQUIVO de propósito: a decisão que
 * quebrou não estava no código do handler — estava no nome da pasta, onde
 * nenhum teste de comportamento olhava.
 */

const SITEMAPS_DIR = join(process.cwd(), "app", "sitemaps", "regiao");

describe("estrutura da rota", () => {
  it("o segmento dinâmico é uma pasta [state] válida, não [state].xml", () => {
    const entradas = readdirSync(SITEMAPS_DIR);

    expect(entradas).toContain("[state]");
    expect(entradas).not.toContain("[state].xml");
    expect(existsSync(join(SITEMAPS_DIR, "[state]", "route.ts"))).toBe(true);
  });

  it("não sobrou nenhuma pasta com segmento dinâmico malformado em app/sitemaps", () => {
    // `[x].xml`, `pre[x]`, `[x]sufixo` — todos são tratados como literais pelo
    // Next e produzem rota que nunca casa.
    for (const entrada of readdirSync(SITEMAPS_DIR)) {
      if (!entrada.includes("[")) continue;
      expect(entrada, `segmento dinâmico malformado: ${entrada}`).toMatch(/^\[[^[\]]+\]$/);
    }
  });
});

const fetchRegionMock = vi.fn();

vi.mock("../../lib/seo/sitemap-client", () => ({
  fetchPublicSitemapByRegion: (...args: unknown[]) => fetchRegionMock(...args),
}));

beforeEach(() => {
  fetchRegionMock.mockReset();
  fetchRegionMock.mockResolvedValue({
    entries: [{ loc: "/carros-em/atibaia-sp", changefreq: "daily", priority: 0.8 }],
    ok: true,
  });
});

afterEach(() => {
  vi.resetModules();
});

async function get(state: string | undefined) {
  const { GET } = await import("./regiao/[state]/route");
  return GET(new Request("https://carrosnacidade.com/sitemaps/regiao/sp.xml"), {
    params: { state },
  });
}

describe("resposta para UF válida", () => {
  it("200 com content-type XML — nunca text/html", async () => {
    const res = await get("sp.xml");

    expect(res.status).toBe(200);
    const contentType = res.headers.get("Content-Type") ?? "";
    expect(contentType).toMatch(/(application|text)\/xml/);
    expect(contentType).not.toContain("text/html");
  });

  it("o corpo é um urlset XML válido, não HTML de not-found", async () => {
    const body = await (await get("sp.xml")).text();

    expect(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(body).toContain("<urlset");
    expect(body).toContain("</urlset>");
    expect(body).not.toContain("<html");
    expect(body).not.toContain("not-found");
  });

  it("remove o sufixo .xml e normaliza a UF antes de consultar o backend", async () => {
    await get("sp.xml");
    expect(fetchRegionMock).toHaveBeenCalledWith("SP", 50000);

    fetchRegionMock.mockClear();
    await get("mg");
    expect(fetchRegionMock).toHaveBeenCalledWith("MG", 50000);
  });

  // Segunda UF: um estado fixo passaria no caso acima e falharia aqui.
  it("cada UF consulta o próprio recorte", async () => {
    await get("pr.xml");
    expect(fetchRegionMock).toHaveBeenCalledWith("PR", 50000);
    expect(fetchRegionMock).not.toHaveBeenCalledWith("SP", 50000);
  });

  it("UF sem conteúdo devolve urlset vazio válido (não HTML, não 404)", async () => {
    fetchRegionMock.mockResolvedValue({ entries: [], ok: true });
    const res = await get("ac.xml");

    expect(res.status).toBe(200);
    expect(await res.text()).toContain("<urlset");
  });
});

describe("estado inválido — nunca soft 404 em HTML", () => {
  it.each(["zz.xml", "xx", "sitemaps", "sp.json", "", undefined])(
    "%s → 404 real, sem XML e sem HTML",
    async (state) => {
      const res = await get(state as string);

      expect(res.status).toBe(404);
      expect(res.headers.get("Content-Type") ?? "").toContain("text/plain");
      expect(fetchRegionMock).not.toHaveBeenCalled();
    }
  );
});
