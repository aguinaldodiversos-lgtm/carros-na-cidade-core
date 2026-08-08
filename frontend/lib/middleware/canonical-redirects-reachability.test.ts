import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Os redirects de canonicalização são ALCANÇADOS pelo middleware?
 *
 * ── Por que este teste existe ────────────────────────────────────────────────
 * Mesma armadilha que deixou `/carros-usados/regiao/altaneira-ce` em 200 depois
 * do deploy (ver `city-gate-reachability.test.ts`): a função pura estava certa,
 * o teste unitário verde, e nada verificava que o middleware CHEGAVA a
 * chamá-la. O guard da Página Regional faz `return` na etapa 2, então tudo que
 * mora depois é inalcançável para aquela família.
 *
 * A normalização de query cai exatamente nessa armadilha: `/carros-usados/
 * regiao/[slug]` está em CATALOG_PATHS, mas a chamada do fim do middleware
 * nunca a veria. Por isso a chamada é repetida dentro do bloco regional — e é
 * isso que este teste trava.
 *
 * Teste de FONTE, não de comportamento: o middleware do Next não é instanciável
 * isoladamente em vitest. Deliberadamente frágil a refactor — reorganizar os
 * guards precisa obrigar a reavaliar o alcance.
 */

const MIDDLEWARE = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

function indexOfCall(needle: string): number {
  return MIDDLEWARE.indexOf(needle);
}

/** Trecho do bloco `pass-valid` do guard Regional, até o `return`. */
function regionalPassBranch(): string {
  const start = MIDDLEWARE.indexOf('action.kind === "pass-valid"');
  expect(start, "bloco pass-valid do guard Regional não encontrado").toBeGreaterThan(-1);
  const end = MIDDLEWARE.indexOf('"passed-valid"', start);
  expect(end, "return do bloco pass-valid não encontrado").toBeGreaterThan(start);
  return MIDDLEWARE.slice(start, end);
}

describe("as decisões de redirect estão montadas no middleware", () => {
  it.each([
    "decideComprarLegacyQueryRedirect(pathname, search)",
    "decideLegacyCityRedirect(pathname, search)",
    "decideAnunciosListRedirect(pathname)",
    "decideQueryNormalizationRedirect(pathname, search)",
    "decideAdAliasRedirect(adDetailMatch, validation)",
  ])("chama %s", (call) => {
    // A CHAMADA, não a menção: um `import` ou um comentário contém o
    // identificador e passaria numa checagem frouxa — foi o que já aconteceu.
    expect(indexOfCall(call)).toBeGreaterThan(-1);
  });

  it("todos emitem 308 (permanente), não 302/307", () => {
    for (const marker of [
      "comprar-legacy-query",
      "legacy-city",
      "ad-alias",
      "anuncios-list",
      "query-normalization",
    ]) {
      const at = MIDDLEWARE.indexOf(marker);
      expect(at, `marcador ${marker} ausente`).toBeGreaterThan(-1);
      // O `NextResponse.redirect(url, 308)` do bloco vem imediatamente antes do
      // header que o rotula.
      const before = MIDDLEWARE.slice(Math.max(0, at - 400), at);
      expect(before, `redirect de ${marker} não é 308`).toContain("308");
    }
  });
});

describe("ordem: o 404 territorial vence o redirect", () => {
  it("o redirect da rota legada de cidade roda DEPOIS dos gates de existência", () => {
    // Se viesse antes, cidade sem anúncio ativo (ou com slug inválido) viraria
    // 308 para uma URL que também dá 404 — cadeia inútil — em vez do 404 direto.
    const territoryGate = indexOfCall("decideTerritoryGate(pathname)");
    const cityGate = indexOfCall("const cityMatch = extractCityScopedMatch(pathname)");
    const legacyCity = indexOfCall("decideLegacyCityRedirect(pathname, search)");

    expect(territoryGate).toBeGreaterThan(-1);
    expect(cityGate).toBeGreaterThan(-1);
    expect(legacyCity).toBeGreaterThan(cityGate);
    expect(legacyCity).toBeGreaterThan(territoryGate);
  });

  it("o alias de anúncio roda DEPOIS do gate de existência do anúncio", () => {
    const validation = indexOfCall("decideAdDetailMiddlewareAction(validation)");
    const alias = indexOfCall("decideAdAliasRedirect(adDetailMatch, validation)");
    expect(validation).toBeGreaterThan(-1);
    expect(alias).toBeGreaterThan(validation);
  });

  it("a normalização de query roda por último no fluxo principal", () => {
    const normalization = MIDDLEWARE.lastIndexOf("decideQueryNormalizationRedirect(pathname, search)");
    const finalNext = MIDDLEWARE.indexOf("// Fim: propaga o pathname");
    expect(normalization).toBeGreaterThan(-1);
    expect(finalNext).toBeGreaterThan(normalization);
  });
});

describe("alcance: o guard Regional retorna cedo e precisa normalizar sozinho", () => {
  it("o bloco pass-valid da Regional chama a normalização antes de liberar", () => {
    // `/carros-usados/regiao/[slug]` está em CATALOG_PATHS, mas o guard Regional
    // faz `return` na etapa 2: a chamada do fim do middleware é INALCANÇÁVEL
    // para essa família. Sem esta repetição, `?sort=relevance` nunca seria
    // normalizado ali — e o teste unitário da função pura continuaria verde.
    expect(regionalPassBranch()).toContain("decideQueryNormalizationRedirect(pathname, search)");
  });

  it("a normalização aparece pelo menos duas vezes (fluxo principal + Regional)", () => {
    const ocorrencias = MIDDLEWARE.split("decideQueryNormalizationRedirect(pathname, search)")
      .length - 1;
    expect(ocorrencias).toBeGreaterThanOrEqual(2);
  });
});

/**
 * P0 (2026-08-07): o middleware precisa TRATAR `block-unavailable`.
 *
 * Antes ele tratava `pass-unavailable` — e por isso uma env ausente no build
 * publicava página territorial. Se alguém remover estes ramos, o gate volta a
 * ser desligável por acidente, e é isso que este bloco impede.
 */
describe("fail-safe: indisponibilidade do gate vira 503, nunca 200", () => {
  it.each([
    ["cidade (fluxo principal)", 'gateUnavailableResponse("city"'],
    ["cidade (dentro do guard Regional)", 'gateUnavailableResponse("city-regional"'],
    ["UF", 'gateUnavailableResponse("uf"'],
    ["anúncio", 'gateUnavailableResponse("ad"'],
  ])("o ramo de %s emite 503", (_nome, call) => {
    expect(MIDDLEWARE).toContain(call);
  });

  it("todo `block-unavailable` é tratado — nenhum cai no fluxo de sucesso", () => {
    const ramos = MIDDLEWARE.split('kind === "block-unavailable"').length - 1;
    // 4 gates territoriais/anúncio + o guard Regional, que já tinha o seu.
    expect(ramos).toBeGreaterThanOrEqual(4);
  });

  it("a resposta 503 carrega Retry-After e X-Robots-Tag noindex", () => {
    const helper = MIDDLEWARE.slice(
      MIDDLEWARE.indexOf("function gateUnavailableResponse"),
      MIDDLEWARE.indexOf("export async function middleware")
    );
    expect(helper).toContain("status: 503");
    expect(helper).toContain("Retry-After");
    expect(helper).toContain("X-Robots-Tag");
    expect(helper).toContain("no-store");
  });

  it("`pass-unavailable` não existe mais no middleware", () => {
    // O identificador só pode aparecer em comentário explicando a correção.
    const codeOnly = MIDDLEWARE.split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");
    expect(codeOnly).not.toContain("pass-unavailable");
  });
});

describe("nenhum destino territorial fixo no middleware", () => {
  it("o arquivo não embute slug de cidade em redirect", () => {
    // O middleware pode citar cidades em comentário (e cita, em exemplos de
    // bug); o que não pode é montar um destino com cidade literal.
    const codeOnly = MIDDLEWARE.split("\n")
      .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
      .join("\n");

    expect(codeOnly).not.toMatch(/["'`]\/carros-em\/[a-z]/);
    expect(codeOnly).not.toMatch(/atibaia/i);
  });
});
