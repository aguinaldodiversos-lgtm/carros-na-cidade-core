#!/usr/bin/env node
/**
 * smoke-territorial-routes.mjs
 *
 * Smoke test das 4 rotas territoriais públicas + regional inválida.
 * Criado em 2026-05-23 após bug de produção em que a Página Regional
 * (`/carros-usados/regiao/[slug]`) retornava "0 ofertas" mesmo com a
 * cidade-base tendo inventário. Raiz do bug: `countParams` do backend
 * arrastava um param que o countQuery não referenciava — corrigido em
 * `src/modules/ads/filters/ads-filter.builder.js`.
 *
 * Critérios (briefing 2026-05-23):
 *   1. /carros-em/atibaia-sp                      → 200 + ofertas > 0
 *   2. /carros-usados/regiao/atibaia-sp           → 200 + ofertas >= ofertas da Cidade
 *   3. /carros-usados/sp                          → 200 + ofertas > 0
 *   4. /carros-usados/regiao/<slug-invalido>      → 404 real (NÃO soft-200)
 *
 * Uso:
 *   node frontend/scripts/smoke-territorial-routes.mjs                 # prod (www.carrosnacidade.com)
 *   node frontend/scripts/smoke-territorial-routes.mjs --base=URL      # base custom
 *   node frontend/scripts/smoke-territorial-routes.mjs --city=foo-sp   # cidade-base alternativa
 *
 * Exit code 0 = todos os critérios passaram. Diferente de 0 = pelo menos um falhou.
 *
 * Não tem dependências externas — Node 20+ tem fetch built-in.
 */

const DEFAULT_BASE = "https://www.carrosnacidade.com";
const DEFAULT_CITY = "atibaia-sp";
const DEFAULT_UF = "sp";
const INVALID_REGIONAL_SLUG = "cidade-inexistente-zz";

function parseArgs(argv) {
  const args = { base: DEFAULT_BASE, city: DEFAULT_CITY, uf: DEFAULT_UF, verbose: false };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--base=")) args.base = raw.slice("--base=".length);
    else if (raw.startsWith("--city=")) args.city = raw.slice("--city=".length);
    else if (raw.startsWith("--uf=")) args.uf = raw.slice("--uf=".length);
    else if (raw === "-v" || raw === "--verbose") args.verbose = true;
  }
  args.base = args.base.replace(/\/+$/, "");
  return args;
}

/**
 * Conta as ofertas pela contagem renderizada em `<strong class="...
 * tabular-nums ...">N</strong> ofertas encontradas`. Esse marcador é
 * estável desde o refator de 2026-05-22 (CatalogResultsHeader).
 *
 * Fallback: tenta `"numberOfItems":N` do JSON-LD do ItemList. Se nada
 * casar, retorna null e o caller decide.
 */
function extractAdsCount(html) {
  if (typeof html !== "string") return null;

  const visibleCount = html.match(
    /<strong[^>]*tabular-nums[^>]*>\s*([0-9.,]+)\s*<\/strong>\s*ofertas encontradas/i
  );
  if (visibleCount && visibleCount[1]) {
    const n = Number(visibleCount[1].replace(/[.,]/g, ""));
    if (Number.isFinite(n)) return n;
  }

  const jsonLdCount = html.match(/"numberOfItems"\s*:\s*([0-9]+)/);
  if (jsonLdCount && jsonLdCount[1]) {
    const n = Number(jsonLdCount[1]);
    if (Number.isFinite(n)) return n;
  }

  // Sinal explícito de empty state — count efetivo = 0 sem ambiguidade.
  if (/Ainda não há veículos|Ainda não há anúncios/.test(html)) return 0;

  return null;
}

async function fetchRoute(base, path, { followRedirects = true } = {}) {
  const url = `${base}${path}`;
  const start = Date.now();
  const res = await fetch(url, {
    redirect: followRedirects ? "follow" : "manual",
    headers: {
      Accept: "text/html",
      "User-Agent": "cnc-smoke/1.0",
    },
  });
  const elapsedMs = Date.now() - start;
  const html = await res.text().catch(() => "");
  return {
    url,
    status: res.status,
    elapsedMs,
    bytes: html.length,
    count: extractAdsCount(html),
  };
}

function fmt(check, route) {
  const ok = check.pass ? "PASS" : "FAIL";
  const counter = route.count == null ? "n/a" : String(route.count);
  return `[${ok}] ${check.label.padEnd(48)} status=${route.status} count=${counter} time=${route.elapsedMs}ms`;
}

async function main() {
  const args = parseArgs(process.argv);
  const { base, city, uf, verbose } = args;

  console.log(`\nSmoke test territorial — base=${base}\n`);

  const cidadeRoute = await fetchRoute(base, `/carros-em/${city}`);
  const regionalRoute = await fetchRoute(base, `/carros-usados/regiao/${city}`);
  const estadualRoute = await fetchRoute(base, `/carros-usados/${uf}`);
  // followRedirects=false: queremos o status REAL retornado pelo
  // server para slug inexistente — não seguir Cloudflare/redirect.
  const invalidRoute = await fetchRoute(base, `/carros-usados/regiao/${INVALID_REGIONAL_SLUG}`, {
    followRedirects: false,
  });

  const checks = [
    {
      label: `cidade ${city} retorna 200 + ofertas > 0`,
      route: cidadeRoute,
      pass: cidadeRoute.status === 200 && (cidadeRoute.count ?? 0) > 0,
    },
    {
      label: `regional ${city} retorna 200 + ofertas > 0`,
      route: regionalRoute,
      pass: regionalRoute.status === 200 && (regionalRoute.count ?? 0) > 0,
    },
    {
      label: `regional ${city} >= cidade ${city} (contém ao menos a base)`,
      route: regionalRoute,
      pass:
        regionalRoute.status === 200 &&
        cidadeRoute.count != null &&
        regionalRoute.count != null &&
        regionalRoute.count >= cidadeRoute.count,
    },
    {
      label: `estadual ${uf.toUpperCase()} retorna 200 + ofertas > 0`,
      route: estadualRoute,
      pass: estadualRoute.status === 200 && (estadualRoute.count ?? 0) > 0,
    },
    {
      label: `regional inválida retorna 404 (não 200 soft-404)`,
      route: invalidRoute,
      pass: invalidRoute.status === 404,
    },
  ];

  for (const c of checks) console.log(fmt(c, c.route));

  if (verbose) {
    console.log("\nDetalhe das URLs testadas:");
    console.log(`  cidade:   ${cidadeRoute.url}`);
    console.log(`  regional: ${regionalRoute.url}`);
    console.log(`  estadual: ${estadualRoute.url}`);
    console.log(`  inválida: ${invalidRoute.url}`);
  }

  const failed = checks.filter((c) => !c.pass);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passaram.`);

  if (failed.length > 0) {
    console.error("\nFalhas:");
    for (const c of failed) console.error(`  - ${c.label}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error("[smoke] erro inesperado:", err);
  process.exit(2);
});
