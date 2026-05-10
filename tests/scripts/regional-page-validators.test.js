import { describe, it, expect } from "vitest";
import {
  checkAdsOrFallback,
  checkCanonical,
  checkContent,
  checkRegionChips,
  checkRobots,
  checkStatus,
  isAllowedSmokeUrl,
} from "../../scripts/lib/regional-page-validators.mjs";

describe("isAllowedSmokeUrl — guard contra produção", () => {
  it("aceita localhost em qualquer porta", () => {
    expect(isAllowedSmokeUrl("http://localhost:3000")).toBe(true);
    expect(isAllowedSmokeUrl("http://localhost")).toBe(true);
    expect(isAllowedSmokeUrl("https://localhost:8080/path")).toBe(true);
  });

  it("aceita 127.0.0.1 e 0.0.0.0", () => {
    expect(isAllowedSmokeUrl("http://127.0.0.1:3000")).toBe(true);
    expect(isAllowedSmokeUrl("http://0.0.0.0:3000")).toBe(true);
  });

  it("aceita hostnames com 'staging' como segmento", () => {
    expect(
      isAllowedSmokeUrl("https://carros-na-cidade-staging.onrender.com")
    ).toBe(true);
    expect(isAllowedSmokeUrl("https://staging.carrosnacidade.com")).toBe(true);
    expect(isAllowedSmokeUrl("https://app-staging-xyz.onrender.com")).toBe(true);
  });

  it("aceita 'preview' e 'review' como segmentos", () => {
    expect(isAllowedSmokeUrl("https://preview.carrosnacidade.com")).toBe(true);
    expect(isAllowedSmokeUrl("https://review-app-7.onrender.com")).toBe(true);
  });

  it("REJEITA produção", () => {
    expect(isAllowedSmokeUrl("https://carrosnacidade.com")).toBe(false);
    expect(
      isAllowedSmokeUrl("https://carros-na-cidade-core.onrender.com")
    ).toBe(false);
    expect(isAllowedSmokeUrl("https://www.carrosnacidade.com")).toBe(false);
  });

  it("REJEITA hostnames que apenas contêm 'staging' como substring colada", () => {
    // "carrosdestaging.com" não tem 'staging' isolado por '.' ou '-'
    expect(isAllowedSmokeUrl("https://carrosdestaging.com")).toBe(false);
  });

  it("REJEITA strings vazias e URLs malformadas", () => {
    expect(isAllowedSmokeUrl("")).toBe(false);
    expect(isAllowedSmokeUrl(null)).toBe(false);
    expect(isAllowedSmokeUrl(undefined)).toBe(false);
    expect(isAllowedSmokeUrl("not-a-url")).toBe(false);
    expect(isAllowedSmokeUrl(42)).toBe(false);
  });
});

describe("checkStatus", () => {
  it("aceita match exato", () => {
    expect(checkStatus(200, 200).ok).toBe(true);
    expect(checkStatus(404, 404).ok).toBe(true);
  });

  it("aceita array de expected", () => {
    expect(checkStatus(200, [200, 304]).ok).toBe(true);
    expect(checkStatus(304, [200, 304]).ok).toBe(true);
    expect(checkStatus(500, [200, 304]).ok).toBe(false);
  });

  it("falha com mensagem útil quando status não bate", () => {
    const r = checkStatus(500, 200);
    expect(r.ok).toBe(false);
    expect(r.message).toContain("500");
    expect(r.message).toContain("200");
  });
});

describe("checkRobots — exige noindex,follow", () => {
  it("aceita 'noindex,follow'", () => {
    const html = `<meta name="robots" content="noindex,follow">`;
    expect(checkRobots(html).ok).toBe(true);
  });

  it("aceita 'noindex, follow' com espaço", () => {
    const html = `<meta name="robots" content="noindex, follow">`;
    expect(checkRobots(html).ok).toBe(true);
  });

  it("aceita formato Next.js com googleBot espelhado", () => {
    // Next pode emitir múltiplas tags robots; o validator pega a 1ª.
    const html = `
      <meta name="robots" content="noindex,follow">
      <meta name="googlebot" content="noindex,follow">
    `;
    expect(checkRobots(html).ok).toBe(true);
  });

  it("REJEITA quando robots ausente", () => {
    const r = checkRobots("<html><head></head></html>");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ausente/);
  });

  it("REJEITA 'index,follow'", () => {
    const r = checkRobots(`<meta name="robots" content="index,follow">`);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/noindex/);
  });

  it("REJEITA 'noindex,nofollow' (Fase A→B exige follow)", () => {
    const r = checkRobots(`<meta name="robots" content="noindex,nofollow">`);
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/follow/);
  });
});

describe("checkCanonical — deve apontar para a cidade-base", () => {
  it("aceita canonical absoluto correto", () => {
    const html = `<link rel="canonical" href="https://staging.example.com/carros-em/atibaia-sp">`;
    expect(checkCanonical(html, "atibaia-sp").ok).toBe(true);
  });

  it("aceita canonical relativo correto", () => {
    const html = `<link rel="canonical" href="/carros-em/atibaia-sp">`;
    expect(checkCanonical(html, "atibaia-sp").ok).toBe(true);
  });

  it("REJEITA quando canonical ausente", () => {
    const r = checkCanonical("<html></html>", "atibaia-sp");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/ausente/);
  });

  it("REJEITA self-canonical na própria regional (Fase A→B proíbe)", () => {
    const html = `<link rel="canonical" href="/carros-usados/regiao/atibaia-sp">`;
    const r = checkCanonical(html, "atibaia-sp");
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/self-referente/i);
  });

  it("REJEITA quando canonical aponta para outra cidade", () => {
    const html = `<link rel="canonical" href="/carros-em/sao-paulo-sp">`;
    const r = checkCanonical(html, "atibaia-sp");
    expect(r.ok).toBe(false);
    expect(r.message).toContain("/carros-em/atibaia-sp");
  });
});

describe("checkContent — heurísticas de conteúdo essencial", () => {
  const happyHtml = `
    <h1>Carros usados na região de Atibaia</h1>
    <p>Veja veículos em Atibaia e cidades próximas em até <strong>80 km</strong>.</p>
  `;

  it("PASS quando título, cidade e raio aparecem", () => {
    expect(
      checkContent(happyHtml, {
        baseSlug: "atibaia-sp",
        cityNameHints: ["Atibaia"],
      }).ok
    ).toBe(true);
  });

  it("REJEITA quando título 'região de' ausente", () => {
    const r = checkContent("<h1>Atibaia</h1><p>80 km</p>", {
      baseSlug: "atibaia-sp",
      cityNameHints: ["Atibaia"],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/região de/);
  });

  it("REJEITA quando nome da cidade não aparece", () => {
    const r = checkContent(
      "<h1>Carros usados na região de Outro Lugar</h1><p>80 km</p>",
      { baseSlug: "atibaia-sp", cityNameHints: ["Atibaia"] }
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/nome da cidade/);
  });

  it("REJEITA quando raio em km ausente", () => {
    const r = checkContent(
      "<h1>Carros usados na região de Atibaia</h1>",
      { baseSlug: "atibaia-sp", cityNameHints: ["Atibaia"] }
    );
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/raio/);
  });

  it("REJEITA quando placeholder R$ 0 detectado", () => {
    const html = `${happyHtml}<div>Por R$ 0,00</div>`;
    const r = checkContent(html, {
      baseSlug: "atibaia-sp",
      cityNameHints: ["Atibaia"],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/R\$ 0/);
  });

  it("REJEITA quando 'lorem ipsum' detectado", () => {
    const html = `${happyHtml}<div>lorem ipsum dolor</div>`;
    const r = checkContent(html, {
      baseSlug: "atibaia-sp",
      cityNameHints: ["Atibaia"],
    });
    expect(r.ok).toBe(false);
    expect(r.message).toMatch(/lorem/i);
  });
});

describe("checkAdsOrFallback — distingue cards vs fallback vs vazio", () => {
  it("identifica fallback profissional", () => {
    const html = `<div>Ainda não encontramos veículos nesta região</div>`;
    const r = checkAdsOrFallback(html);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("fallback");
    expect(r.adCount).toBe(0);
  });

  it("identifica anúncios via href /veiculo/", () => {
    const html = `
      <a href="/veiculo/honda-civic-2020-abc">Card 1</a>
      <a href="/veiculo/ford-ka-2018-xyz">Card 2</a>
    `;
    const r = checkAdsOrFallback(html);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("ads");
    expect(r.adCount).toBe(2);
  });

  it("identifica anúncios via data-ad-id", () => {
    const html = `<article data-ad-id="42">…</article>`;
    const r = checkAdsOrFallback(html);
    expect(r.ok).toBe(true);
    expect(r.kind).toBe("ads");
  });

  it("REJEITA HTML sem anúncios E sem fallback (página vazia/quebrada)", () => {
    const html = `<div>algo aleatório sem cards nem fallback</div>`;
    const r = checkAdsOrFallback(html);
    expect(r.ok).toBe(false);
    expect(r.kind).toBe("empty");
  });
});

describe("checkRegionChips", () => {
  it("PASS quando label e chips presentes", () => {
    const html = `
      <p>Cidades nesta região</p>
      <a href="/carros-em/braganca-paulista-sp">Bragança Paulista</a>
      <a href="/carros-em/piracaia-sp">Piracaia</a>
    `;
    const r = checkRegionChips(html, "atibaia-sp");
    expect(r.ok).toBe(true);
    expect(r.memberLinks).toBe(2);
  });

  it("PASS quando label ausente (cidade isolada — chips suprimidos por design)", () => {
    const html = `<h1>Região de Algum Lugar Pequeno</h1>`;
    const r = checkRegionChips(html, "lugarejo-mt");
    expect(r.ok).toBe(true);
    expect(r.memberLinks).toBe(0);
  });

  it("REJEITA quando label presente mas nenhum chip de vizinho", () => {
    const html = `
      <p>Cidades nesta região</p>
      <a href="/carros-em/atibaia-sp">Atibaia</a>
    `;
    const r = checkRegionChips(html, "atibaia-sp");
    expect(r.ok).toBe(false);
  });
});
