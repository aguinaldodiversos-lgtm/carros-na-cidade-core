/**
 * Provider HTTP para a Tabela FIPE — backend.
 *
 * Consulta o mesmo endpoint que o frontend já usa hoje
 * (`https://parallelum.com.br/fipe/api/v1`), porém roda no servidor
 * para que o anúncio NÃO dependa de valor enviado pelo cliente.
 *
 * Override de URL: env `FIPE_API_BASE_URL`.
 * Modo desligado: env `FIPE_BACKEND_DISABLED=true` faz qualquer chamada
 * retornar `unavailable` sem rede — útil em dev/CI sem internet.
 *
 * Cache em memória: 24h por (vehicleType, brandCode, modelCode, yearCode).
 * Volume é baixo (uma cotação por anúncio criado), então uma Map simples
 * é suficiente — sem dependência de Redis nesta rodada.
 *
 * Esta camada NÃO faz decisão de risco — só obtém o número. A semântica
 * fica em `fipe.service.js` (resolveFipeReference).
 */

const DEFAULT_BASE_URL = "https://parallelum.com.br/fipe/api/v1";
const DEFAULT_TIMEOUT_MS = 4_000;
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;

const memoryCache = new Map(); // key -> { value, expiresAt }

function cleanupExpired(now) {
  for (const [k, v] of memoryCache.entries()) {
    if (!v || v.expiresAt <= now) memoryCache.delete(k);
  }
}

function cacheKey({ vehicleType, brandCode, modelCode, yearCode }) {
  return `${vehicleType}:${brandCode}:${modelCode}:${yearCode}`;
}

function isDisabled() {
  return String(process.env.FIPE_BACKEND_DISABLED || "").toLowerCase() === "true";
}

function getBaseUrl() {
  const v = String(process.env.FIPE_API_BASE_URL || DEFAULT_BASE_URL).replace(
    /\/+$/,
    ""
  );
  return v;
}

/**
 * Parse "R$ 85.123,45" → 85123.45.
 * Tolerante: aceita "R$85123,45", "85.123,45", "85123.45", número, etc.
 */
export function parseFipePriceBr(raw) {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const s = String(raw ?? "").trim();
  if (!s) return null;
  const cleaned = s
    .replace(/[Rr]\$/g, "")
    .replace(/\s+/g, "")
    .replace(/\./g, "")
    .replace(/,/g, ".");
  const m = cleaned.match(/-?\d+(\.\d+)?/);
  if (!m) return null;
  const n = Number(m[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

async function fetchWithTimeout(url, timeoutMs = DEFAULT_TIMEOUT_MS) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/json" },
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Cota um veículo na FIPE oficial via códigos canônicos.
 *
 * @param {object} input
 * @param {"carros"|"motos"|"caminhoes"} [input.vehicleType="carros"]
 * @param {string|number} input.brandCode
 * @param {string|number} input.modelCode
 * @param {string} input.yearCode  — ex: "2018-1" (1=Gasolina, 2=Álcool, 3=Diesel)
 * @returns {Promise<{ ok: true, price: number, fipeCode: string, referenceMonth: string, raw: object }
 *                 | { ok: false, reason: string, status?: number }>}
 */
export async function quoteByCodes(input, deps = {}) {
  const vehicleType =
    input?.vehicleType === "motos" || input?.vehicleType === "caminhoes"
      ? input.vehicleType
      : "carros";
  const brandCode = String(input?.brandCode ?? "").trim();
  const modelCode = String(input?.modelCode ?? "").trim();
  const yearCode = String(input?.yearCode ?? "").trim();

  if (!brandCode || !modelCode || !yearCode) {
    return { ok: false, reason: "missing_codes" };
  }

  if (isDisabled()) {
    return { ok: false, reason: "disabled_by_env" };
  }

  const now = Date.now();
  cleanupExpired(now);
  const key = cacheKey({ vehicleType, brandCode, modelCode, yearCode });
  const cached = memoryCache.get(key);
  if (cached && cached.expiresAt > now) {
    return { ok: true, ...cached.value, fromCache: true };
  }

  const fetchImpl = typeof deps.fetch === "function" ? deps.fetch : fetchWithTimeout;
  const url =
    `${getBaseUrl()}/${vehicleType}/marcas/` +
    `${encodeURIComponent(brandCode)}/modelos/${encodeURIComponent(modelCode)}/` +
    `anos/${encodeURIComponent(yearCode)}`;

  let res;
  try {
    res = await fetchImpl(url);
  } catch (err) {
    return {
      ok: false,
      reason: "network_error",
      detail: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
    };
  }

  if (!res?.ok) {
    return { ok: false, reason: "provider_error", status: res?.status ?? 0 };
  }

  let data;
  try {
    data = await res.json();
  } catch {
    return { ok: false, reason: "invalid_json" };
  }

  const price = parseFipePriceBr(data?.Valor ?? data?.price);
  if (!Number.isFinite(price) || price <= 0) {
    return { ok: false, reason: "no_price_in_response" };
  }

  const value = {
    price,
    fipeCode: String(data?.CodigoFipe ?? data?.fipeCode ?? "").trim() || null,
    referenceMonth:
      String(data?.MesReferencia ?? data?.referenceMonth ?? "").trim() || null,
    raw: data ?? {},
  };

  memoryCache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
  return { ok: true, ...value, fromCache: false };
}

/** Limpa o cache em memória — usado em testes para isolar runs. */
export function __resetFipeProviderCache() {
  memoryCache.clear();
}

/** Inspeção do tamanho atual do cache (telemetria/teste). */
export function __fipeProviderCacheSize() {
  return memoryCache.size;
}
