#!/usr/bin/env node
/**
 * Smoke test do endpoint privado /api/internal/regions/:slug.
 *
 * Roda DEPOIS de:
 *   1. Migration 021 aplicada em prod.
 *   2. INTERNAL_API_TOKEN configurado no Render.
 *   3. seed:cities-geo executado (popula cities.lat/long).
 *   4. regions:build executado (popula region_memberships).
 *
 * Valida 4 cenários determinísticos:
 *   ✓ GET com token correto → 200 + shape { ok, data: { base, members[] } }
 *     com members.length >= 12 (cidade-base com vizinhança não-trivial),
 *     contendo entries em layer 1 E layer 2.
 *   ✓ GET sem token → 404 (anti-enumeração).
 *   ✓ GET com token errado → 404.
 *   ✓ GET com slug inexistente + token correto → 404 com ok=false.
 *
 * Uso:
 *   INTERNAL_API_TOKEN=xxx npm run smoke:regions
 *   INTERNAL_API_TOKEN=xxx API_BASE_URL=https://staging.example.com npm run smoke:regions
 *   INTERNAL_API_TOKEN=xxx node scripts/smoke-regions.mjs atibaia-sp
 *
 * Não tem dependências: usa fetch nativo (Node 20+). Não importa o pool do
 * projeto; pode rodar de qualquer máquina (laptop do operador, CI, etc.).
 *
 * Exit code: 0 se todos os checks passam, 1 se qualquer falha.
 */

const API_BASE_URL = (process.env.API_BASE_URL || "https://carros-na-cidade-core.onrender.com").replace(
  /\/+$/,
  ""
);
const TOKEN = process.env.INTERNAL_API_TOKEN || "";
const SLUG = process.argv[2] || "sao-paulo-sp";
const NONEXISTENT_SLUG = process.argv[3] || "cidade-que-nao-existe-tt";
const FETCH_TIMEOUT_MS = 15000;

if (!TOKEN) {
  console.error(
    "[smoke:regions] ERRO: INTERNAL_API_TOKEN não está no env.\n" +
      "Exporte o token (mesmo que está no Render) antes de rodar este smoke.\n" +
      "  export INTERNAL_API_TOKEN=$(openssl rand -hex 32)  # se for gerar agora\n" +
      "  INTERNAL_API_TOKEN=xxx node scripts/smoke-regions.mjs"
  );
  process.exit(1);
}

let passed = 0;
let failed = 0;
const failures = [];

function pass(label) {
  console.log(`✓ ${label}`);
  passed += 1;
}

function fail(label, detail) {
  console.error(`✗ ${label}`);
  if (detail) console.error(`    ${detail}`);
  failed += 1;
  failures.push({ label, detail });
}

async function fetchEndpoint({ slug, token, label }) {
  const url = `${API_BASE_URL}/api/internal/regions/${encodeURIComponent(slug)}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const headers = { Accept: "application/json" };
    if (token) headers["X-Internal-Token"] = token;

    const response = await fetch(url, { method: "GET", headers, signal: controller.signal });
    let body = null;
    try {
      body = await response.json();
    } catch {
      // Resposta sem JSON parseável (ex.: HTML de erro do edge cache).
    }
    return { status: response.status, body };
  } catch (err) {
    return { status: 0, body: null, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function checkValidTokenAndSlug() {
  const label = `GET /api/internal/regions/${SLUG} com token correto → 200 + members não-trivial`;
  const result = await fetchEndpoint({ slug: SLUG, token: TOKEN });

  if (result.status === 0) {
    fail(label, `Erro de rede: ${result.error}`);
    return;
  }
  if (result.status !== 200) {
    fail(label, `Status ${result.status}, esperado 200. Body: ${JSON.stringify(result.body)}`);
    return;
  }
  if (!result.body || result.body.ok !== true || !result.body.data) {
    fail(label, `Shape inválido: ${JSON.stringify(result.body)}`);
    return;
  }
  const { base, members } = result.body.data;
  if (!base || base.slug !== SLUG) {
    fail(label, `data.base.slug deveria ser "${SLUG}", veio: ${JSON.stringify(base)}`);
    return;
  }
  if (!Array.isArray(members)) {
    fail(label, `data.members não é array: ${typeof members}`);
    return;
  }
  if (members.length < 12) {
    fail(
      label,
      `data.members.length=${members.length}; esperado >= 12. Indica que regions:build não rodou ou cidade-base sem vizinhança.`
    );
    return;
  }
  const hasLayer1 = members.some((m) => Number(m.layer) === 1);
  const hasLayer2 = members.some((m) => Number(m.layer) === 2);
  if (!hasLayer1) {
    fail(label, `Nenhum membro em layer 1 (≤30 km). Indica raio mal calibrado ou worker incompleto.`);
    return;
  }
  if (!hasLayer2) {
    fail(label, `Nenhum membro em layer 2 (30-60 km).`);
    return;
  }
  // Self-row layer 0 NÃO pode aparecer em members (semântica do service).
  if (members.some((m) => m.slug === SLUG)) {
    fail(label, `Self-row (slug=${SLUG}) apareceu em members; service deveria excluir.`);
    return;
  }
  pass(`${label} (members.length=${members.length}, layer 1+2 presentes)`);
}

async function checkNoToken() {
  const label = `GET /api/internal/regions/${SLUG} SEM token → 404 (anti-enumeração)`;
  const result = await fetchEndpoint({ slug: SLUG, token: "" });
  if (result.status === 404) pass(label);
  else fail(label, `Status ${result.status}, esperado 404.`);
}

async function checkWrongToken() {
  const label = `GET /api/internal/regions/${SLUG} com token errado → 404`;
  const result = await fetchEndpoint({ slug: SLUG, token: "wrong-token-deliberadamente-invalido" });
  if (result.status === 404) pass(label);
  else fail(label, `Status ${result.status}, esperado 404.`);
}

async function checkSlugNaoExiste() {
  const label = `GET /api/internal/regions/${NONEXISTENT_SLUG} com token correto → 404`;
  const result = await fetchEndpoint({ slug: NONEXISTENT_SLUG, token: TOKEN });
  if (result.status !== 404) {
    fail(label, `Status ${result.status}, esperado 404.`);
    return;
  }
  if (!result.body || result.body.ok !== false) {
    fail(label, `Esperado body { ok: false, error: ... }. Veio: ${JSON.stringify(result.body)}`);
    return;
  }
  pass(label);
}

async function main() {
  console.log(`[smoke:regions] API_BASE_URL=${API_BASE_URL}`);
  console.log(`[smoke:regions] slug=${SLUG} (slug-inexistente=${NONEXISTENT_SLUG})`);
  console.log("");

  await checkValidTokenAndSlug();
  await checkNoToken();
  await checkWrongToken();
  await checkSlugNaoExiste();

  console.log("");
  console.log(`Resumo: ${passed}/${passed + failed} passaram.`);

  if (failed > 0) {
    console.error(`\nFalhas:`);
    for (const f of failures) {
      console.error(`  - ${f.label}`);
      if (f.detail) console.error(`    ${f.detail}`);
    }
    process.exit(1);
  }

  console.log("OK — endpoint regional saudável.");
}

main().catch((err) => {
  console.error("[smoke:regions] erro inesperado:", err?.stack || err);
  process.exit(1);
});
