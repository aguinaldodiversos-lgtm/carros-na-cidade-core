/* eslint-disable no-console */

const RAW_BASE = String(process.env.BASE_URL || "http://localhost:4000").trim();

function normalizeBaseUrl(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) {
    throw new Error("BASE_URL não definida.");
  }

  try {
    const url = new URL(trimmed);
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.search = "";
    url.hash = "";
    return url.toString().replace(/\/+$/, "");
  } catch {
    throw new Error(`BASE_URL inválida: ${trimmed}`);
  }
}

const BASE = normalizeBaseUrl(RAW_BASE);
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000);
const RETRIES = Number(process.env.SMOKE_RETRIES || 1);
const MAX_LATENCY_MS = Number(process.env.SMOKE_MAX_LATENCY_MS || 1200);
const BURST_COUNT = Number(process.env.SMOKE_BURST_COUNT || 10);
const BURST_CONCURRENCY = Number(process.env.SMOKE_BURST_CONCURRENCY || 5);

const ORIGIN = String(process.env.SMOKE_ORIGIN || "").trim(); // ex: https://carrosnacidade.com
const ENABLE_AUTH = String(process.env.SMOKE_AUTH || "true").toLowerCase() === "true";
const ENABLE_METRICS = String(process.env.SMOKE_METRICS || "true").toLowerCase() === "true";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtMs(ms) {
  return `${Math.round(ms)}ms`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function buildUrl(path) {
  const normalizedPath = String(path || "").trim();
  if (!normalizedPath.startsWith("/")) {
    throw new Error(`Path inválido no smoke: "${path}"`);
  }

  return new URL(normalizedPath, `${BASE}/`).toString();
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

async function request(path, { method = "GET", headers = {}, body } = {}) {
  const url = buildUrl(path);
  const reqHeaders = { ...headers };

  if (ORIGIN) reqHeaders.origin = ORIGIN;
  if (body !== undefined && !reqHeaders["content-type"] && !reqHeaders["Content-Type"]) {
    reqHeaders["content-type"] = "application/json";
  }

  const started = Date.now();
  const res = await fetchWithTimeout(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const durationMs = Date.now() - started;
  const contentType = String(res.headers.get("content-type") || "");
  const cacheControl = String(res.headers.get("cache-control") || "");
  const text = await res.text();

  let json = null;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      // mantém text
    }
  }

  return {
    ok: res.ok,
    status: res.status,
    path,
    url,
    durationMs,
    headers: res.headers,
    contentType,
    cacheControl,
    text,
    json,
  };
}

async function withRetries(fn) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < RETRIES) await sleep(250);
    }
  }
  throw lastErr;
}

/* =========================
   Output helpers
========================= */

function lineOk(res, extra = "") {
  const slow = res.durationMs > MAX_LATENCY_MS ? " ⚠️SLOW" : "";
  return `✅ ${res.status} ${res.path} (${fmtMs(res.durationMs)})${slow}${extra ? " " + extra : ""}`;
}

function lineExpected(res, expected) {
  const slow = res.durationMs > MAX_LATENCY_MS ? " ⚠️SLOW" : "";
  return `✅ EXPECTED ${res.status} ${res.path} (${fmtMs(res.durationMs)})${slow} [expected ${expected.join("/")}]`;
}

function lineWarn(msg) {
  return `⚠️  ${msg}`;
}

function briefText(text) {
  const t = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  return t.length > 220 ? `${t.slice(0, 220)}…` : t;
}

/* =========================
   Assertions
========================= */

function expectStatus(res, allowed, label) {
  assert(
    allowed.includes(res.status),
    `${label}: esperado ${allowed.join("/")} e veio ${res.status}`
  );
}

function expectNot5xx(res, label) {
  assert(res.status < 500, `${label}: não pode ser 5xx (veio ${res.status})`);
}

function expectJson(res, label) {
  assert(
    res.contentType.includes("application/json"),
    `${label}: esperado JSON (content-type: ${res.contentType || "n/a"})`
  );
  assert(res.json !== null, `${label}: JSON inválido (parse falhou). Body: ${briefText(res.text)}`);
}

function expectXml(res, label) {
  const looksXml = res.contentType.includes("xml") || res.text.trim().startsWith("<?xml");
  assert(looksXml, `${label}: esperado XML (content-type: ${res.contentType || "n/a"})`);
  assert(
    res.text.includes("<urlset") || res.text.includes("<sitemapindex"),
    `${label}: XML sem urlset/sitemapindex`
  );
}

function extractArrayFromJson(json) {
  if (!json) return null;
  if (Array.isArray(json)) return json;

  const candidates = ["items", "data", "results", "ads", "rows", "list"];
  for (const key of candidates) {
    if (Array.isArray(json[key])) return json[key];
  }

  for (const v of Object.values(json)) {
    if (Array.isArray(v)) return v;
  }
  return null;
}

function extractIds(list) {
  if (!Array.isArray(list)) return [];
  const keys = ["id", "ad_id", "adId", "uuid"];
  const ids = [];
  for (const item of list) {
    if (item && typeof item === "object") {
      for (const k of keys) {
        if (item[k] !== undefined && item[k] !== null) {
          ids.push(String(item[k]));
          break;
        }
      }
    }
  }
  return ids;
}

function findDuplicates(arr) {
  const seen = new Set();
  const dup = new Set();
  for (const v of arr) {
    if (seen.has(v)) dup.add(v);
    else seen.add(v);
  }
  return [...dup];
}

function parseSitemapLocs(xmlText) {
  const locs = [];
  const re = /<loc>\s*([^<]+)\s*<\/loc>/gim;
  let m;
  while ((m = re.exec(xmlText))) {
    locs.push(m[1].trim());
  }
  return locs;
}

/* =========================
   Test runner
========================= */

async function run() {
  console.log(`\nSMOKE @ ${BASE}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms | Retries: ${RETRIES}`);
  console.log(`Max latency warn: ${MAX_LATENCY_MS}ms`);
  if (ORIGIN) console.log(`Origin header: ${ORIGIN}`);
  console.log("");

  const results = [];
  const warnings = [];

  async function test(name, fn, { required = true, expectedStatuses = null, validate } = {}) {
    try {
      const res = await withRetries(fn);

      if (Array.isArray(expectedStatuses)) {
        expectStatus(res, expectedStatuses, name);
        expectNot5xx(res, name);
        if (validate) await validate(res);
        results.push({ name, required, ok: true, expected: expectedStatuses, res });
        console.log(lineExpected(res, expectedStatuses));
        return res;
      }

      if (validate) await validate(res);

      results.push({ name, required, ok: true, expected: null, res });
      console.log(lineOk(res));
      return res;
    } catch (err) {
      results.push({ name, required, ok: false, error: err, res: null });
      console.log(`❌ ERR ${name}: ${err.message}`);
      return null;
    }
  }

  /* =========================
     1) Root / Health
  ========================= */

  await test("HEAD /", () => request("/", { method: "HEAD" }), {
    validate: (r) => expectStatus(r, [200], "HEAD /"),
  });

  await test("GET /", () => request("/", { method: "GET" }), {
    validate: (r) => {
      expectStatus(r, [200], "GET /");
      expectJson(r, "GET /");
      if (r.json && typeof r.json === "object") {
        if (!("success" in r.json)) {
          warnings.push("GET /: JSON sem campo 'success' (não bloqueia).");
        }
      }
    },
  });

  await test("GET /health/meta", () => request("/health/meta"), {
    validate: (r) => {
      expectStatus(r, [200], "/health/meta");
      expectJson(r, "/health/meta");
      const rid = r.json?.requestId;
      if (rid && !UUID_RE.test(String(rid))) {
        warnings.push(`/health/meta: requestId não parece UUID: ${rid}`);
      }
    },
  });

  if (ORIGIN) {
    await test(
      "OPTIONS /health/meta (CORS preflight)",
      () =>
        request("/health/meta", {
          method: "OPTIONS",
          headers: {
            "access-control-request-method": "GET",
            "access-control-request-headers": "content-type",
          },
        }),
      {
        required: true,
        validate: (r) => {
          expectStatus(r, [200, 204], "CORS preflight");
          const acao = String(r.headers.get("access-control-allow-origin") || "");
          if (!acao) warnings.push("CORS: sem access-control-allow-origin no preflight.");
        },
      }
    );
  } else {
    warnings.push("SMOKE_ORIGIN não definido: pulando teste de CORS preflight.");
  }

  /* =========================
     2) SEO Sitemap
  ========================= */

  const sitemapRes = await test(
    "GET /api/public/seo/sitemap",
    () => request("/api/public/seo/sitemap"),
    {
      validate: (r) => {
        expectStatus(r, [200], "sitemap");
        expectXml(r, "sitemap");
        const locs = parseSitemapLocs(r.text);
        if (!locs.length) warnings.push("sitemap: nenhum <loc> encontrado (estranho).");
        const dup = findDuplicates(locs);
        if (dup.length) {
          warnings.push(`sitemap: URLs duplicadas detectadas (ex.: ${dup.slice(0, 3).join(", ")})`);
        }
        if (r.text.length > 5_000_000) {
          warnings.push("sitemap: XML maior que 5MB (pode ser problema).");
        }
      },
    }
  );

  /* =========================
     3) Ads (core)
  ========================= */

  const adsListRes = await test(
    "GET /api/ads?page=1&limit=10",
    () => request("/api/ads?page=1&limit=10"),
    {
      validate: (r) => {
        expectStatus(r, [200], "ads list");
        expectJson(r, "ads list");

        const arr = extractArrayFromJson(r.json);
        if (!arr) {
          warnings.push("ads list: resposta JSON não contém array (items/data/results/ads).");
        } else {
          const ids = extractIds(arr);
          const dups = findDuplicates(ids);
          if (dups.length) {
            warnings.push(
              `ads list: IDs duplicados detectados (ex.: ${dups.slice(0, 3).join(", ")})`
            );
          }
        }
      },
    }
  );

  await test(
    "GET /api/ads?q=civic&city=atibaia&sort=recent",
    () => request("/api/ads?q=civic&city=atibaia&page=1&limit=10&sort=recent"),
    {
      validate: (r) => {
        expectStatus(r, [200], "ads search");
        expectJson(r, "ads search");
      },
    }
  );

  /* =========================
     4) Negative validation (expected)
  ========================= */

  await test(
    "BAD year_min>year_max",
    () => request("/api/ads?year_min=2025&year_max=2010&page=1&limit=10"),
    { expectedStatuses: [400, 422] }
  );

  await test("BAD sort invalid", () => request("/api/ads?sort=__invalid__&page=1&limit=10"), {
    expectedStatuses: [400, 422],
  });

  await test("BAD limit too high", () => request("/api/ads?page=1&limit=9999"), {
    expectedStatuses: [400, 422],
  });

  /* =========================
     5) Not found must be 404 (never 500)
  ========================= */

  await test("GET /__smoke_not_found__ (should be 404)", () => request("/__smoke_not_found__"), {
    expectedStatuses: [404],
  });

  /* =========================
     6) Burst/concurrency stability
  ========================= */

  await test("BURST /health/meta (stability)", async () => {
    const total = BURST_COUNT;
    const conc = Math.max(1, Math.min(BURST_CONCURRENCY, total));

    const reqs = Array.from({ length: total }, (_, i) => i);
    const ids = [];
    let failures = 0;
    let any5xx = 0;

    const worker = async () => {
      while (reqs.length) {
        const idx = reqs.pop();
        if (idx === undefined) break;
        try {
          const r = await request("/health/meta");
          if (r.status >= 500) any5xx += 1;
          if (r.status !== 200) failures += 1;
          if (r.json?.requestId) ids.push(String(r.json.requestId));
        } catch {
          failures += 1;
        }
      }
    };

    await Promise.all(Array.from({ length: conc }, () => worker()));

    assert(any5xx === 0, `burst: detectado ${any5xx} respostas 5xx`);
    assert(failures === 0, `burst: falhas=${failures}/${total}`);
    const dup = findDuplicates(ids);
    if (dup.length) {
      warnings.push(`burst: requestId duplicado detectado (ex.: ${dup.slice(0, 3).join(", ")})`);
    }

    return {
      ok: true,
      status: 200,
      path: `/health/meta x${total} (conc ${conc})`,
      url: buildUrl("/health/meta"),
      durationMs: 0,
      contentType: "application/json",
      headers: new Headers(),
      text: "",
      json: null,
    };
  });

  /* =========================
     7) Auth sanity (optional)
  ========================= */

  if (ENABLE_AUTH) {
    await test(
      "POST /api/auth/login (missing fields)",
      () => request("/api/auth/login", { method: "POST", body: {} }),
      { required: false, expectedStatuses: [400, 401, 422] }
    );

    await test(
      "POST /api/auth/forgot-password",
      () =>
        request("/api/auth/forgot-password", {
          method: "POST",
          body: { email: "smoke+notexists@carrosnacidade.com" },
        }),
      { required: false, expectedStatuses: [200, 400, 422] }
    );
  } else {
    warnings.push("SMOKE_AUTH=false: pulando sanity de Auth.");
  }

  /* =========================
     8) Metrics endpoint (optional)
  ========================= */

  if (ENABLE_METRICS) {
    await test("GET /metrics (optional)", () => request("/metrics"), {
      required: false,
      validate: (r) => {
        expectNot5xx(r, "/metrics");
        if (![200, 403, 404].includes(r.status)) {
          warnings.push(`/metrics: status incomum ${r.status}`);
        }
      },
    });
  } else {
    warnings.push("SMOKE_METRICS=false: pulando /metrics.");
  }

  /* =========================
     Summary
  ========================= */

  console.log("\n---- SUMMARY ----");
  const required = results.filter((t) => t.required);
  const optional = results.filter((t) => !t.required);

  const reqFails = required.filter((t) => !t.ok);
  const optFails = optional.filter((t) => !t.ok);

  console.log(`Required: ${required.length} | Failed: ${reqFails.length}`);
  console.log(`Optional: ${optional.length} | Failed: ${optFails.length}`);

  const withRes = results.filter((r) => r.res && typeof r.res.durationMs === "number");
  withRes.sort((a, b) => (b.res.durationMs || 0) - (a.res.durationMs || 0));
  const topSlow = withRes.slice(0, 5);
  console.log("\nTop slow:");
  for (const t of topSlow) {
    if (t.res.durationMs > 0) {
      console.log(`- ${t.res.path}: ${fmtMs(t.res.durationMs)}`);
    }
  }

  if (warnings.length) {
    console.log("\nWarnings:");
    for (const w of warnings) console.log(lineWarn(w));
  }

  if (reqFails.length) {
    console.log("\nRequired failures:");
    for (const f of reqFails) {
      console.log(`- ${f.name}: ${f.error?.message || "unknown error"}`);
    }
    process.exit(1);
  }

  if (optFails.length) {
    console.log("\nOptional failures (não bloqueiam):");
    for (const f of optFails) {
      console.log(`- ${f.name}: ${f.error?.message || "unknown error"}`);
    }
  }

  if (sitemapRes?.text && sitemapRes.text.length < 50) {
    console.log(lineWarn("sitemap: body muito pequeno, revise endpoint."));
  }
  if (adsListRes?.json && !extractArrayFromJson(adsListRes.json)) {
    console.log(
      lineWarn("ads list: não achei array na resposta; smoke está flexível, mas revise o formato.")
    );
  }

  console.log("\n✅ SMOKE PASSED");
  process.exit(0);
}

run().catch((e) => {
  console.error("SMOKE FATAL:", e?.message || e);
  process.exit(1);
});
