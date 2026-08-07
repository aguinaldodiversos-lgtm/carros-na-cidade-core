// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

/**
 * Varredura de FONTE: nenhum link interno pode voltar a apontar para as rotas
 * legadas de cidade.
 *
 * ── Por que uma varredura, e não só testes por componente ────────────────────
 * O defeito original não era um link errado — eram DEZESSEIS, espalhados por
 * blog, FIPE, financiamento, veículo, breadcrumbs, rodapé e cabeçalho, cada um
 * montando a URL à mão. Testar componente a componente não impede o
 * décimo-sétimo. Este teste falha no PR que reintroduzir o padrão, em qualquer
 * arquivo.
 *
 * Deliberadamente frágil: é para ser lido como "use `getCanonicalCityPath`".
 */

const ROOT = process.cwd();
const SCAN_DIRS = ["app", "components", "lib"];
const CODE_EXT = new Set([".ts", ".tsx"]);

/**
 * Arquivos onde a rota legada PODE aparecer, com o motivo.
 *
 * Toda entrada aqui é uma decisão explícita — a lista curta é o ponto. Se ela
 * crescer, é sinal de que a rota legada voltou a se espalhar.
 */
const ALLOWLIST = new Map<string, string>([
  // A própria rota legada: existe para redirecionar.
  ["app/comprar/cidade/[slug]/page.tsx", "a rota legada em si (308 → /carros-em)"],
  // Gates e redirects PRECISAM reconhecer o pathname legado para agir sobre ele.
  ["lib/middleware/canonical-redirects.ts", "reconhece o pathname legado para redirecionar"],
  ["lib/middleware/territory-gate.ts", "cobre a família legada no gate estrutural"],
  ["lib/middleware/city-existence-gate.ts", "cobre a família legada no gate de existência"],
  ["lib/middleware/bandwidth-log.ts", "agrupa o pathname legado no log"],
  ["lib/city/city-from-pathname.ts", "extrai a cidade de URLs legadas ainda em circulação"],
  ["lib/city/CityContext.tsx", "detecta que o usuário está numa vitrine para trocar de cidade"],
]);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  const absolute = join(ROOT, dir);

  const walk = (current: string) => {
    for (const entry of readdirSync(current)) {
      if (entry === "node_modules" || entry === ".next") continue;
      const full = join(current, entry);
      if (statSync(full).isDirectory()) {
        walk(full);
        continue;
      }
      if (!CODE_EXT.has(extname(entry))) continue;
      if (entry.includes(".test.")) continue;
      out.push(full);
    }
  };

  walk(absolute);
  return out;
}

const FILES = SCAN_DIRS.flatMap(listSourceFiles);

/** Descarta comentários — a proibição é sobre CÓDIGO, não sobre documentação. */
function codeOnly(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//") && !line.trim().startsWith("*"))
    .join("\n");
}

function offenders(pattern: RegExp): string[] {
  const found: string[] = [];

  for (const file of FILES) {
    const rel = relative(ROOT, file).replace(/\\/g, "/");
    if (ALLOWLIST.has(rel)) continue;
    if (pattern.test(codeOnly(readFileSync(file, "utf8")))) found.push(rel);
  }

  return found.sort();
}

describe("nenhum link interno monta a rota legada de cidade", () => {
  it("não existe literal `/comprar/cidade/` em código", () => {
    expect(offenders(/["'`]\/comprar\/cidade\//)).toEqual([]);
  });

  it("não existe `/comprar?city_slug=` nem `city_slug=` montado em href", () => {
    expect(offenders(/["'`]\/comprar\?[^"'`]*city_slug=/)).toEqual([]);
    expect(offenders(/["'`]\/anuncios\?[^"'`]*city_slug=/)).toEqual([]);
  });

  it("não existe `/comprar?state=` montado à mão (a vitrine estadual tem rota própria)", () => {
    expect(offenders(/["'`]\/comprar\?[^"'`]*state=/)).toEqual([]);
  });
});

describe("a allowlist é curta e justificada", () => {
  it("toda entrada tem motivo declarado", () => {
    for (const [file, motivo] of ALLOWLIST) {
      expect(motivo.length, `${file} sem motivo`).toBeGreaterThan(10);
    }
  });

  it("toda entrada da allowlist ainda existe (senão é lixo acumulado)", () => {
    for (const file of ALLOWLIST.keys()) {
      expect(() => statSync(join(ROOT, file)), `${file} não existe mais`).not.toThrow();
    }
  });
});

describe("a função central é de fato usada pelos geradores de link", () => {
  it.each([
    "lib/site/site-navigation.ts",
    "lib/territory/territory-resolver.ts",
    "lib/buy/territory-variant.ts",
    "app/sitemaps/_lib/transition-helpers.ts",
  ])("%s importa de canonical-city-path", (file) => {
    const source = readFileSync(join(ROOT, file), "utf8");
    expect(source).toContain("@/lib/seo/canonical-city-path");
  });

  it("a varredura cobriu um número plausível de arquivos", () => {
    // Guarda contra o teste passar por não ter lido nada.
    expect(FILES.length).toBeGreaterThan(100);
  });
});
