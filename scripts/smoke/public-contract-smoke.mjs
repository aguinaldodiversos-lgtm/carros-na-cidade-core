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
 *   node scripts/smoke/public-contract-smoke.mjs --verbose             # detalhe em todas as checks
 *   node scripts/smoke/public-contract-smoke.mjs --json                # report machine-readable
 *   node scripts/smoke/public-contract-smoke.mjs --github              # emite annotations (::error::, ::group::) — usado pelo workflow agendado
 *
 * Env equivalente (para GH Actions / cron):
 *   BASE_URL          base custom (alternativa a --base)
 *   SMOKE_GITHUB=1    equivalente a --github
 *   SMOKE_VERBOSE=1   equivalente a --verbose
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
  const args = {
    base: process.env.BASE_URL || DEFAULT_BASE,
    verbose: process.env.SMOKE_VERBOSE === "1",
    json: false,
    github: process.env.SMOKE_GITHUB === "1" || process.env.GITHUB_ACTIONS === "true",
  };
  for (const raw of argv.slice(2)) {
    if (raw.startsWith("--base=")) args.base = raw.slice("--base=".length);
    else if (raw === "-v" || raw === "--verbose") args.verbose = true;
    else if (raw === "--json") args.json = true;
    else if (raw === "--github") args.github = true;
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
/**
 * Rotas críticas e o status esperado. `must200=false` aceita 200 OU 404
 * conforme a rota — para rotas com flag opcional (ex.: regional pode estar
 * desativada por env, retornando 404 by design).
 *
 * `expectCityName` (opcional): quando a rota carrega cidade no path,
 * o HTML deve mencionar o nome dessa cidade. Bug de regressão antigo:
 * `/carros-em/atibaia-sp` renderizando "Carros usados em São Paulo"
 * porque o SSR caía no default territorial. Catch direto via heurística.
 *
 * `forbidCityInTitle` (opcional): cidades cuja PRESENÇA no `<title>` é
 * sinal de fallback indevido. Ex.: `/carros-em/atibaia-sp` com title
 * contendo "São Paulo" sem antes mencionar Atibaia → fail.
 */
const ROUTES = [
  { path: "/", expected: [200], extractAds: true },
  { path: "/comprar/estado/sp", expected: [200], extractAds: true },
  {
    path: "/carros-em/atibaia-sp",
    expected: [200],
    extractAds: true,
    expectCityName: "Atibaia",
    forbidCityInTitle: "São Paulo",
  },
  {
    path: "/carros-em/campinas-sp",
    expected: [200],
    extractAds: true,
    expectCityName: "Campinas",
    forbidCityInTitle: "São Paulo",
  },
  {
    path: "/carros-usados/regiao/atibaia-sp",
    expected: [200, 404],
    extractAds: true,
    expectCityName: "Atibaia",
    forbidCityInTitle: "São Paulo",
  },
  {
    path: "/carros-usados/regiao/campinas-sp",
    expected: [200, 404],
    extractAds: true,
    expectCityName: "Campinas",
    forbidCityInTitle: "São Paulo",
  },
  { path: "/veiculo/anuncio-inexistente-xyz-999", expected: [404], skipStringChecks: true },
  { path: "/anuncios/slug-fantasma", expected: [404], skipStringChecks: true },
  { path: "/simulador-financiamento", expected: [200] },
  { path: "/simulador-financiamento/sao-paulo-sp", expected: [200], expectCityName: "São Paulo" },
  {
    path: "/simulador-financiamento/atibaia-sp",
    expected: [200],
    expectCityName: "Atibaia",
    forbidCityInTitle: "São Paulo",
  },
  { path: "/tabela-fipe", expected: [200] },
  { path: "/tabela-fipe/sao-paulo-sp", expected: [200], expectCityName: "São Paulo" },
  {
    path: "/tabela-fipe/atibaia-sp",
    expected: [200],
    expectCityName: "Atibaia",
    forbidCityInTitle: "São Paulo",
  },
  { path: "/anunciar", expected: [200] },
  // P3-C/Lojas 2026-05-25 — loja inexistente deve 404 real (mesma
  // garantia que /veiculo/<inexistente>). Slug obviamente fake.
  { path: "/lojas/loja-inexistente-smoke-zz", expected: [404], skipStringChecks: true },
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

/**
 * Extrai hrefs `/lojas/[slug]` (PLURAL — rota nova 2026-05-25). Usado
 * para descobrir lojas reais a partir do card do dealer no detalhe do
 * veículo. Smoke valida que cada loja responde 200 + tem ao menos um
 * card de anúncio válido.
 */
function extractDealerHrefs(html, limit = 3) {
  if (typeof html !== "string" || !html) return [];
  // Regex aceita slug com letras minúsculas, dígitos e hifens.
  // `/lojas/` (plural) — não confundir com `/loja/[slug]` legado que
  // ainda pode existir em HTML cacheado durante a transição.
  const matches = html.matchAll(/\/lojas\/[a-z0-9][a-z0-9-]+/g);
  const unique = new Set();
  for (const m of matches) {
    unique.add(m[0]);
    if (unique.size >= limit) break;
  }
  return [...unique];
}

/**
 * Para cada padrão, devolve `{ id, snippet }` quando casar. O snippet é
 * o trecho de até 160 caracteres em volta da primeira match — útil para
 * o operador entender em que contexto a string proibida apareceu (ex.:
 * "Teste" em um nome de loja ≠ "Teste" em um banner de feature gate).
 */
function findForbidden(html, skipStringChecks = false) {
  if (skipStringChecks) return [];
  const hits = [];
  for (const p of FORBIDDEN_PATTERNS) {
    const idx = p.literal
      ? html.indexOf(p.literal)
      : (() => {
          const m = p.regex.exec(html);
          return m ? m.index : -1;
        })();
    if (idx >= 0) {
      hits.push({ id: p.id, snippet: extractSnippet(html, idx, p.literal?.length ?? 16) });
    }
  }
  return hits;
}

function findFallbackFake(html) {
  const hits = [];
  for (const m of FALLBACK_FAKE_MARKERS) {
    const idx = html.indexOf(m.literal);
    if (idx >= 0) {
      hits.push({ id: m.id, snippet: extractSnippet(html, idx, m.literal.length) });
    }
  }
  return hits;
}

/** Recorta `html` em torno de `idx` com contexto, retornando texto safe-to-log. */
function extractSnippet(html, idx, matchLen, context = 60) {
  if (!html || idx < 0) return "";
  const start = Math.max(0, idx - context);
  const end = Math.min(html.length, idx + matchLen + context);
  const raw = html.slice(start, end);
  // Limpa whitespace excessivo e trunca para uma linha.
  return raw.replace(/\s+/g, " ").trim().slice(0, 200);
}

/**
 * Detecta soft-404: rota /veiculo/* respondendo 200 mas com texto de
 * NotFound no body visível.
 *
 * Importante: o App Router (Next 14) serializa a árvore inteira no
 * payload Flight (incluindo o not-found.tsx que vive como overlay
 * potencial). Procurar no HTML cru gera falso positivo em TODAS as
 * páginas. Aqui:
 *   1. Removemos `<script>...</script>` (onde mora o Flight payload).
 *   2. Procuramos apenas em `<title>` e `<h1>` do corpo visível.
 * Assim só dispara quando o usuário REALMENTE vê "Veículo não encontrado"
 * — que é o bug a impedir.
 */
function isSoft404(html) {
  if (typeof html !== "string" || !html) return false;
  const visible = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");
  const title = visible.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "";
  const headings = (visible.match(/<h[1-2][^>]*>([\s\S]*?)<\/h[1-2]>/gi) || [])
    .map((m) => m.replace(/<[^>]+>/g, ""))
    .join(" | ");
  const candidates = `${title} ${headings}`;
  return /Ve[ií]culo n[ãa]o encontrado|an[uú]ncio (?:n[ãa]o encontrado|inexistente)/i.test(
    candidates
  );
}

/** Verifica se o `<title>` da página menciona uma cidade indesejada antes da esperada. */
function titleHasWrongCity(html, expectedCity, forbiddenCity) {
  if (!forbiddenCity) return false;
  const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title = titleMatch?.[1] || "";
  if (!title) return false;
  if (!title.includes(forbiddenCity)) return false;
  // Se o title menciona a cidade esperada antes da forbidden, ok (ex.:
  // breadcrumb "São Paulo > Atibaia > ...").
  if (expectedCity && title.indexOf(expectedCity) >= 0) {
    return title.indexOf(expectedCity) > title.indexOf(forbiddenCity);
  }
  return true;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

/**
 * Encoda string para uso seguro em annotations `::error::` do GitHub
 * (que tratam `%` e `:` como tokens de propriedade).
 */
function ghEscape(value) {
  return String(value)
    .replace(/%/g, "%25")
    .replace(/\r/g, "%0D")
    .replace(/\n/g, "%0A")
    .replace(/:/g, "%3A")
    .replace(/,/g, "%2C");
}

/** Formata o detail estendido (motivo + status + snippet quando aplicável). */
function buildDetail({ reason, status, hits, snippet, extra }) {
  const parts = [];
  if (reason) parts.push(`reason=${reason}`);
  if (status != null) parts.push(`status=${status}`);
  if (hits && hits.length) parts.push(`hits=${hits.map((h) => h.id).join(",")}`);
  if (snippet) parts.push(`snippet=${JSON.stringify(snippet)}`);
  if (extra) parts.push(extra);
  return parts.join(" ");
}

async function main() {
  const args = parseArgs(process.argv);
  const { base, verbose, json, github } = args;

  if (!json) {
    console.log("\n==============================================");
    console.log(" CNC smoke público — Contract Lock (P3-A)");
    console.log(` BASE_URL = ${base}`);
    console.log(` UA       = ${USER_AGENT}`);
    console.log(` MODE     = ${github ? "github" : "plain"}`);
    console.log("==============================================\n");
  }

  /** @type {Array<{ id: string, label: string, pass: boolean, detail?: string, severity?: "critical"|"warn" }>} */
  const checks = [];

  // -------------------------------------------------------------------------
  // 1. Loop pelas 15 rotas críticas
  // -------------------------------------------------------------------------

  const fetchedRoutes = {};

  for (const route of ROUTES) {
    const fetched = await fetchRoute(base, route.path);
    fetchedRoutes[route.path] = fetched;

    // 1.a — status code esperado
    const statusPass = route.expected.includes(fetched.status);
    checks.push({
      id: `route-status:${route.path}`,
      label: `${route.path} — status ${route.expected.join("|")}`,
      pass: statusPass,
      severity: "critical",
      detail: buildDetail({
        reason: statusPass ? "status-ok" : "status-mismatch",
        status: fetched.status,
        extra: fetched.error ? `err=${fetched.error}` : null,
      }),
    });

    if (!statusPass || fetched.status !== 200) continue;

    // 1.b — strings proibidas (com snippet)
    if (!route.skipStringChecks) {
      const hits = findForbidden(fetched.html);
      checks.push({
        id: `route-strings:${route.path}`,
        label: `${route.path} — sem strings proibidas`,
        pass: hits.length === 0,
        severity: "critical",
        detail: hits.length
          ? buildDetail({
              reason: "forbidden-string",
              hits,
              snippet: hits[0].snippet,
            })
          : "ok",
      });
    }

    // 1.c — fallback fake (T-Cross 999001) sempre
    const fakeHits = findFallbackFake(fetched.html);
    checks.push({
      id: `route-fallback:${route.path}`,
      label: `${route.path} — sem fallback fake (T-Cross 999001)`,
      pass: fakeHits.length === 0,
      severity: "critical",
      detail: fakeHits.length
        ? buildDetail({
            reason: "fallback-fake",
            hits: fakeHits,
            snippet: fakeHits[0].snippet,
          })
        : "ok",
    });

    // 1.d — cidade esperada presente no HTML (rotas territoriais)
    if (route.expectCityName) {
      const has = fetched.html.includes(route.expectCityName);
      checks.push({
        id: `route-city-expected:${route.path}`,
        label: `${route.path} — body menciona "${route.expectCityName}"`,
        pass: has,
        severity: "critical",
        detail: has
          ? "ok"
          : buildDetail({
              reason: "expected-city-missing",
              extra: `city=${route.expectCityName}`,
            }),
      });
    }

    // 1.e — cidade indevida no <title> (ex.: title de /carros-em/atibaia
    //       mencionando "São Paulo" antes de "Atibaia")
    if (route.forbidCityInTitle) {
      const wrong = titleHasWrongCity(
        fetched.html,
        route.expectCityName,
        route.forbidCityInTitle
      );
      checks.push({
        id: `route-city-title:${route.path}`,
        label: `${route.path} — <title> sem "${route.forbidCityInTitle}" hardcoded`,
        pass: !wrong,
        severity: "critical",
        detail: wrong
          ? buildDetail({
              reason: "city-hardcoded-in-title",
              snippet: (fetched.html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1] || "").slice(
                0,
                200
              ),
            })
          : "ok",
      });
    }
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
    severity: "critical",
    detail: `found=${vehicleHrefs.length}`,
  });

  // Guarda HTMLs dos detalhes para extrair hrefs `/lojas/*` na seção 3.
  const vehicleDetailHtmls = [];

  for (const href of vehicleHrefs) {
    const fetched = await fetchRoute(base, href);
    const ok200 = fetched.status === 200;
    checks.push({
      id: `vehicle-status:${href}`,
      label: `${href} — HTTP 200`,
      pass: ok200,
      severity: "critical",
      detail: buildDetail({
        reason: ok200 ? "status-ok" : "status-mismatch",
        status: fetched.status,
        extra: fetched.error ? `err=${fetched.error}` : null,
      }),
    });
    if (!ok200) continue;

    vehicleDetailHtmls.push(fetched.html);

    // x-middleware-ad: passed-valid OBRIGATÓRIO em anúncio real (P3-A 2026-05-25):
    // anúncio extraído de catálogo é um anúncio que o backend considera
    // válido. O middleware deve ter marcado passed-valid antes do SSR
    // renderizar. Ausência sinaliza que o middleware NÃO rodou no path
    // (rewrite/cache stale) — fail crítico.
    const adHeader = fetched.headers["x-middleware-ad"];
    const passedValid = typeof adHeader === "string" && adHeader.includes("passed-valid");
    checks.push({
      id: `vehicle-header:${href}`,
      label: `${href} — x-middleware-ad: passed-valid`,
      pass: passedValid,
      severity: "critical",
      detail: passedValid
        ? `header=${adHeader}`
        : buildDetail({
            reason: adHeader == null ? "header-absent" : "header-wrong-value",
            extra: `header=${adHeader ?? "absent"}`,
          }),
    });

    // Soft-404: HTTP 200 + corpo "Veículo não encontrado" = bug
    const soft404 = isSoft404(fetched.html);
    checks.push({
      id: `vehicle-soft404:${href}`,
      label: `${href} — sem "Veículo não encontrado" em 200`,
      pass: !soft404,
      severity: "critical",
      detail: soft404
        ? buildDetail({
            reason: "soft-404-on-200",
            snippet:
              (fetched.html
                .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "")
                .match(/<(?:title|h1|h2)[^>]*>[^<]*Ve[ií]culo n[ãa]o encontrado[^<]*<\/(?:title|h1|h2)>/i) ||
                [])[0],
          })
        : "ok",
    });

    const fakeHits = findFallbackFake(fetched.html);
    checks.push({
      id: `vehicle-fallback:${href}`,
      label: `${href} — sem fallback fake`,
      pass: fakeHits.length === 0,
      severity: "critical",
      detail: fakeHits.length
        ? buildDetail({
            reason: "fallback-fake",
            hits: fakeHits,
            snippet: fakeHits[0].snippet,
          })
        : "ok",
    });

    const forbiddenHits = findForbidden(fetched.html);
    checks.push({
      id: `vehicle-strings:${href}`,
      label: `${href} — sem strings proibidas`,
      pass: forbiddenHits.length === 0,
      severity: "critical",
      detail: forbiddenHits.length
        ? buildDetail({
            reason: "forbidden-string",
            hits: forbiddenHits,
            snippet: forbiddenHits[0].snippet,
          })
        : "ok",
    });
  }

  // -------------------------------------------------------------------------
  // 3. Extrai hrefs /lojas/* dos detalhes (card de loja parceira) e valida
  //    cada loja real: 200, sem strings proibidas, com ao menos 1 href de
  //    veículo (anúncio listado ou empty state honesto). Briefing Lojas
  //    Públicas 2026-05-25.
  // -------------------------------------------------------------------------

  const seenDealerHrefs = new Set();
  for (const html of vehicleDetailHtmls) {
    for (const href of extractDealerHrefs(html, 3)) {
      seenDealerHrefs.add(href);
    }
  }

  const dealerHrefs = [...seenDealerHrefs].slice(0, 4);

  if (dealerHrefs.length > 0) {
    for (const href of dealerHrefs) {
      const fetched = await fetchRoute(base, href);
      const ok200 = fetched.status === 200;
      checks.push({
        id: `dealer-status:${href}`,
        label: `${href} — HTTP 200 (loja real)`,
        pass: ok200,
        severity: "critical",
        detail: buildDetail({
          reason: ok200 ? "status-ok" : "status-mismatch",
          status: fetched.status,
          extra: fetched.error ? `err=${fetched.error}` : null,
        }),
      });
      if (!ok200) continue;

      const fakeHits = findFallbackFake(fetched.html);
      checks.push({
        id: `dealer-fallback:${href}`,
        label: `${href} — sem fallback fake`,
        pass: fakeHits.length === 0,
        severity: "critical",
        detail: fakeHits.length
          ? buildDetail({
              reason: "fallback-fake",
              hits: fakeHits,
              snippet: fakeHits[0].snippet,
            })
          : "ok",
      });

      const forbiddenHits = findForbidden(fetched.html);
      checks.push({
        id: `dealer-strings:${href}`,
        label: `${href} — sem strings proibidas`,
        pass: forbiddenHits.length === 0,
        severity: "critical",
        detail: forbiddenHits.length
          ? buildDetail({
              reason: "forbidden-string",
              hits: forbiddenHits,
              snippet: forbiddenHits[0].snippet,
            })
          : "ok",
      });

      // Briefing Lojas Públicas 2026-05-25: cada anúncio listado na loja
      // deve apontar para /veiculo/<slug> válido (≥1 quando há estoque).
      // Empty state honesto (sem anúncios) também é ok — detecta pela
      // copy do buildEmptyStateCopy("dealer-no-ads").
      const adHrefs = extractVehicleHrefs(fetched.html, 2);
      const hasEmpty = /Sem an[uú]ncios ativos|ainda n[ãa]o tem an[uú]ncios ativos/i.test(
        fetched.html
      );
      checks.push({
        id: `dealer-ads-shape:${href}`,
        label: `${href} — tem ≥1 href /veiculo/* OU empty state honesto`,
        pass: adHrefs.length > 0 || hasEmpty,
        severity: "critical",
        detail:
          adHrefs.length > 0
            ? `vehicleHrefs=${adHrefs.length}`
            : hasEmpty
              ? "empty-state-ok"
              : buildDetail({
                  reason: "dealer-without-ads-and-without-empty-state",
                  snippet: "(no /veiculo/* links and no recognized empty-state copy)",
                }),
      });
    }
  } else {
    // Não bloqueia: prod pode estar sem dealer real no momento; sinaliza
    // como warn-only (severity warn) — falha "soft" sem subir exit code.
    // Documenta no log que não houve dealer real para validar.
    checks.push({
      id: "dealer-hrefs:none-extracted",
      label: "nenhum href /lojas/* extraído dos detalhes (warn)",
      pass: true, // pass=true para não falhar o job; o detalhe documenta
      severity: "warn",
      detail: "warn: no dealer found in vehicle detail pages (sample size limit)",
    });
  }

  // -------------------------------------------------------------------------
  // 4. Relatório
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
    if (github) console.log("::group::Smoke checks");
    for (const c of checks) {
      const mark = c.pass ? "PASS" : "FAIL";
      // FAIL sempre mostra detail; PASS só com --verbose
      const tail = c.pass ? (verbose && c.detail ? ` (${c.detail})` : "") : ` (${c.detail ?? "—"})`;
      console.log(`[${mark}] ${c.label}${tail}`);
    }
    if (github) console.log("::endgroup::");

    console.log("\n----------------------------------------------");
    console.log(` ${passed.length}/${checks.length} checks passaram`);
    if (failed.length > 0) {
      console.log("\nFalhas:");
      for (const c of failed) {
        console.log(`  - ${c.label} → ${c.detail ?? "—"}`);
        if (github) {
          const message = `${c.label}\n${c.detail ?? ""}`;
          console.log(
            `::error title=public-contract-smoke FAIL::${ghEscape(message)}`
          );
        }
      }
    }
    console.log("----------------------------------------------\n");

    if (github) {
      // GitHub job summary (markdown) — fica linkado no run.
      const summaryPath = process.env.GITHUB_STEP_SUMMARY;
      if (summaryPath) {
        const md = buildJobSummary({ base, checks, passed, failed, vehicleHrefs });
        try {
          const fs = await import("node:fs/promises");
          await fs.appendFile(summaryPath, md);
        } catch (err) {
          console.warn("[smoke] falha ao escrever GITHUB_STEP_SUMMARY:", err.message);
        }
      }
    }
  }

  process.exit(failed.length > 0 ? 1 : 0);
}

function buildJobSummary({ base, checks, passed, failed, vehicleHrefs }) {
  const lines = [];
  lines.push(`## Smoke público — ${failed.length === 0 ? "✅" : "❌"} ${passed.length}/${checks.length}`);
  lines.push("");
  lines.push(`**Base:** \`${base}\``);
  lines.push(`**Hrefs /veiculo/* abertos:** ${vehicleHrefs.length}`);
  lines.push("");
  if (failed.length > 0) {
    lines.push("### Falhas críticas");
    lines.push("");
    lines.push("| # | Check | Detalhe |");
    lines.push("|---|-------|---------|");
    for (let i = 0; i < failed.length; i++) {
      const c = failed[i];
      const detail = String(c.detail ?? "—").replace(/\|/g, "\\|");
      lines.push(`| ${i + 1} | ${c.label.replace(/\|/g, "\\|")} | ${detail} |`);
    }
    lines.push("");
  } else {
    lines.push("Nenhuma falha. Todas as checks críticas passaram.");
    lines.push("");
  }
  return lines.join("\n") + "\n";
}

main().catch((err) => {
  console.error("[contract-smoke] erro inesperado:", err);
  process.exit(2);
});
