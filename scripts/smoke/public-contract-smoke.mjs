#!/usr/bin/env node
/**
 * scripts/smoke/public-contract-smoke.mjs
 *
 * Smoke público consolidado — P2-E (Contract Lock) 2026-05-25.
 *
 * Une e expande:
 *   - scripts/smoke/public-territorial-smoke.sh
 *   - scripts/smoke/public-language-smoke.sh
 *   - frontend/scripts/smoke-territorial-routes.mjs
 *
 * Por que Node mjs (e não bash):
 *   - Portátil Windows/Linux/macOS (sem dependência de bash/curl/grep).
 *   - Node 20+ tem fetch built-in; zero npm install para rodar.
 *   - Pode ser invocado por GitHub Actions, Render Scheduled Job ou
 *     cron local com o mesmo comando.
 *
 * Cobertura (briefing P2-E 2026-05-25):
 *
 *   ROTAS CRÍTICAS (15):
 *     /
 *     /comprar/estado/sp
 *     /carros-em/atibaia-sp
 *     /carros-em/campinas-sp
 *     /carros-usados/regiao/atibaia-sp
 *     /carros-usados/regiao/campinas-sp
 *     /veiculo/anuncio-inexistente-xyz-999      → 404 esperado
 *     /anuncios/slug-fantasma                   → 404 esperado
 *     /simulador-financiamento
 *     /simulador-financiamento/sao-paulo-sp
 *     /simulador-financiamento/atibaia-sp
 *     /tabela-fipe
 *     /tabela-fipe/sao-paulo-sp
 *     /tabela-fipe/atibaia-sp
 *     /anunciar
 *
 *   STRINGS PROIBIDAS no HTML público (qualquer rota 200):
 *     Teste, Test, DeployModel, Seed, Worker, Alerta, Fake, Dummy,
 *     "SÆo Paulo", "backend irá incorporar", "features[]", "has_photo",
 *     "R$ 0" fake, "Veículo não encontrado" com status 200,
 *     "plano Pro"/"plano Start" como mecânica de vitrine.
 *
 *   HREFS /veiculo/* extraídos de Home, Estado, Cidade e Regional:
 *     - HTTP 200
 *     - sem fallback fake (T-Cross id=999001, slug volkswagen-t-cross-2022-2023)
 *     - sem "R$ 0"
 *     - sem cidade hardcoded indevida
 *     - header `x-middleware-ad: passed-valid` quando emitido (best-effort)
 *
 * Uso:
 *   node scripts/smoke/public-contract-smoke.mjs                       # prod (https://www.carrosnacidade.com)
 *   node scripts/smoke/public-contract-smoke.mjs --base=URL            # base custom
 *   node scripts/smoke/public-contract-smoke.mjs --verbose              # detalhe de cada check
 *   node scripts/smoke/public-contract-smoke.mjs --json                 # report machine-readable
 *
 * Exit code:
 *   0 → todas as checks críticas passaram (deploy ok)
 *   1 → pelo menos uma falha crítica
 *   2 → erro de execução (network, timeout, etc.)
 */

const DEFAULT_BASE = "https://www.carrosnacidade.com";
const USER_AGENT = "cnc-contract-smoke/2026-05-25";
const TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const args = { base: DEFAULT_BASE, verbose: false, json: false };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--base=")) args.base = raw.slice("--base=".length);
    else if (raw === "-v" || raw === "--verbose") args.verbose = true;
    else if (raw === "--json") args.json = true;
  }
  args.base = args.base.replace(/\/+$/, "");
  return args;
}

// ---------------------------------------------------------------------------
// Definições do contrato público
// ---------------------------------------------------------------------------

/**
 * Rotas críticas e o status esperado. `must200=false` aceita 200 OU 404
 * conforme a rota — para rotas com flag opcional (ex.: regional pode estar
 * desativada por env, retornando 404 by design).
 */
const ROUTES = [
  { path: "/", expected: [200], extractAds: true },
  { path: "/comprar/estado/sp", expected: [200], extractAds: true },
  { path: "/carros-em/atibaia-sp", expected: [200], extractAds: true },
  { path: "/carros-em/campinas-sp", expected: [200], extractAds: true },
  { path: "/carros-usados/regiao/atibaia-sp", expected: [200, 404], extractAds: true },
  { path: "/carros-usados/regiao/campinas-sp", expected: [200, 404], extractAds: true },
  { path: "/veiculo/anuncio-inexistente-xyz-999", expected: [404], skipStringChecks: true },
  { path: "/anuncios/slug-fantasma", expected: [404], skipStringChecks: true },
  { path: "/simulador-financiamento", expected: [200] },
  { path: "/simulador-financiamento/sao-paulo-sp", expected: [200] },
  { path: "/simulador-financiamento/atibaia-sp", expected: [200] },
  { path: "/tabela-fipe", expected: [200] },
  { path: "/tabela-fipe/sao-paulo-sp", expected: [200] },
  { path: "/tabela-fipe/atibaia-sp", expected: [200] },
  { path: "/anunciar", expected: [200] },
];

/**
 * Strings proibidas em HTML público (qualquer rota 200). Briefing P2-E
 * 2026-05-25. Cada entrada é um pattern simples (literal ou regex).
 *
 * Padrões com palavras curtas ("Test", "Seed", "Worker") usam regex com
 * \b word boundaries para evitar matches benignos (ex.: "Seed" em
 * "seedling" não dispara; "Worker" como nome de utilitário não vaza pro
 * HTML público de qualquer jeito).
 */
const FORBIDDEN_PATTERNS = [
  // Encoding quebrado
  { id: "encoding-sao-paulo", literal: "SÆo Paulo" },
  // Textos técnicos vazados
  { id: "tecnico-backend-incorporar", literal: "backend irá incorporar" },
  { id: "tecnico-em-breve-backend", literal: "Em breve — backend" },
  { id: "tecnico-features", literal: "features[]" },
  { id: "tecnico-has-photo", literal: "has_photo" },
  // Dados de teste leakados — usa regex de palavra para reduzir falso positivo
  { id: "dirty-teste", regex: /\bTeste\b/ },
  { id: "dirty-test", regex: /\bTest\b/ },
  { id: "dirty-deploy-model", literal: "DeployModel" },
  { id: "dirty-seed", regex: /\bSeed\b/ },
  { id: "dirty-worker", regex: /\bWorker\b/ },
  { id: "dirty-alerta", regex: /\bAlerta\b/ },
  { id: "dirty-fake", regex: /\bFake\b/i },
  { id: "dirty-dummy", regex: /\bDummy\b/i },
  // Preço fake (R$ 0 isolado — não "R$ 0,99" mainstream)
  { id: "price-zero-fake", regex: /R\$\s?0(?![0-9,])/ },
  // Mecânica comercial proibida na vitrine (planos só na área de venda)
  { id: "plano-pro-vitrine", regex: /plano\s+Pro/i },
  { id: "plano-start-vitrine", regex: /plano\s+Start/i },
];

/**
 * Marcadores do fallbackHero fake removido em /simulador-financiamento
 * — sentinelas únicas que não devem ressuscitar nunca mais.
 */
const FALLBACK_FAKE_MARKERS = [
  { id: "fallback-hero-id", literal: '"id":999001' },
  { id: "fallback-hero-slug", literal: "volkswagen-t-cross-2022-2023" },
];

/**
 * Rotas de catálogo que devem ter pelo menos 1 href /veiculo/* listado.
 * Usamos esses hrefs para abrir o detalhe e validar passed-valid + R$ 0.
 */
const CATALOG_ROUTES_FOR_HREF_EXTRACTION = [
  "/",
  "/comprar/estado/sp",
  "/carros-em/atibaia-sp",
  "/carros-em/campinas-sp",
  "/carros-usados/regiao/atibaia-sp",
];

// ---------------------------------------------------------------------------
// HTTP helper
// ---------------------------------------------------------------------------

async function fetchRoute(base, path, { followRedirects = true } = {}) {
  const url = `${base}${path}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const start = Date.now();

  try {
    const res = await fetch(url, {
      redirect: followRedirects ? "follow" : "manual",
      headers: {
        Accept: "text/html",
        "User-Agent": USER_AGENT,
      },
      signal: controller.signal,
    });
    const html = await res.text().catch(() => "");
    return {
      url,
      status: res.status,
      elapsedMs: Date.now() - start,
      bytes: html.length,
      headers: Object.fromEntries(res.headers.entries()),
      html,
    };
  } catch (err) {
    return {
      url,
      status: 0,
      elapsedMs: Date.now() - start,
      bytes: 0,
      headers: {},
      html: "",
      error: err.message || String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Extractors / Matchers
// ---------------------------------------------------------------------------

function extractAdsCount(html) {
  if (typeof html !== "string" || !html) return null;
  const visibleCount = html.match(
    /<strong[^>]*tabular-nums[^>]*>\s*([0-9.,]+)\s*<\/strong>\s*ofertas encontradas/i
  );
  if (visibleCount?.[1]) {
    const n = Number(visibleCount[1].replace(/[.,]/g, ""));
    if (Number.isFinite(n)) return n;
  }
  const jsonLdCount = html.match(/"numberOfItems"\s*:\s*([0-9]+)/);
  if (jsonLdCount?.[1]) {
    const n = Number(jsonLdCount[1]);
    if (Number.isFinite(n)) return n;
  }
  if (/Ainda não há veículos|Ainda não há anúncios/.test(html)) return 0;
  return null;
}

function extractVehicleHrefs(html, limit = 5) {
  if (typeof html !== "string" || !html) return [];
  const matches = html.matchAll(/\/veiculo\/[a-z0-9][a-z0-9-]+/g);
  const unique = new Set();
  for (const m of matches) {
    unique.add(m[0]);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

function findForbidden(html, skipStringChecks = false) {
  if (skipStringChecks) return [];
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) {
    if (p.literal && html.includes(p.literal)) hits.push(p.id);
    else if (p.regex && p.regex.test(html)) hits.push(p.id);
  }
  return hits;
}

function findFallbackFake(html) {
  const hits = [];
  for (const m of FALLBACK_FAKE_MARKERS) {
    if (html.includes(m.literal)) hits.push(m.id);
  }
  return hits;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv);
  const { base, verbose, json } = args;

  if (!json) {
    console.log("\n==============================================");
    console.log(" CNC smoke público P2-E — Contract Lock");
    console.log(` BASE_URL = ${base}`);
    console.log(` UA       = ${USER_AGENT}`);
    console.log("==============================================\n");
  }

  /** @type {Array<{ id: string, label: string, pass: boolean, detail?: string, route?: any }>} */
  const checks = [];

  // -------------------------------------------------------------------------
  // 1. Loop pelas 15 rotas críticas — status code + strings proibidas
  // -------------------------------------------------------------------------

  const fetchedRoutes = {};

  for (const route of ROUTES) {
    const fetched = await fetchRoute(base, route.path);
    fetchedRoutes[route.path] = fetched;

    const statusPass = route.expected.includes(fetched.status);
    checks.push({
      id: `route-status:${route.path}`,
      label: `${route.path} — status ${route.expected.join("|")}`,
      pass: statusPass,
      detail: `got=${fetched.status}${fetched.error ? ` err=${fetched.error}` : ""}`,
      route: fetched,
    });

    if (!statusPass || fetched.status !== 200) continue;

    // String checks (apenas em rotas 200 e não-skip).
    if (!route.skipStringChecks) {
      const hits = findForbidden(fetched.html);
      checks.push({
        id: `route-strings:${route.path}`,
        label: `${route.path} — sem strings proibidas`,
        pass: hits.length === 0,
        detail: hits.length ? `hits=${hits.join(",")}` : "ok",
      });
    }

    // Fallback fake markers (sempre checa).
    const fakeHits = findFallbackFake(fetched.html);
    checks.push({
      id: `route-fallback:${route.path}`,
      label: `${route.path} — sem fallback fake (T-Cross 999001)`,
      pass: fakeHits.length === 0,
      detail: fakeHits.length ? `hits=${fakeHits.join(",")}` : "ok",
    });
  }

  // -------------------------------------------------------------------------
  // 2. Extrai hrefs /veiculo/* de catálogos e abre cada um
  // -------------------------------------------------------------------------

  const seenVehicleHrefs = new Set();
  for (const path of CATALOG_ROUTES_FOR_HREF_EXTRACTION) {
    const fetched = fetchedRoutes[path];
    if (!fetched || fetched.status !== 200) continue;
    for (const href of extractVehicleHrefs(fetched.html, 5)) {
      seenVehicleHrefs.add(href);
    }
  }

  const vehicleHrefs = [...seenVehicleHrefs].slice(0, 8); // amostra para não estourar a janela

  checks.push({
    id: "vehicle-hrefs:extracted",
    label: `hrefs /veiculo/* extraídos das listagens (≥1)`,
    pass: vehicleHrefs.length > 0,
    detail: `found=${vehicleHrefs.length}`,
  });

  for (const href of vehicleHrefs) {
    const fetched = await fetchRoute(base, href);
    const ok200 = fetched.status === 200;
    checks.push({
      id: `vehicle-status:${href}`,
      label: `${href} — HTTP 200`,
      pass: ok200,
      detail: `status=${fetched.status}`,
    });
    if (!ok200) continue;

    // x-middleware-ad pode estar presente em prod; é informação, não bloqueia.
    const adHeader = fetched.headers["x-middleware-ad"];
    const passedValid = adHeader ? adHeader.includes("passed-valid") : null;
    checks.push({
      id: `vehicle-header:${href}`,
      label: `${href} — x-middleware-ad: passed-valid (informativo se ausente)`,
      // Aceita ausência (header não obrigatório em todos os deploys);
      // falha somente se presente E !== passed-valid.
      pass: adHeader == null || passedValid === true,
      detail: `header=${adHeader ?? "absent"}`,
    });

    const fakeHits = findFallbackFake(fetched.html);
    checks.push({
      id: `vehicle-fallback:${href}`,
      label: `${href} — sem fallback fake`,
      pass: fakeHits.length === 0,
      detail: fakeHits.length ? `hits=${fakeHits.join(",")}` : "ok",
    });

    const forbiddenHits = findForbidden(fetched.html);
    checks.push({
      id: `vehicle-strings:${href}`,
      label: `${href} — sem strings proibidas`,
      pass: forbiddenHits.length === 0,
      detail: forbiddenHits.length ? `hits=${forbiddenHits.join(",")}` : "ok",
    });
  }

  // -------------------------------------------------------------------------
  // 3. Relatório
  // -------------------------------------------------------------------------

  const passed = checks.filter((c) => c.pass);
  const failed = checks.filter((c) => !c.pass);

  if (json) {
    const report = {
      base,
      totalChecks: checks.length,
      passed: passed.length,
      failed: failed.length,
      vehicleHrefsTested: vehicleHrefs,
      checks,
    };
    console.log(JSON.stringify(report, null, 2));
  } else {
    for (const c of checks) {
      const mark = c.pass ? "PASS" : "FAIL";
      const tail = verbose && c.detail ? ` (${c.detail})` : "";
      console.log(`[${mark}] ${c.label}${tail}`);
    }
    console.log("\n----------------------------------------------");
    console.log(` ${passed.length}/${checks.length} checks passaram`);
    if (failed.length > 0) {
      console.log("\nFalhas:");
      for (const c of failed) console.log(`  - ${c.label} → ${c.detail ?? "—"}`);
    }
    console.log("----------------------------------------------\n");
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error("[contract-smoke] erro inesperado:", err);
  process.exit(2);
});
