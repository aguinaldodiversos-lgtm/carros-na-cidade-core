#!/usr/bin/env node
/**
 * Smoke HTTP nacional: valida que a arquitetura regional é universal e
 * cobre os 27 UFs do Brasil.
 *
 * Estratégia:
 *   - Uma cidade por UF (capital ou polo, validada contra DB).
 *   - 4 cidades adicionais FORA da lista curada (sumare-sp, ipatinga-mg,
 *     barreiras-ba, guarapuava-pr) — prova que cobertura ≠ destaque.
 *   - GET /carros-usados/regiao/{slug} → espera 200 com middleware
 *     `passed-valid`.
 *   - GET /carros-usados/regiao/{slugFake} → espera 404 com middleware
 *     `blocked-slug-invalid`.
 *
 * Uso:
 *   STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
 *     node scripts/smoke-regions-national.mjs
 *
 *   ALLOW_PRODUCTION=true \
 *     STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-portal.onrender.com \
 *     node scripts/smoke-regions-national.mjs
 *
 * Exit code: 0 se tudo passa, 1 se qualquer falha.
 */

import "dotenv/config";

const FETCH_TIMEOUT_MS = 25_000;

// 27 cidades, uma por UF — capitais (cobertura nacional explícita).
const NATIONAL_CAPITALS = [
  "rio-branco-ac",
  "maceio-al",
  "manaus-am",
  "macapa-ap",
  "salvador-ba",
  "fortaleza-ce",
  "brasilia-df",
  "vitoria-es",
  "goiania-go",
  "sao-luis-ma",
  "belo-horizonte-mg",
  "campo-grande-ms",
  "cuiaba-mt",
  "belem-pa",
  "joao-pessoa-pb",
  "recife-pe",
  "teresina-pi",
  "curitiba-pr",
  "rio-de-janeiro-rj",
  "natal-rn",
  "porto-velho-ro",
  "boa-vista-rr",
  "porto-alegre-rs",
  "florianopolis-sc",
  "aracaju-se",
  "sao-paulo-sp",
  "palmas-to",
];

// 4 cidades FORA da lista de destaque — prova que cobertura é nacional.
const CITIES_OUTSIDE_CURATED = ["sumare-sp", "ipatinga-mg", "barreiras-ba", "guarapuava-pr"];

const FAKE_SLUG = "cidade-que-nao-existe-zz";

const FRONTEND_BASE = (
  process.env.STAGING_PUBLIC_BASE_URL ||
  process.env.SMOKE_BASE_URL ||
  ""
).replace(/\/+$/, "");
const ALLOW_PRODUCTION = process.env.ALLOW_PRODUCTION === "true";

if (!FRONTEND_BASE) {
  console.error("ERRO: STAGING_PUBLIC_BASE_URL não definido.");
  process.exit(1);
}

const isProductionHost =
  !FRONTEND_BASE.includes("staging") &&
  !FRONTEND_BASE.includes("localhost") &&
  !FRONTEND_BASE.includes("preview");
if (isProductionHost && !ALLOW_PRODUCTION) {
  console.error(
    `ERRO: ${FRONTEND_BASE} parece ser produção. Use ALLOW_PRODUCTION=true para confirmar.`
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  console.log(`  PASS  ${label}`);
  passed += 1;
}
function fail(label, detail) {
  console.error(`  FAIL  ${label} — ${detail || ""}`);
  failed += 1;
  failures.push({ label, detail });
}

async function fetchStatus(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html" },
      redirect: "manual",
      signal: controller.signal,
    });
    return {
      status: response.status,
      mw: response.headers.get("x-middleware-regional") || "",
    };
  } catch (err) {
    return { status: 0, error: err?.message || String(err) };
  } finally {
    clearTimeout(timer);
  }
}

async function checkRegional(slug, { expectStatus, expectMw }) {
  const url = `${FRONTEND_BASE}/carros-usados/regiao/${encodeURIComponent(slug)}`;
  const result = await fetchStatus(url);
  if (result.status === 0) {
    fail(`[${slug}] rede`, result.error);
    return;
  }
  if (result.status !== expectStatus) {
    fail(`[${slug}]`, `status ${result.status} (esperado ${expectStatus}), mw=${result.mw}`);
    return;
  }
  if (expectMw && result.mw !== expectMw) {
    fail(`[${slug}]`, `mw=${result.mw} (esperado ${expectMw})`);
    return;
  }
  pass(`[${slug}] ${result.status} mw=${result.mw}`);
}

async function main() {
  console.log(`[smoke:national] FRONTEND_BASE=${FRONTEND_BASE}`);
  console.log("");

  console.log("== 1. Cobertura nacional: capitais dos 27 UFs ==");
  for (const slug of NATIONAL_CAPITALS) {
    await checkRegional(slug, { expectStatus: 200, expectMw: "passed-valid" });
  }

  console.log("");
  console.log("== 2. Cidades FORA da curadoria — prova destaque ≠ cobertura ==");
  for (const slug of CITIES_OUTSIDE_CURATED) {
    await checkRegional(slug, { expectStatus: 200, expectMw: "passed-valid" });
  }

  console.log("");
  console.log("== 3. Slug fake → 404 (gate funcional) ==");
  await checkRegional(FAKE_SLUG, {
    expectStatus: 404,
    expectMw: "blocked-slug-invalid",
  });

  console.log("");
  console.log(`Resumo: ${passed}/${passed + failed} checks passaram.`);
  if (failed > 0) {
    console.error("\nFalhas:");
    for (const f of failures) {
      console.error(`  - ${f.label}: ${f.detail}`);
    }
    process.exit(1);
  }
  console.log("OK — Cobertura regional nacional saudável.");
}

main().catch((err) => {
  console.error("[smoke:national] erro inesperado:", err?.stack || err);
  process.exit(1);
});
