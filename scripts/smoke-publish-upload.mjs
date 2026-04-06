
#!/usr/bin/env node

/* eslint-disable no-console */

/**
 * Smoke da rota de upload de fotos (POST /api/ads/upload-images).
 * - GET /health/meta (ou SMOKE_HEALTH_PATH)
 * - POST sem token → 401/403
 * - POST com AUTH_TOKEN opcional → 200/201 + URLs
 *
 * Uso:
 *   node scripts/smoke-publish-upload.mjs
 *   BASE_URL=https://sua-api.onrender.com AUTH_TOKEN=... node scripts/smoke-publish-upload.mjs
 */

const RAW_BASE = String(process.env.BASE_URL || "").trim();
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 15000);
const ENDPOINT_PATH = String(process.env.SMOKE_UPLOAD_PATH || "/api/ads/upload-images").trim();
const HEALTH_PATH = String(process.env.SMOKE_HEALTH_PATH || "/health/meta").trim();
const AUTH_TOKEN = String(process.env.AUTH_TOKEN || process.env.SMOKE_AUTH_TOKEN || "").trim();
const EXPECT_NO_AUTH_STATUSES = [401, 403];
const EXPECT_AUTH_SUCCESS_STATUSES = [200, 201];

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("BASE_URL não definida.");
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
  if (!condition) {
    throw new Error(message);
  }
}

function briefText(text, max = 280) {
  const normalized = String(text || "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized.length > max ? `${normalized.slice(0, max)}…` : normalized;
}

function lineOk(message) {
  console.log(`✅ ${message}`);
}

function lineInfo(message) {
  console.log(`ℹ️  ${message}`);
}

function lineWarn(message) {
  console.log(`⚠️  ${message}`);
}

function lineErr(message) {
  console.error(`❌ ${message}`);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
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
      // mantém text
    }
  }

  return {
    ok: response.ok,
    status: response.status,
    contentType,
    headers: response.headers,
    text,
    json,
  };
}

function createTinyPngBuffer() {
  const base64 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jk5UAAAAASUVORK5CYII=";
  return Buffer.from(base64, "base64");
}

function buildUploadFormData() {
  const form = new FormData();
  const pngBuffer = createTinyPngBuffer();
  const blob = new Blob([pngBuffer], { type: "image/png" });

  form.append("photos", blob, "smoke-upload.png");
  return form;
}

function extractUrlsFromJson(json) {
  if (!json || typeof json !== "object") return [];

  const candidates = [
    json?.data?.urls,
    json?.urls,
    json?.data?.images,
    json?.images,
    json?.data?.items,
    json?.items,
  ];

  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((item) => {
          if (typeof item === "string") return item;
          if (item && typeof item === "object") {
            return (
              item.url ||
              item.publicUrl ||
              item.image_url ||
              item.imageUrl ||
              item.src ||
              item.location ||
              ""
            );
          }
          return "";
        })
        .map((value) => String(value || "").trim())
        .filter(Boolean);
    }
  }

  return [];
}

async function checkHealth(base) {
  const url = buildUrl(base, HEALTH_PATH);
  lineInfo(`Health check: ${url}`);

  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: {
      accept: "application/json, text/plain, */*",
    },
  });

  const parsed = await parseResponse(response);

  assert(
    parsed.status === 200,
    `Healthcheck falhou: esperado 200, veio ${parsed.status}. Body: ${briefText(parsed.text)}`
  );

  lineOk(`Healthcheck OK (${parsed.status})`);
  return parsed;
}

async function postWithoutAuth(base) {
  const url = buildUrl(base, ENDPOINT_PATH);
  const form = buildUploadFormData();

  lineInfo(`Teste sem Authorization: POST ${url}`);

  const response = await fetchWithTimeout(url, {
    method: "POST",
    body: form,
    headers: {
      accept: "application/json, text/plain, */*",
    },
  });

  const parsed = await parseResponse(response);

  assert(
    EXPECT_NO_AUTH_STATUSES.includes(parsed.status),
    `Sem token deveria retornar ${EXPECT_NO_AUTH_STATUSES.join("/")} e veio ${parsed.status}. Body: ${briefText(parsed.text)}`
  );

  lineOk(`Rota de upload respondeu ${parsed.status} sem token (auth protegendo corretamente)`);
  return parsed;
}

async function postWithAuth(base, token) {
  const url = buildUrl(base, ENDPOINT_PATH);
  const form = buildUploadFormData();

  lineInfo(`Teste com Authorization: POST ${url}`);

  const response = await fetchWithTimeout(url, {
    method: "POST",
    body: form,
    headers: {
      accept: "application/json, text/plain, */*",
      authorization: `Bearer ${token}`,
    },
  });

  const parsed = await parseResponse(response);

  assert(
    EXPECT_AUTH_SUCCESS_STATUSES.includes(parsed.status),
    `Com token deveria retornar ${EXPECT_AUTH_SUCCESS_STATUSES.join("/")} e veio ${parsed.status}. Body: ${briefText(parsed.text)}`
  );

  assert(
    parsed.contentType.includes("application/json"),
    `Upload com token deveria responder JSON. Content-Type: ${parsed.contentType || "n/a"}`
  );

  assert(parsed.json, `Upload com token retornou JSON inválido. Body: ${briefText(parsed.text)}`);

  const urls = extractUrlsFromJson(parsed.json);
  assert(urls.length > 0, `Upload com token não retornou URLs de imagem. Body: ${briefText(parsed.text)}`);

  lineOk(`Upload autenticado OK (${parsed.status})`);
  lineOk(`URLs retornadas: ${urls.length}`);
  lineInfo(`Primeira URL: ${urls[0]}`);

  return {
    ...parsed,
    urls,
  };
}

async function main() {
  const base = normalizeBaseUrl(RAW_BASE);

  console.log("");
  console.log(`SMOKE PUBLISH UPLOAD @ ${base}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms`);
  console.log(`Endpoint: ${ENDPOINT_PATH}`);
  console.log(`Token informado: ${AUTH_TOKEN ? "sim" : "não"}`);
  console.log("");

  await checkHealth(base);

  if (!AUTH_TOKEN) {
    lineWarn("AUTH_TOKEN não informado. Vou validar apenas se a rota existe e exige autenticação.");
    await postWithoutAuth(base);
    console.log("");
    lineOk("Smoke básico de upload passou.");
    lineInfo("Para validar upload real no R2, rode novamente com AUTH_TOKEN.");
    process.exit(0);
  }

  await postWithAuth(base, AUTH_TOKEN);

  console.log("");
  lineOk("Smoke completo de upload passou.");
  process.exit(0);
}

main().catch((error) => {
  lineErr(error?.message || String(error));

#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Smoke mínimo da rota de upload de fotos do publish (R2).
 * - GET /health (API viva + DB)
 * - POST /api/ads/upload-images sem Authorization → 401 (rota montada + auth antes do multer)
 *
 * Uso:
 *   node scripts/smoke-publish-upload.mjs
 *   BASE_URL=https://sua-api.onrender.com node scripts/smoke-publish-upload.mjs
 */

const BASE = String(process.env.BASE_URL || process.env.SMOKE_API_URL || "http://127.0.0.1:4000").replace(
  /\/+$/,
  ""
);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 10000);

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fetchJson(method, path, { headers = {}, body } = {}) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body,
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = { raw: text };
    }
    return { res, json, text };
  } finally {
    clearTimeout(id);
  }
}

async function main() {
  console.log(`[smoke-publish-upload] BASE=${BASE}`);

  const health = await fetchJson("GET", "/health");
  assert(health.res.ok, `GET /health esperado 2xx, obteve ${health.res.status}`);
  assert(health.json?.ok !== false || health.res.status === 503, "GET /health payload inesperado");

  const upload = await fetchJson("POST", "/api/ads/upload-images", {
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert(
    upload.res.status === 401,
    `POST /api/ads/upload-images sem token esperado 401, obteve ${upload.res.status}`
  );

  console.log("[smoke-publish-upload] OK — health + upload-images (401 sem auth)");
}

main().catch((e) => {
  console.error("[smoke-publish-upload] FALHA:", e?.message || e);

  process.exit(1);
});
