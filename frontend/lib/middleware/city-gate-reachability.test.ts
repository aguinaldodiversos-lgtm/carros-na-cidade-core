import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * O gate de cidade é ALCANÇADO pelo middleware?
 *
 * ── Por que este teste existe ────────────────────────────────────────────
 * Em 2026-08-06, `/carros-usados/regiao/altaneira-ce` continuou respondendo
 * 200 depois do deploy, mesmo com:
 *   - a família já listada em CITY_PREFIX_PATTERNS;
 *   - `extractCityScopedMatch` devolvendo o match correto;
 *   - teste unitário verde.
 *
 * A causa: o guard da Página Regional trata essa família na etapa 2 do
 * middleware e faz `return respond(...)` em `pass-valid` — o gate de cidade,
 * na etapa 2b-bis, nunca era alcançado. O teste unitário exercitava a função
 * pura, que estava certa; nada verificava que o middleware CHEGAVA a chamá-la.
 *
 * Foi o smoke contra produção que pegou. Este teste traz a checagem para o CI:
 * toda saída ANTECIPADA do middleware que trate uma rota com escopo de cidade
 * precisa consultar o gate antes de deixar passar.
 *
 * É um teste de FONTE, não de comportamento — o middleware do Next não é
 * instanciável isoladamente em vitest. Deliberadamente frágil a refactor: se
 * alguém reorganizar os guards, ele quebra e obriga a reavaliar o alcance.
 */

const MIDDLEWARE = readFileSync(join(process.cwd(), "middleware.ts"), "utf8");

/** Trecho do bloco `pass-valid` do guard Regional, até o `return`. */
function regionalPassBranch(): string {
  const start = MIDDLEWARE.indexOf('action.kind === "pass-valid"');
  expect(start, "bloco pass-valid do guard Regional não encontrado").toBeGreaterThan(-1);
  const end = MIDDLEWARE.indexOf('"passed-valid"', start);
  expect(end, "return do bloco pass-valid não encontrado").toBeGreaterThan(start);
  return MIDDLEWARE.slice(start, end);
}

describe("guard Regional consulta o gate de cidade antes de liberar", () => {
  it("chama extractCityScopedMatch no bloco pass-valid", () => {
    // A CHAMADA, não a menção: `null as ReturnType<typeof extractCityScopedMatch>`
    // contém o identificador e passaria numa checagem frouxa — foi o que
    // aconteceu na primeira versão deste teste.
    expect(regionalPassBranch()).toContain("extractCityScopedMatch(pathname)");
  });

  it("chama decideCityExistenceAction no bloco pass-valid", () => {
    expect(regionalPassBranch()).toContain("await fetchPublicCitySet()");
    expect(regionalPassBranch()).toContain("decideCityExistenceAction(regionalCityMatch");
  });

  it("bloqueia com 404 antes de deixar passar", () => {
    const branch = regionalPassBranch();
    expect(branch).toContain("block-not-found");
    expect(branch).toContain("status: 404");
  });
});

describe("o gate de cidade continua montado no fluxo principal", () => {
  it("middleware importa as funções do gate", () => {
    expect(MIDDLEWARE).toContain("extractCityScopedMatch");
    expect(MIDDLEWARE).toContain("decideCityExistenceAction");
    expect(MIDDLEWARE).toContain("extractUfScopedMatch");
    expect(MIDDLEWARE).toContain("decideUfExistenceAction");
  });

  it("o gate roda DEPOIS do territory-gate estrutural", () => {
    // O estrutural é de graça (sem I/O) e barra slug com UF falsa antes de
    // custar o fetch do conjunto.
    const territory = MIDDLEWARE.indexOf("decideTerritoryGate(pathname)");
    const cityGate = MIDDLEWARE.indexOf("const cityMatch = extractCityScopedMatch(pathname)");
    expect(territory).toBeGreaterThan(-1);
    expect(cityGate).toBeGreaterThan(territory);
  });
});
