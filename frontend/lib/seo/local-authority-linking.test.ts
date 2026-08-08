// @vitest-environment node
import { describe, expect, it } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

/**
 * Varredura de INTERNAL LINKING da camada de autoridade local (Fase 3).
 *
 * O que estes testes protegem, em uma frase: nenhum link da malha SEO pode
 * apontar para uma superfície que o próprio site pede para não indexar.
 *
 * Duas regressões REAIS que motivaram a varredura (auditoria 2026-08-07,
 * observadas no HTML servido):
 *
 *   1. `CompactCitySeoBlock` linkava marcas por `?brand=<nome cru FIPE>` —
 *      URL com parâmetro, que a política de query deduplica para a cidade
 *      limpa. O bloco de marcas da página gastava seus links num beco.
 *   2. O rodapé (chrome GLOBAL) linkava `…/modelo/<descrição FIPE>` — recortes
 *      de 1-2 anúncios, todos noindex. O site inteiro apontava para eles.
 *
 * A varredura é textual de propósito: pega o padrão em QUALQUER arquivo novo,
 * inclusive um que ainda não existe.
 */

const FRONTEND_ROOT = path.resolve(__dirname, "../..");
const SCAN_DIRS = ["app", "components", "lib"];
const SCAN_EXT = new Set([".ts", ".tsx"]);

function collectSourceFiles(dir: string, acc: string[] = []): string[] {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return acc;
  }

  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next") continue;
    const full = path.join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      collectSourceFiles(full, acc);
      continue;
    }
    if (!SCAN_EXT.has(path.extname(entry))) continue;
    if (entry.endsWith(".test.ts") || entry.endsWith(".test.tsx")) continue;
    acc.push(full);
  }

  return acc;
}

const SOURCES = SCAN_DIRS.flatMap((d) => collectSourceFiles(path.join(FRONTEND_ROOT, d))).map(
  (file) => ({
    // Sempre com "/" — no Windows `path.relative` devolve "\", e um
    // `endsWith("lib/seo/...")` passaria a nunca casar, transformando a
    // varredura num teste que "passa" sem ler arquivo nenhum.
    file: path.relative(FRONTEND_ROOT, file).split(path.sep).join("/"),
    body: readFileSync(file, "utf8"),
  })
);

/**
 * Corpo SEM comentários. Necessário porque estes arquivos DOCUMENTAM os
 * padrões proibidos ("um `catch { return [] }` aqui reproduziria a falha
 * silenciosa da Fase 2B.1") — sem o strip, a varredura acusaria a própria
 * explicação de por que o padrão não deve existir.
 */
function stripComments(body: string): string {
  return body.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

const CODE = SOURCES.map((s) => ({ ...s, body: stripComments(s.body) }));

it("a varredura enxerga os arquivos (guarda contra falso verde)", () => {
  expect(SOURCES.length).toBeGreaterThan(50);
  expect(SOURCES.some((s) => s.file === "components/seo/CityAuthoritySection.tsx")).toBe(true);
  expect(SOURCES.some((s) => s.file === "lib/seo/city-seo-overview.ts")).toBe(true);
});

describe("varredura: nenhum link SEO monta URL de marca por parâmetro", () => {
  it("não existe href com `?brand=` / `&brand=`", () => {
    const offenders = CODE.filter(({ body }) => /href=[^\n]*[?&]brand=/.test(body)).map(
      (s) => s.file
    );
    expect(offenders).toEqual([]);
  });

  it("não existe template de URL com `?brand=` interpolado", () => {
    const offenders = CODE.filter(({ body }) => /[?&]brand=\$\{/.test(body)).map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe("varredura: a malha usa a canônica de marca/modelo", () => {
  it("existe pelo menos um consumidor da rota canônica de marca", () => {
    const users = CODE.filter(({ body }) => /\/cidade\/\$\{[^}]+\}\/marca\//.test(body));
    expect(users.length).toBeGreaterThan(0);
  });

  it("nenhum arquivo monta slug de modelo a partir da descrição FIPE crua", () => {
    // `brandModelSlug(ad.model)` num href é o padrão que produzia
    // `/modelo/onix-hatch-lt-1-0-12v-flex-5p-mec`. O slug de modelo em link
    // tem de vir de `commercialModelSlug`/`deriveCommercialModel` ou já
    // resolvido pelo backend.
    const offenders = CODE.filter(({ body }) =>
      /\/modelo\/\$\{\s*brandModelSlug\(/.test(body)
    ).map((s) => s.file);
    expect(offenders).toEqual([]);
  });
});

describe("varredura: o bloco de autoridade não regride para client component", () => {
  it("CityAuthoritySection é Server Component (sem 'use client')", () => {
    const file = SOURCES.find((s) => s.file.endsWith("CityAuthoritySection.tsx"));
    expect(file).toBeTruthy();
    expect(file!.body).not.toMatch(/^\s*["']use client["']/m);
  });

  it("não usa hooks de cliente (que forçariam hydration do bloco SEO)", () => {
    const file = SOURCES.find((s) => s.file.endsWith("CityAuthoritySection.tsx"))!;
    expect(file.body).not.toMatch(/\buseState\b|\buseEffect\b|\bonClick\b/);
  });

  it("o loader do overview é server-only (nunca vai para o bundle)", () => {
    const file = SOURCES.find((s) => s.file.endsWith("lib/seo/city-seo-overview.ts"));
    expect(file).toBeTruthy();
    expect(file!.body).toMatch(/import "server-only"/);
  });
});

describe("varredura: falha de backend não vira 'sem estoque'", () => {
  it("o loader distingue unavailable de ok-vazio", () => {
    const file = CODE.find((s) => s.file.endsWith("lib/seo/city-seo-overview.ts"))!;
    expect(file.body).toMatch(/status: "unavailable"/);
    expect(file.body).toMatch(/status: "not_found"/);
    expect(file.body).toMatch(/status: "ok"/);
  });

  it("nenhum catch do loader devolve lista vazia silenciosa", () => {
    const file = CODE.find((s) => s.file.endsWith("lib/seo/city-seo-overview.ts"))!;
    expect(file.body).not.toMatch(/catch[^{]*\{\s*return\s*\[\]/);
    // Toda saída de erro loga — degrade mudo foi o que custou semanas no
    // incidente dos sitemaps (Fase 2B.1).
    const catches = file.body.match(/catch[\s\S]{0,400}?\}/g) || [];
    for (const block of catches) expect(block).toMatch(/console\.error/);
  });
});
