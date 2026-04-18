#!/usr/bin/env node
/* eslint-disable no-console */

/**
 * Smoke da rota de upload de fotos (POST /api/ads/upload-images).
 *
 * Cenários cobertos:
 *  1. Health check — API viva
 *  2. Upload sem Authorization → 401 (auth protegendo antes do multer)
 *  3. Upload com token + imagem simples PNG → 200 + URLs
 *  4. Upload com token + nome de arquivo acentuado (veículo-frontal.jpg) → 200 + URLs
 *  5. Upload com token + MIME image/jpg (não-canônico) → 200 + URLs (bug real corrigido)
 *  6. Upload com token + arquivo de 7 MB → 200 + URLs (alinhamento de limite confirmado)
 *
 * Uso:
 *   node scripts/smoke-publish-upload.mjs
 *   BASE_URL=https://sua-api.onrender.com AUTH_TOKEN=... node scripts/smoke-publish-upload.mjs
 */

const RAW_BASE = String(process.env.BASE_URL || process.env.SMOKE_API_URL || "").trim();
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const ENDPOINT_PATH = String(process.env.SMOKE_UPLOAD_PATH || "/api/ads/upload-images").trim();
const HEALTH_PATH = String(process.env.SMOKE_HEALTH_PATH || "/health").trim();
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || process.env.SMOKE_AUTH_TOKEN || "").trim();
const EXPECT_NO_AUTH_STATUSES = [401, 403];
const EXPECT_AUTH_SUCCESS_STATUSES = [200, 201];

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error(
      "BASE_URL não definida. Use: BASE_URL=http://127.0.0.1:4000 node scripts/smoke-publish-upload.mjs"
    );
  }
  try {
    const url = new URL(trimmed);
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`BASE_URL inválida: ${trimmed}`);
  }
}

function buildUrl(base, path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath.startsWith("/")) {
    throw new Error(`Path inválido: "${path}"`);
  }
  return new URL(normalizedPath, `${base}/`).toString();
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function briefText(text, max = 280) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function lineOk(msg) {
  console.log(`✅ ${msg}`);
}
function lineInfo(msg) {
  console.log(`ℹ️  ${msg}`);
}
function lineWarn(msg) {
  console.log(`⚠️  ${msg}`);
}
function lineErr(msg) {
  console.error(`❌ ${msg}`);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

async function parseResponse(response) {
  const contentType = String(response.headers.get("content-type") || "");
  const text = await response.text();
  let json = null;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      /* keep json null */
    }
  }
  return { ok: response.ok, status: response.status, contentType, text, json };
}

function extractUrls(json) {
  if (!json || typeof json !== "object") return [];
  for (const candidate of [json?.data?.urls, json?.urls, json?.data?.images, json?.images]) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            return item.url || item.publicUrl || item.image_url || item.src || "";
          }
          return "";
        })
        .map((v) => String(v || "").trim())
        .filter(Boolean);
    }
  }
  return [];
}

/** Cria um buffer PNG mínimo de 1×1 px (37 bytes). */
function tinyPngBuffer() {
  return Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk5UAAAAASUVORK5CYII=",
    "base64"
  );
}

/** Cria um buffer JPEG mínimo (valor de prefixo SOI correto). */
function tinyJpegBuffer() {
  const buf = Buffer.alloc(128);
  buf[0] = 0xff;
  buf[1] = 0xd8; // SOI
  buf[2] = 0xff;
  buf[3] = 0xe0; // APP0
  buf[4] = 0x00;
  buf[5] = 0x10;
  buf.write("JFIF\x00", 6);
  buf[126] = 0xff;
  buf[127] = 0xd9; // EOI
  return buf;
}

/** Cria um buffer de tamanho N preenchido com padrão de pixel válido. */
function filledJpegBuffer(sizeBytes) {
  const base = tinyJpegBuffer();
  const buf = Buffer.alloc(sizeBytes, 0x00);
  base.copy(buf, 0);
  buf[sizeBytes - 2] = 0xff;
  buf[sizeBytes - 1] = 0xd9;
  return buf;
}

// ---------------------------------------------------------------------------
// Cenário 1 — Health check
// ---------------------------------------------------------------------------

async function checkHealth(base) {
  const url = buildUrl(base, HEALTH_PATH);
  lineInfo(`Health check: ${url}`);
  const r = await fetchWithTimeout(url, {
    method: "GET",
    headers: { accept: "application/json, */*" },
  });
  const parsed = await parseResponse(r);
  assert(
    parsed.status === 200,
    `Health falhou: esperado 200, obteve ${parsed.status}. Body: ${briefText(parsed.text)}`
  );
  lineOk(`Health OK (${parsed.status})`);
}

// ---------------------------------------------------------------------------
// Cenário 2 — Upload sem token → 401/403
// ---------------------------------------------------------------------------

async function postWithoutAuth(base) {
  const url = buildUrl(base, ENDPOINT_PATH);
  lineInfo(`Cenário 2: upload sem Authorization → espera 401/403`);
  const form = new FormData();
  form.append("photos", new Blob([tinyPngBuffer()], { type: "image/png" }), "smoke.png");
  const r = await fetchWithTimeout(url, {
    method: "POST",
    body: form,
    headers: { accept: "application/json" },
  });
  const parsed = await parseResponse(r);
  assert(
    EXPECT_NO_AUTH_STATUSES.includes(parsed.status),
    `Sem token esperado ${EXPECT_NO_AUTH_STATUSES.join("/")}, obteve ${parsed.status}. Body: ${briefText(parsed.text)}`
  );
  lineOk(`Upload sem token → ${parsed.status} (auth protegendo corretamente)`);
}

// ---------------------------------------------------------------------------
// Helper compartilhado — upload autenticado e valida resposta
// ---------------------------------------------------------------------------

async function postWithAuthAndValidate(base, token, form, scenarioLabel) {
  const url = buildUrl(base, ENDPOINT_PATH);
  lineInfo(`${scenarioLabel}: POST ${url}`);
  const r = await fetchWithTimeout(url, {
    method: "POST",
    body: form,
    headers: { accept: "application/json", authorization: `Bearer ${token}` },
  });
  const parsed = await parseResponse(r);

  assert(
    EXPECT_AUTH_SUCCESS_STATUSES.includes(parsed.status),
    `${scenarioLabel}: esperado ${EXPECT_AUTH_SUCCESS_STATUSES.join("/")}, obteve ${parsed.status}. Body: ${briefText(parsed.text)}`
  );
  assert(
    parsed.contentType.includes("application/json"),
    `${scenarioLabel}: resposta não é JSON. Content-Type: ${parsed.contentType}`
  );
  assert(parsed.json, `${scenarioLabel}: JSON inválido. Body: ${briefText(parsed.text)}`);

  const urls = extractUrls(parsed.json);
  assert(
    urls.length > 0,
    `${scenarioLabel}: nenhuma URL retornada. Body: ${briefText(parsed.text)}`
  );

  lineOk(`${scenarioLabel}: OK (${parsed.status}) — ${urls.length} URL(s)`);
  lineInfo(`  Primeira URL: ${urls[0]}`);
  return urls;
}

// ---------------------------------------------------------------------------
// Cenário 3 — Upload simples PNG
// ---------------------------------------------------------------------------

async function smokeSimplePng(base, token) {
  const form = new FormData();
  form.append("photos", new Blob([tinyPngBuffer()], { type: "image/png" }), "smoke-upload.png");
  return postWithAuthAndValidate(base, token, form, "Cenário 3 (PNG simples)");
}

// ---------------------------------------------------------------------------
// Cenário 4 — Nome de arquivo acentuado (veículo-frontal.jpg)
// ---------------------------------------------------------------------------

async function smokeAccentedFilename(base, token) {
  const form = new FormData();
  form.append(
    "photos",
    new Blob([tinyJpegBuffer()], { type: "image/jpeg" }),
    "veículo-frontal.jpg"
  );
  return postWithAuthAndValidate(base, token, form, "Cenário 4 (nome acentuado)");
}

// ---------------------------------------------------------------------------
// Cenário 5 — MIME image/jpg (não-canônico, bug real corrigido)
// ---------------------------------------------------------------------------

async function smokeMimeImageJpg(base, token) {
  const form = new FormData();
  form.append(
    "photos",
    // Envia o blob com MIME "image/jpg" — antes da correção seria rejeitado
    new Blob([tinyJpegBuffer()], { type: "image/jpg" }),
    "foto.jpg"
  );
  return postWithAuthAndValidate(base, token, form, "Cenário 5 (MIME image/jpg)");
}

// ---------------------------------------------------------------------------
// Cenário 6 — Arquivo de 7 MB (dentro do limite de 10 MB)
// ---------------------------------------------------------------------------

async function smokeLargeFile(base, token) {
  const SEVEN_MB = 7 * 1024 * 1024;
  const form = new FormData();
  form.append(
    "photos",
    new Blob([filledJpegBuffer(SEVEN_MB)], { type: "image/jpeg" }),
    "foto-7mb.jpg"
  );
  return postWithAuthAndValidate(base, token, form, "Cenário 6 (arquivo 7 MB)");
}

// ---------------------------------------------------------------------------
// Entrypoint
// ---------------------------------------------------------------------------

async function main() {
  const base = normalizeBaseUrl(RAW_BASE);

  console.log("");
  console.log(`=== SMOKE PUBLISH UPLOAD @ ${base} ===`);
  console.log(`Timeout : ${TIMEOUT_MS}ms`);
  console.log(`Endpoint: ${ENDPOINT_PATH}`);
  console.log(`Token   : ${AUTH_TOKEN ? "informado" : "não informado"}`);
  console.log("");

  await checkHealth(base);
  await postWithoutAuth(base);

  if (!AUTH_TOKEN) {
    lineWarn("AUTH_TOKEN não informado — cenários 3-6 ignorados.");
    lineInfo("Para validar upload real, rode com AUTH_TOKEN=<bearer_token>.");
    console.log("");
    lineOk("Smoke básico passou (health + 401 sem token).");
    process.exit(0);
  }

  await smokeSimplePng(base, AUTH_TOKEN);
  await smokeAccentedFilename(base, AUTH_TOKEN);
  await smokeMimeImageJpg(base, AUTH_TOKEN);
  await smokeLargeFile(base, AUTH_TOKEN);

  console.log("");
  lineOk("Todos os cenários de smoke passaram.");
  process.exit(0);
}

main().catch((error) => {
  lineErr(error?.message || String(error));
  process.exit(1);
});
