#!/usr/bin/env node
/**
 * Smoke HTTP da Página Regional pública (`/carros-usados/regiao/[slug]`).
 *
 * Complementar ao `smoke-regions.mjs` (que valida o endpoint privado
 * `/api/internal/regions/:slug`). Este script valida a rota PÚBLICA
 * server-rendered: status, robots, canonical, conteúdo essencial,
 * presença de anúncios ou fallback, e (opcionalmente) o endpoint admin
 * de configuração do raio.
 *
 * Uso típico (Fase B do runbook regional-page-rollout):
 *
 *   STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-staging.onrender.com \
 *     npm run smoke:regional-page
 *
 * Variáveis aceitas:
 *
 *   STAGING_PUBLIC_BASE_URL  base URL do frontend de staging (obrigatória,
 *                            a menos que SMOKE_BASE_URL seja usada).
 *   SMOKE_BASE_URL           alias / fallback. Se ambos definidos,
 *                            STAGING_PUBLIC_BASE_URL ganha.
 *   STAGING_BASE_URL         base URL do BACKEND de staging (opcional;
 *                            usada APENAS pelo step admin se credenciais
 *                            estiverem presentes).
 *   REGIONAL_SMOKE_SLUGS     CSV de slugs a validar; default
 *                            "atibaia-sp,campinas-sp,sao-paulo-sp".
 *   EXPECT_FLAG              "on" (default) ou "off". Em "off", o smoke
 *                            espera que /carros-usados/regiao/[slug]
 *                            retorne 404 (flag desligada) e pula os
 *                            checks de conteúdo. Útil para validar que
 *                            o gate funciona antes/depois de ligar.
 *   STAGING_ADMIN_EMAIL      opcional; só dispara o check admin GET
 *                            quando presente junto de STAGING_ADMIN_PASSWORD.
 *   STAGING_ADMIN_PASSWORD   ver acima.
 *   STAGING_ALLOW_PATCH      "true" libera o check PATCH do admin radius
 *                            (rebate de volta ao valor original ao final).
 *                            Sem isso, só GET é feito. Default: false.
 *   ALLOW_PRODUCTION         libera execução contra um host fora da
 *                            allowlist (staging/preview/review/localhost).
 *                            Caso de uso oficial: ativação controlada
 *                            em produção sem staging separado, conforme
 *                            `docs/runbooks/regional-page-production-controlled-rollout.md`.
 *                            Sempre combinar com `EXPECT_FLAG=off` antes
 *                            de ligar a flag e `EXPECT_FLAG=on` depois.
 *                            Default: false.
 *
 * Sem dependências de runtime. Usa apenas fetch nativo (Node 20+).
 *
 * Exit code: 0 se todos os checks PASS; 1 se qualquer FAIL.
 */

import "dotenv/config";
import {
  checkAdsOrFallback,
  checkCanonical,
  checkContent,
  checkRegionChips,
  checkRobots,
  checkStatus,
  isAllowedSmokeUrl,
} from "./lib/regional-page-validators.mjs";

const FETCH_TIMEOUT_MS = 20_000;
const DEFAULT_SLUGS = ["atibaia-sp", "campinas-sp", "sao-paulo-sp"];
const NONEXISTENT_SLUG = "regiao-fake-zz-smoke-only";

// ── env ────────────────────────────────────────────────────────────────

const FRONTEND_BASE = stripTrailingSlash(
  process.env.STAGING_PUBLIC_BASE_URL || process.env.SMOKE_BASE_URL || ""
);
const BACKEND_BASE = stripTrailingSlash(process.env.STAGING_BASE_URL || "");
const SLUGS_CSV = process.env.REGIONAL_SMOKE_SLUGS || DEFAULT_SLUGS.join(",");
const SLUGS = SLUGS_CSV.split(",").map((s) => s.trim()).filter(Boolean);
const EXPECT_FLAG = (process.env.EXPECT_FLAG || "on").toLowerCase();
const ADMIN_EMAIL = process.env.STAGING_ADMIN_EMAIL || "";
const ADMIN_PASSWORD = process.env.STAGING_ADMIN_PASSWORD || "";
const ALLOW_PATCH = process.env.STAGING_ALLOW_PATCH === "true";
const ALLOW_PRODUCTION = process.env.ALLOW_PRODUCTION === "true";

// ── helpers ─────────────────────────────────────────────────────────────

function stripTrailingSlash(url) {
  return (url || "").replace(/\/+$/, "");
}

let passed = 0;
let failed = 0;
const failures = [];

function recordPass(label, detail) {
  console.log(`  PASS  ${label}${detail ? ` — ${detail}` : ""}`);
  passed += 1;
}

function recordFail(label, detail) {
  console.error(`  FAIL  ${label}${detail ? ` — ${detail}` : ""}`);
  failed += 1;
  failures.push({ label, detail });
}

function recordSkip(label, reason) {
  console.log(`  SKIP  ${label}${reason ? ` — ${reason}` : ""}`);
}

async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: "GET",
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "manual",
      signal: controller.signal,
    });
    let body = "";
    try {
      body = await response.text();
    } catch {
      body = "";
    }
    return {
      status: response.status,
      headers: response.headers,
      body,
    };
  } catch (err) {
    return { status: 0, headers: null, body: "", error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...options,
      headers: { Accept: "application/json", ...(options.headers || {}) },
      signal: controller.signal,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {}
    return { status: response.status, body };
  } catch (err) {
    return { status: 0, body: null, error: err?.message || String(err) };
  } finally {
    clearTimeout(timeout);
  }
}

// Heurística de hints — a partir do slug, deriva o nome provável.
// Não tentamos perfeição: o validator aceita qualquer hint que case
// case-insensitive contra o HTML.
function deriveCityNameHints(slug) {
  const segments = slug.split("-");
  const uf = segments.length > 1 ? segments[segments.length - 1] : "";
  const nameSlug = segments.slice(0, -1).join("-");
  const titleCase = nameSlug
    .split("-")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
  const lower = titleCase.toLowerCase();
  return [titleCase, lower, slug, uf].filter(Boolean);
}

// ── checks ─────────────────────────────────────────────────────────────

async function smokeOneSlug(slug) {
  const url = `${FRONTEND_BASE}/carros-usados/regiao/${encodeURIComponent(slug)}`;
  console.log(`\n[${slug}] GET ${url}`);
  const response = await fetchHtml(url);

  if (response.status === 0) {
    recordFail(`[${slug}] rede`, response.error);
    return;
  }

  // ── EXPECT_FLAG=off → única validação é status 404. Pula o resto.
  if (EXPECT_FLAG === "off") {
    const statusCheck = checkStatus(response.status, 404);
    if (statusCheck.ok) recordPass(`[${slug}] status (flag=off)`, statusCheck.message);
    else recordFail(`[${slug}] status (flag=off)`, statusCheck.message);
    return;
  }

  // ── EXPECT_FLAG=on (default) → série completa.
  const statusCheck = checkStatus(response.status, 200);
  if (statusCheck.ok) recordPass(`[${slug}] status`, statusCheck.message);
  else {
    recordFail(`[${slug}] status`, statusCheck.message);
    // Sem 200 não há sentido seguir.
    return;
  }

  const robotsCheck = checkRobots(response.body);
  if (robotsCheck.ok) recordPass(`[${slug}] robots`, robotsCheck.message);
  else recordFail(`[${slug}] robots`, robotsCheck.message);

  const canonicalCheck = checkCanonical(response.body, slug);
  if (canonicalCheck.ok) recordPass(`[${slug}] canonical`, canonicalCheck.message);
  else recordFail(`[${slug}] canonical`, canonicalCheck.message);

  const contentCheck = checkContent(response.body, {
    baseSlug: slug,
    cityNameHints: deriveCityNameHints(slug),
  });
  if (contentCheck.ok) recordPass(`[${slug}] conteúdo essencial`, contentCheck.message);
  else recordFail(`[${slug}] conteúdo essencial`, contentCheck.message);

  const adsCheck = checkAdsOrFallback(response.body);
  if (adsCheck.ok) recordPass(`[${slug}] anúncios/fallback`, adsCheck.message);
  else recordFail(`[${slug}] anúncios/fallback`, adsCheck.message);

  const chipsCheck = checkRegionChips(response.body, slug);
  if (chipsCheck.ok) recordPass(`[${slug}] chips de cidades`, chipsCheck.message);
  else recordFail(`[${slug}] chips de cidades`, chipsCheck.message);
}

async function smokeNotFound() {
  const url = `${FRONTEND_BASE}/carros-usados/regiao/${encodeURIComponent(NONEXISTENT_SLUG)}`;
  console.log(`\n[404] GET ${url}`);
  const response = await fetchHtml(url);

  if (response.status === 0) {
    recordFail("[404] rede", response.error);
    return;
  }

  // Quando a flag está OFF, o 404 também acontece para slug inexistente —
  // mesma resposta, ambiguidade aceitável (tudo retorna 404). Só checa
  // que NÃO retornou 200.
  const statusCheck = checkStatus(response.status, 404);
  if (statusCheck.ok) recordPass("[404] cidade inexistente → 404", statusCheck.message);
  else recordFail("[404] cidade inexistente → 404", statusCheck.message);
}

async function smokeAdminRadius() {
  if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
    recordSkip(
      "admin /api/admin/regional-settings",
      "STAGING_ADMIN_EMAIL/STAGING_ADMIN_PASSWORD não definidos"
    );
    return;
  }
  if (!BACKEND_BASE) {
    recordSkip(
      "admin /api/admin/regional-settings",
      "STAGING_BASE_URL não definido (precisa do backend, não do frontend)"
    );
    return;
  }

  console.log("\n[admin] login + GET /api/admin/regional-settings");

  const login = await fetchJson(`${BACKEND_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: ADMIN_EMAIL, password: ADMIN_PASSWORD }),
  });

  if (login.status !== 200 || !login.body?.data?.accessToken) {
    recordFail(
      "[admin] login",
      `status=${login.status} body=${JSON.stringify(login.body)?.slice(0, 200)}`
    );
    return;
  }
  const token = login.body.data.accessToken;
  recordPass("[admin] login", "accessToken obtido");

  const get = await fetchJson(`${BACKEND_BASE}/api/admin/regional-settings`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  if (get.status !== 200 || !get.body?.data) {
    recordFail(
      "[admin] GET regional-settings",
      `status=${get.status} body=${JSON.stringify(get.body)?.slice(0, 200)}`
    );
    return;
  }
  const current = get.body.data;
  recordPass(
    "[admin] GET regional-settings",
    `radius_km=${current.radius_km} (range ${current.radius_min_km}..${current.radius_max_km})`
  );

  if (!ALLOW_PATCH) {
    recordSkip("[admin] PATCH radius_km", "STAGING_ALLOW_PATCH=true não definido");
    return;
  }

  // Round-trip: muda para 50 e volta para o valor original.
  const original = current.radius_km;
  const target = original === 50 ? 70 : 50;

  const patch1 = await fetchJson(`${BACKEND_BASE}/api/admin/regional-settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ radius_km: target, reason: "smoke-regional-page" }),
  });

  if (patch1.status !== 200 || patch1.body?.data?.radius_km !== target) {
    recordFail(
      `[admin] PATCH radius_km=${target}`,
      `status=${patch1.status} body=${JSON.stringify(patch1.body)?.slice(0, 200)}`
    );
    // Mesmo se falhou, tentar restaurar para original.
  } else {
    recordPass(`[admin] PATCH radius_km=${target}`, `aplicado`);
  }

  const restore = await fetchJson(`${BACKEND_BASE}/api/admin/regional-settings`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      radius_km: original,
      reason: "smoke-regional-page restore",
    }),
  });

  if (restore.status !== 200 || restore.body?.data?.radius_km !== original) {
    recordFail(
      `[admin] PATCH restore radius_km=${original}`,
      `status=${restore.status} body=${JSON.stringify(restore.body)?.slice(0, 200)} — REQUER REPARO MANUAL`
    );
  } else {
    recordPass(`[admin] PATCH restore radius_km=${original}`, "valor original restaurado");
  }
}

// ── main ───────────────────────────────────────────────────────────────

async function main() {
  console.log("[smoke:regional-page] iniciando");

  if (!FRONTEND_BASE) {
    console.error(
      "ERRO: STAGING_PUBLIC_BASE_URL (ou SMOKE_BASE_URL) não definido."
    );
    console.error(
      "  Exemplo: STAGING_PUBLIC_BASE_URL=https://carros-na-cidade-staging.onrender.com npm run smoke:regional-page"
    );
    process.exit(1);
  }

  const allowed = isAllowedSmokeUrl(FRONTEND_BASE);
  if (!allowed) {
    if (!ALLOW_PRODUCTION) {
      console.error(
        `ERRO: ${FRONTEND_BASE} não está na allowlist (staging/localhost/preview).`
      );
      console.error(
        "  O smoke não roda contra produção por default. Use staging."
      );
      process.exit(1);
    }
    console.warn(
      `AVISO: rodando contra ${FRONTEND_BASE} (fora da allowlist) com ALLOW_PRODUCTION=true`
    );
    console.warn(
      `       Caso de uso esperado: ativação controlada em produção (Fase C).`
    );
    console.warn(
      `       EXPECT_FLAG atual: ${EXPECT_FLAG} — confirme antes/depois de mexer na flag no Render.`
    );
  }

  console.log(`  FRONTEND_BASE = ${FRONTEND_BASE}`);
  console.log(`  EXPECT_FLAG   = ${EXPECT_FLAG}`);
  console.log(`  SLUGS         = ${SLUGS.join(", ")}`);
  if (BACKEND_BASE) console.log(`  BACKEND_BASE  = ${BACKEND_BASE}`);

  for (const slug of SLUGS) {
    await smokeOneSlug(slug);
  }

  await smokeNotFound();
  await smokeAdminRadius();

  console.log("");
  console.log("──────────────────────────────────────────────────────");
  console.log(`Resumo: ${passed} PASS / ${failed} FAIL (${passed + failed} checks)`);

  if (failed > 0) {
    console.error("");
    console.error("Falhas:");
    for (const f of failures) {
      console.error(`  - ${f.label}${f.detail ? `: ${f.detail}` : ""}`);
    }
    process.exit(1);
  }

  console.log("OK — Página Regional saudável em " + FRONTEND_BASE);
}

main().catch((err) => {
  console.error("[smoke:regional-page] erro inesperado:", err?.stack || err);
  process.exit(1);
});
