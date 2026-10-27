import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

// Testa os padrões reais do script de smoke sem executá-lo contra produção.
// O arquivo é autossuficiente no workflow agendado (checkout esparso).
const source = readFileSync(
  new URL("../../scripts/smoke/public-contract-smoke.mjs", import.meta.url),
  "utf8"
);
const start = source.indexOf("const FORBIDDEN_PATTERNS = [");
const end = source.indexOf("\n];", start);
if (start < 0 || end < 0) throw new Error("Padrões do smoke não encontrados");
const patterns = runInNewContext(`${source.slice(start, end + 3)}\nFORBIDDEN_PATTERNS`);

function matches(html) {
  return patterns
    .filter(({ literal, regex }) => (literal ? html.includes(literal) : regex.test(html)))
    .map(({ id }) => id);
}

describe("smoke público — alertas legítimos de equipamentos", () => {
  it("não rejeita alerta de colisão frontal no anúncio real", () => {
    const html = '<span>Alerta de colisão frontal</span>';
    expect(matches(html)).not.toContain("dirty-alerta");
    expect(matches(html)).toEqual([]);
  });

  it("não rejeita outros recursos automotivos com a palavra alerta", () => {
    expect(matches("<li>Alerta de ponto cego</li>")).toEqual([]);
    expect(matches("<li>Alerta de tráfego cruzado</li>")).toEqual([]);
  });

  it("continua detectando marcador explícito de alerta de teste", () => {
    expect(matches("<div>Alerta de teste</div>")).toContain("dirty-alerta");
  });

  it("preserva a identificação de marcadores artificiais já proibidos", () => {
    expect(matches("<p>DeployModel</p>")).toContain("dirty-deploy-model");
    expect(matches("<p>Fake</p>")).toContain("dirty-fake");
  });
});
