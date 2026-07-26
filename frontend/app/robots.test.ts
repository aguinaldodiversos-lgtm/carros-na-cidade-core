import { describe, expect, it } from "vitest";

import robots from "./robots";

/**
 * Guardas do robots.txt.
 *
 * Este arquivo não tinha teste. É o único do projeto onde um erro de uma
 * linha (`Disallow: /`) desindexa o site inteiro, e ele acabou de ser
 * editado — a hora de plantar a rede é agora.
 *
 * Os testes checam INVARIANTES (o que nunca pode acontecer) e não a lista
 * literal: uma rota nova legítima não deve quebrar a suíte, mas bloquear a
 * vitrine ou perder o Sitemap deve.
 */

function regra() {
  const out = robots();
  const rules = Array.isArray(out.rules) ? out.rules : [out.rules];
  return rules[0];
}

function asArray(v: undefined | string | string[]): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

/** Veredito por prefixo, regra mais longa vence; empate favorece Allow (RFC 9309). */
function permitido(path: string): boolean {
  const r = regra();
  const allows = asArray(r.allow);
  const disallows = asArray(r.disallow);
  const bestAllow = Math.max(-1, ...allows.filter((p) => path.startsWith(p)).map((p) => p.length));
  const bestDis = Math.max(-1, ...disallows.filter((p) => path.startsWith(p)).map((p) => p.length));
  if (bestDis === -1) return true;
  if (bestAllow === -1) return false;
  return bestAllow >= bestDis;
}

describe("robots.txt — invariantes que não podem quebrar", () => {
  it("NUNCA emite Disallow: / (desindexaria o site inteiro)", () => {
    const disallows = asArray(regra().disallow);
    expect(disallows).not.toContain("/");
    // Nem via string vazia, que alguns parsers tratam como raiz.
    for (const d of disallows) {
      expect(d.trim(), "Disallow vazio equivale a liberar tudo — ou a nada; nunca use").not.toBe(
        ""
      );
    }
  });

  it("as superfícies públicas continuam rastreáveis", () => {
    const publicas = [
      "/",
      "/comprar",
      "/comprar/cidade/atibaia-sp",
      "/carros-em/atibaia-sp",
      "/cidade/atibaia-sp",
      "/cidade/atibaia-sp/marca/chevrolet",
      "/veiculo/fiat-pulse-drive-2024-123",
      "/anuncios",
      "/blog/algum-post",
      "/tabela-fipe/atibaia-sp",
      "/planos",
      "/sitemap.xml",
      "/sitemaps/vehicles.xml",
    ];
    for (const p of publicas) {
      expect(permitido(p), `rota pública bloqueada no robots: ${p}`).toBe(true);
    }
  });

  it("as áreas privadas continuam bloqueadas", () => {
    const privadas = [
      "/api/",
      "/api/ads/search",
      "/dashboard",
      "/dashboard/anuncios",
      "/dashboard-loja",
      "/dashboard-loja/dados",
      "/login",
      "/login?next=/painel",
      "/pagamento",
      "/impulsionar/42",
    ];
    for (const p of privadas) {
      expect(permitido(p), `rota privada NÃO bloqueada no robots: ${p}`).toBe(false);
    }
  });

  it("mantém os Disallow exigidos", () => {
    const disallows = asArray(regra().disallow);
    for (const d of [
      "/api/",
      "/dashboard",
      "/dashboard-loja",
      "/login",
      "/pagamento",
      "/impulsionar",
    ]) {
      expect(disallows, `Disallow removido: ${d}`).toContain(d);
    }
  });

  it("emite Sitemap absoluto e único", () => {
    const out = robots();
    const sitemaps = asArray(out.sitemap);
    expect(sitemaps).toHaveLength(1);
    expect(sitemaps[0]).toMatch(/^https:\/\/[^/]+\/sitemap\.xml$/);
  });

  /**
   * O host do `Sitemap:` vem de `NEXT_PUBLIC_SITE_URL`, não é cravado. Em dev,
   * sem a env, `getSiteUrl()` cai no apex — o que faz o robots.txt local
   * mostrar `https://carrosnacidade.com/sitemap.xml`. Em produção a env está
   * como `https://www.carrosnacidade.com` e sai o www. Este teste fixa esse
   * contrato para ninguém confundir o apex do dev com uma regressão.
   */
  it("Sitemap segue NEXT_PUBLIC_SITE_URL (www em produção)", () => {
    const prev = process.env.NEXT_PUBLIC_SITE_URL;
    try {
      process.env.NEXT_PUBLIC_SITE_URL = "https://www.carrosnacidade.com";
      expect(asArray(robots().sitemap)[0]).toBe("https://www.carrosnacidade.com/sitemap.xml");

      process.env.NEXT_PUBLIC_SITE_URL = "https://www.carrosnacidade.com/";
      expect(asArray(robots().sitemap)[0], "barra final na env não pode virar // no sitemap").toBe(
        "https://www.carrosnacidade.com/sitemap.xml"
      );
    } finally {
      if (prev === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
      else process.env.NEXT_PUBLIC_SITE_URL = prev;
    }
  });

  /**
   * `Host:` é extensão do Yandex, nunca foi padrão, o Google nunca suportou —
   * e era a causa provável do "1 problema" que o GSC acusava em cada uma das
   * 4 variantes (apex/www × http/https). Removida em 2026-07-26.
   */
  it("NÃO emite a diretiva Host (não-padrão)", () => {
    expect(robots()).not.toHaveProperty("host");
  });

  /**
   * Com `Allow: /`, um Allow extra só tem razão de existir se for mais
   * específico que algum Disallow (padrão `Disallow: /x/` + `Allow:
   * /x/publico/`). Allow que não contra-manda nada é ruído — foi o que se
   * removeu aqui, e este teste impede que volte sem função.
   */
  it("todo Allow além de / contra-manda algum Disallow", () => {
    const r = regra();
    const allows = asArray(r.allow).filter((a) => a !== "/");
    const disallows = asArray(r.disallow);

    for (const a of allows) {
      const contramanda = disallows.some((d) => a.startsWith(d) && a.length > d.length);
      expect(
        contramanda,
        `Allow "${a}" não contra-manda nenhum Disallow — é redundante com "Allow: /"`
      ).toBe(true);
    }
  });

  it("user-agent é o coringa (não restringe a um crawler só)", () => {
    expect(regra().userAgent).toBe("*");
  });
});
