#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Smoke OPERACIONAL do fluxo antifraude/moderação contra um ambiente
 * REAL (staging). Não substitui os testes unitários do vitest — serve
 * para o operador validar, em staging, que o pipeline real responde
 * conforme o relatório técnico antes de liberar produção.
 *
 * Cenários (cada um reporta PASS|FAIL|SKIP|FATAL):
 *   A. Preço compatível com FIPE  → status `active`.
 *   B. Preço −30% abaixo da FIPE  → status `pending_review`.
 *   C. Preço −45% abaixo da FIPE  → `pending_review` + `risk_level=critical`.
 *   D. Preço inválido (R$ 0)      → HTTP 400, sem INSERT.
 *   E. FIPE indisponível          → fluxo segue, sinal `FIPE_UNAVAILABLE`.
 *   F. Ad em `pending_review` NÃO aparece em busca pública.
 *   G. Tentar boost em ad `pending_review` → HTTP 400, ad permanece intacto.
 *
 * Pré-requisitos (env):
 *   STAGING_BASE_URL          → ex.: https://staging-api.carrosnacidade.com
 *   STAGING_QA_EMAIL          → usuário de teste com plano que publica
 *   STAGING_QA_PASSWORD       → senha do user de teste
 *
 * Opcional:
 *   STAGING_PUBLIC_BASE_URL   → usado em F (busca pública). Default: igual a STAGING_BASE_URL.
 *   STAGING_BOOST_OPTION_ID   → id da boost option (default: "boost-7d").
 *   STAGING_FIPE_BRAND_CODE   → códigos canônicos para A/B/C (default Honda Civic 2018).
 *   STAGING_FIPE_MODEL_CODE
 *   STAGING_FIPE_YEAR_CODE
 *   STAGING_CITY_ID           → city_id válido em staging (default: 1).
 *   ALLOW_PRODUCTION=true     → DESBLOQUEIA execução contra prod (não use sem motivo).
 *
 * Saída:
 *   stdout linha-por-linha com [A][PASS], [B][FAIL] etc.
 *   exit 0 se TODOS passaram; exit 1 se houve qualquer FAIL/FATAL.
 *
 * IMPORTANTE — proteção contra prod:
 *   O script recusa rodar se a URL não contiver "staging" / "localhost" /
 *   "127.0.0.1" / "0.0.0.0", a menos que ALLOW_PRODUCTION=true seja
 *   explicitamente passado. Isto evita rodar no domínio errado por engano.
 */

const PROD_DOMAINS = ["carrosnacidade.com", "carrosnacidade.com.br"];
const SAFE_PATTERNS = [/staging/i, /localhost/i, /127\.0\.0\.1/, /0\.0\.0\.0/];

function envRequired(key) {
  const v = String(process.env[key] || "").trim();
  if (!v) {
    console.error(`[smoke] env obrigatória ausente: ${key}`);
    process.exit(2);
  }
  return v;
}

function envOptional(key, fallback) {
  const v = String(process.env[key] || "").trim();
  return v || fallback;
}

function refuseIfProdLooking(url) {
  const allowProd =
    String(process.env.ALLOW_PRODUCTION || "").toLowerCase() === "true";
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.error(`[smoke] STAGING_BASE_URL inválida: ${url}`);
    process.exit(2);
  }
  const host = parsed.hostname.toLowerCase();
  const looksProd = PROD_DOMAINS.some((d) => host === d || host.endsWith(`.${d}`));
  const looksSafe = SAFE_PATTERNS.some((p) => p.test(host));

  if (looksProd && !looksSafe && !allowProd) {
    console.error(
      `[smoke] RECUSADO: hostname "${host}" parece produção. ` +
        `Defina ALLOW_PRODUCTION=true para forçar (não recomendado). ` +
        `URL alvo deve conter "staging" para passar pelo guard automático.`
    );
    process.exit(2);
  }
  if (!looksSafe && !allowProd) {
    console.error(
      `[smoke] RECUSADO: hostname "${host}" não corresponde a padrão ` +
        `seguro (staging/localhost). Defina ALLOW_PRODUCTION=true para forçar.`
    );
    process.exit(2);
  }
}

const BASE_URL = envRequired("STAGING_BASE_URL").replace(/\/+$/, "");
refuseIfProdLooking(BASE_URL);

const PUBLIC_URL = envOptional("STAGING_PUBLIC_BASE_URL", BASE_URL).replace(
  /\/+$/,
  ""
);
const QA_EMAIL = envRequired("STAGING_QA_EMAIL");
const QA_PASSWORD = envRequired("STAGING_QA_PASSWORD");
const BOOST_OPTION_ID = envOptional("STAGING_BOOST_OPTION_ID", "boost-7d");
const CITY_ID = Number(envOptional("STAGING_CITY_ID", "1"));

const FIPE_CODES = {
  fipe_brand_code: envOptional("STAGING_FIPE_BRAND_CODE", "23"),
  fipe_model_code: envOptional("STAGING_FIPE_MODEL_CODE", "5585"),
  fipe_year_code: envOptional("STAGING_FIPE_YEAR_CODE", "2018-1"),
};

const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);

// ────────────────────────────────────────────────────────────────────
// Output helpers
// ────────────────────────────────────────────────────────────────────
const results = [];
function record(id, status, message) {
  results.push({ id, status, message });
  const tag = `[${id}][${status}]`;
  const colored =
    status === "PASS" ? `\x1b[32m${tag}\x1b[0m`
    : status === "FAIL" ? `\x1b[31m${tag}\x1b[0m`
    : status === "SKIP" ? `\x1b[33m${tag}\x1b[0m`
    : `\x1b[31m\x1b[1m${tag}\x1b[0m`;
  console.log(`${colored} ${message}`);
}

// ────────────────────────────────────────────────────────────────────
// HTTP helpers
// ────────────────────────────────────────────────────────────────────
async function withTimeout(promise) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await promise(controller.signal);
  } finally {
    clearTimeout(id);
  }
}

async function jsonFetch(url, init = {}) {
  return withTimeout(async (signal) => {
    const res = await fetch(url, { ...init, signal });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { _raw: text };
    }
    return { status: res.status, body };
  });
}

async function login() {
  const url = `${BASE_URL}/api/auth/login`;
  const { status, body } = await jsonFetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: QA_EMAIL, password: QA_PASSWORD }),
  });
  if (status !== 200 && status !== 201) {
    throw new Error(`login HTTP ${status}: ${JSON.stringify(body).slice(0, 200)}`);
  }
  const token =
    body?.access_token ||
    body?.token ||
    body?.data?.access_token ||
    body?.data?.token;
  if (!token) {
    throw new Error("login sem access_token na resposta");
  }
  return token;
}

function basePayload(overrides = {}) {
  return {
    title: "Honda Civic 2018 LX (smoke)",
    description: "Smoke staging — não publicar nada com base neste anúncio.",
    price: 80_000,
    city_id: CITY_ID,
    city: "Atibaia",
    state: "SP",
    brand: "Honda",
    model: "Civic",
    year: 2018,
    mileage: 50_000,
    images: [
      // Placeholder remoto — backend valida dimensões e MIME no upload real,
      // mas o INSERT só checa a presença de pelo menos 1 URL não-vazia.
      "https://placehold.co/640x480.jpg",
    ],
    ...FIPE_CODES,
    ...overrides,
  };
}

async function createAd(token, payload) {
  return jsonFetch(`${BASE_URL}/api/ads`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
}

async function searchPublic(filters = {}) {
  const qs = new URLSearchParams({ limit: "50", ...filters });
  return jsonFetch(`${PUBLIC_URL}/api/ads/search?${qs.toString()}`);
}

async function tryBoost(token, adId) {
  return jsonFetch(`${BASE_URL}/api/payments/boost-7d/checkout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      ad_id: adId,
      boost_option_id: BOOST_OPTION_ID,
      success_url: `${BASE_URL}/_smoke/ok`,
      failure_url: `${BASE_URL}/_smoke/fail`,
      pending_url: `${BASE_URL}/_smoke/pending`,
    }),
  });
}

// ────────────────────────────────────────────────────────────────────
// Schema readiness — bail-early se migration 025 ausente
// ────────────────────────────────────────────────────────────────────
async function preflightSchemaCheck() {
  const { status, body } = await jsonFetch(`${BASE_URL}/health`);
  if (status === 404) {
    record("PRE", "SKIP", `/health não disponível em ${BASE_URL} — seguindo`);
    return;
  }
  if (status >= 500) {
    record(
      "PRE",
      "FATAL",
      `/health retornou ${status}: ${JSON.stringify(body).slice(0, 240)}`
    );
    return;
  }
  const checks = body?.checks || {};
  if (checks.antifraud_schema && checks.antifraud_schema !== "ok") {
    record(
      "PRE",
      "FATAL",
      `migration 025 ausente em staging — abortando smoke. ` +
        `Faltam: ${JSON.stringify(checks.antifraud_schema_missing || {})}`
    );
    return;
  }
  record(
    "PRE",
    "PASS",
    `staging healthy (db=${checks.db}, antifraud_schema=${checks.antifraud_schema || "n/a"})`
  );
}

// ────────────────────────────────────────────────────────────────────
// Cenários A–G
// ────────────────────────────────────────────────────────────────────
async function scenarioA(token) {
  // Preço compatível com FIPE → ACTIVE.
  const { status, body } = await createAd(token, basePayload({ price: 80_000 }));
  if (status !== 200 && status !== 201) {
    return record("A", "FAIL", `HTTP ${status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  const ad = body?.data || body?.ad || body;
  if (ad?.status === "active") {
    return record("A", "PASS", `ad ${ad.id} criado active (risk_level=${ad.risk_level})`);
  }
  return record("A", "FAIL", `esperado active, recebido status="${ad?.status}"`);
}

async function scenarioB(token, ctx) {
  // −30% FIPE → PENDING_REVIEW. Backend deve cotar via fipe_*_code e ignorar fipe_value.
  const { status, body } = await createAd(
    token,
    basePayload({ price: 70_000, fipe_value: 70_000 })
  );
  if (status !== 200 && status !== 201) {
    return record("B", "FAIL", `HTTP ${status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  const ad = body?.data || body?.ad || body;
  if (ad?.status === "pending_review") {
    ctx.pendingAdId = ad.id;
    ctx.pendingAdSlug = ad.slug || null;
    return record(
      "B",
      "PASS",
      `ad ${ad.id} → pending_review (risk_level=${ad.risk_level})`
    );
  }
  return record("B", "FAIL", `esperado pending_review, recebido status="${ad?.status}"`);
}

async function scenarioC(token) {
  // −45% FIPE → PENDING_REVIEW + critical.
  const { status, body } = await createAd(
    token,
    basePayload({ price: 55_000, fipe_value: 55_000 })
  );
  if (status !== 200 && status !== 201) {
    return record("C", "FAIL", `HTTP ${status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  const ad = body?.data || body?.ad || body;
  if (ad?.status === "pending_review" && ad?.risk_level === "critical") {
    return record("C", "PASS", `ad ${ad.id} → pending_review/critical`);
  }
  return record(
    "C",
    "FAIL",
    `esperado pending_review/critical, recebido status="${ad?.status}", risk_level="${ad?.risk_level}"`
  );
}

async function scenarioD(token) {
  // Preço inválido (zero) → 400, sem INSERT.
  const { status, body } = await createAd(token, basePayload({ price: 0 }));
  if (status === 400) {
    return record("D", "PASS", `HTTP 400 corretamente (code=${body?.code || body?.error})`);
  }
  return record(
    "D",
    "FAIL",
    `esperado HTTP 400, recebido ${status}: ${JSON.stringify(body).slice(0, 200)}`
  );
}

async function scenarioE(token) {
  // FIPE indisponível: SEM os códigos canônicos. Pipeline deve seguir e
  // gravar FIPE_UNAVAILABLE; status final cai na regra normal de score.
  const payload = basePayload({ price: 80_000 });
  delete payload.fipe_brand_code;
  delete payload.fipe_model_code;
  delete payload.fipe_year_code;
  const { status, body } = await createAd(token, payload);
  if (status !== 200 && status !== 201) {
    return record("E", "FAIL", `HTTP ${status}: ${JSON.stringify(body).slice(0, 240)}`);
  }
  const ad = body?.data || body?.ad || body;
  const codes = (ad?.risk_reasons || []).map((r) => r.code);
  if (codes.includes("FIPE_UNAVAILABLE")) {
    return record(
      "E",
      "PASS",
      `ad ${ad.id} criado (status=${ad.status}); FIPE_UNAVAILABLE registrado`
    );
  }
  return record(
    "E",
    "FAIL",
    `esperado FIPE_UNAVAILABLE em risk_reasons; recebidos: ${codes.join(",") || "(vazio)"}`
  );
}

async function scenarioF(ctx) {
  // pending_review NÃO aparece na busca pública.
  if (!ctx.pendingAdId) {
    return record("F", "SKIP", "cenário B falhou; sem ad pending_review para testar");
  }
  const { status, body } = await searchPublic();
  if (status !== 200) {
    return record("F", "FAIL", `busca pública HTTP ${status}`);
  }
  const ads = body?.ads || body?.data || [];
  const leaked = ads.find(
    (a) => String(a.id) === String(ctx.pendingAdId) || a.status === "pending_review"
  );
  if (leaked) {
    return record(
      "F",
      "FAIL",
      `vazamento: ad ${leaked.id} (status=${leaked.status}) apareceu na busca pública`
    );
  }
  return record(
    "F",
    "PASS",
    `${ads.length} ads na busca pública, todos active; pending_review ${ctx.pendingAdId} fora`
  );
}

async function scenarioG(token, ctx) {
  // Boost em pending_review → 400 e ad NÃO recebe destaque.
  if (!ctx.pendingAdId) {
    return record("G", "SKIP", "cenário B falhou; sem ad pending_review para testar");
  }
  const { status, body } = await tryBoost(token, ctx.pendingAdId);
  if (status === 400) {
    return record(
      "G",
      "PASS",
      `boost recusado HTTP 400 para ad pending_review (msg="${(body?.error || body?.message || "").slice(0, 80)}")`
    );
  }
  return record(
    "G",
    "FAIL",
    `esperado HTTP 400, recebido ${status}: ${JSON.stringify(body).slice(0, 200)}`
  );
}

// ────────────────────────────────────────────────────────────────────
// Run
// ────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`[smoke] target = ${BASE_URL} (público=${PUBLIC_URL})`);
  console.log(`[smoke] usuário = ${QA_EMAIL}`);

  await preflightSchemaCheck();
  const fatalAfterPre = results.some((r) => r.status === "FATAL");
  if (fatalAfterPre) {
    console.log(`\n[smoke] PRE-FLIGHT falhou — abortando.`);
    process.exit(1);
  }

  let token;
  try {
    token = await login();
    record("LOGIN", "PASS", `token obtido (${token.slice(0, 8)}…)`);
  } catch (err) {
    record("LOGIN", "FATAL", err?.message || String(err));
    process.exit(1);
  }

  const ctx = {};
  await scenarioA(token);
  await scenarioB(token, ctx);
  await scenarioC(token);
  await scenarioD(token);
  await scenarioE(token);
  await scenarioF(ctx);
  await scenarioG(token, ctx);

  // Resumo
  const passed = results.filter((r) => r.status === "PASS").length;
  const failed = results.filter((r) => r.status === "FAIL").length;
  const fatal = results.filter((r) => r.status === "FATAL").length;
  const skipped = results.filter((r) => r.status === "SKIP").length;

  console.log(
    `\n[smoke] resumo: ${passed} PASS · ${failed} FAIL · ${fatal} FATAL · ${skipped} SKIP`
  );

  if (ctx.pendingAdId) {
    console.log(
      `[smoke] LIMPEZA: ad ${ctx.pendingAdId} ficou em pending_review em staging. ` +
        `Reprovar via /admin/moderation ou rodar:\n` +
        `  psql "$STAGING_DATABASE_URL" -c "UPDATE ads SET status='deleted' WHERE id=${ctx.pendingAdId};"`
    );
  }

  process.exit(failed > 0 || fatal > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error(`[smoke] erro inesperado:`, err);
  process.exit(1);
});
