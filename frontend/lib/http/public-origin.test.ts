import { afterEach, describe, expect, it, vi } from "vitest";

import { buildPublicRedirectUrl, resolvePublicOrigin } from "@/lib/http/public-origin";

/**
 * O `Location` de um redirect é seguido LITERALMENTE pelo navegador. Se ele
 * carregar o host do container, o usuário recebe DNS_PROBE_FINISHED_NXDOMAIN —
 * a rota está certa, o status está certo, e mesmo assim a página não abre.
 *
 * O caso que motivou o módulo é o do Render: `request.url` chega como
 * `http://srv-…:10000/…` enquanto o proxy informa o host real em
 * `x-forwarded-host`. Os testes abaixo travam justamente essa combinação — a
 * URL interna presente E o header público disponível.
 */

const ORIGINAL_SITE_URL = process.env.NEXT_PUBLIC_SITE_URL;

afterEach(() => {
  if (ORIGINAL_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
  else process.env.NEXT_PUBLIC_SITE_URL = ORIGINAL_SITE_URL;
  vi.unstubAllEnvs();
});

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { headers });
}

describe("resolvePublicOrigin", () => {
  it("proxy: usa x-forwarded-host/-proto e IGNORA o host interno da request.url", () => {
    const origem = resolvePublicOrigin(
      req("http://srv-d1abcdef2gh:10000/tabela-fipe", {
        host: "srv-d1abcdef2gh:10000",
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    expect(origem).toBe("https://www.carrosnacidade.com");
    expect(origem).not.toContain("srv-");
    expect(origem).not.toContain("10000");
  });

  it("host interno SEM forwarded: cai na origem canônica, nunca no host interno", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.carrosnacidade.com");

    const origem = resolvePublicOrigin(
      req("http://srv-d1abcdef2gh:10000/tabela-fipe", { host: "srv-d1abcdef2gh:10000" })
    );

    expect(origem).toBe("https://www.carrosnacidade.com");
    expect(origem).not.toContain("srv-");
  });

  it("localhost continua local — não vaza para produção", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.carrosnacidade.com");

    expect(
      resolvePublicOrigin(req("http://localhost:3000/tabela-fipe", { host: "localhost:3000" }))
    ).toBe("http://localhost:3000");

    expect(
      resolvePublicOrigin(req("http://127.0.0.1:3000/tabela-fipe", { host: "127.0.0.1:3000" }))
    ).toBe("http://127.0.0.1:3000");
  });

  it("produção direta (sem proxy): host público é preservado", () => {
    expect(
      resolvePublicOrigin(
        req("https://www.carrosnacidade.com/tabela-fipe", { host: "www.carrosnacidade.com" })
      )
    ).toBe("https://www.carrosnacidade.com");
  });

  it("x-forwarded-host com lista usa o primeiro valor (o cliente)", () => {
    expect(
      resolvePublicOrigin(
        req("http://srv-x:10000/tabela-fipe", {
          host: "srv-x:10000",
          "x-forwarded-host": "www.carrosnacidade.com, interno.local",
          "x-forwarded-proto": "https, http",
        })
      )
    ).toBe("https://www.carrosnacidade.com");
  });

  it("x-forwarded-host TAMBÉM interno é recusado — cai na canônica", () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://www.carrosnacidade.com");

    expect(
      resolvePublicOrigin(
        req("http://srv-x:10000/tabela-fipe", {
          host: "srv-x:10000",
          "x-forwarded-host": "web",
        })
      )
    ).toBe("https://www.carrosnacidade.com");
  });

  it("sem NEXT_PUBLIC_SITE_URL e com host interno, ainda devolve host navegável", () => {
    delete process.env.NEXT_PUBLIC_SITE_URL;

    const origem = resolvePublicOrigin(
      req("http://srv-d1abcdef2gh:10000/tabela-fipe", { host: "srv-d1abcdef2gh:10000" })
    );

    expect(origem).toBe("https://carrosnacidade.com");
    expect(origem).not.toContain("srv-");
  });
});

describe("buildPublicRedirectUrl — o Location que o navegador recebe", () => {
  it("monta o destino territorial na origem pública", () => {
    const url = buildPublicRedirectUrl(
      "/tabela-fipe/atibaia-sp",
      req("http://srv-d1abcdef2gh:10000/tabela-fipe", {
        host: "srv-d1abcdef2gh:10000",
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    expect(url.toString()).toBe("https://www.carrosnacidade.com/tabela-fipe/atibaia-sp");
    expect(url.pathname).toBe("/tabela-fipe/atibaia-sp");
  });

  it("preserva o path do simulador do mesmo modo", () => {
    const url = buildPublicRedirectUrl(
      "/simulador-financiamento/atibaia-sp",
      req("http://srv-x:10000/simulador-financiamento", {
        host: "srv-x:10000",
        "x-forwarded-host": "www.carrosnacidade.com",
        "x-forwarded-proto": "https",
      })
    );

    expect(url.toString()).toBe(
      "https://www.carrosnacidade.com/simulador-financiamento/atibaia-sp"
    );
  });

  it("em localhost o destino continua local e navegável", () => {
    const url = buildPublicRedirectUrl(
      "/tabela-fipe/atibaia-sp",
      req("http://localhost:3000/tabela-fipe", { host: "localhost:3000" })
    );

    expect(url.toString()).toBe("http://localhost:3000/tabela-fipe/atibaia-sp");
  });
});
