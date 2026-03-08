// scripts/smoke.mjs
/* eslint-disable no-console */

const BASE = (process.env.BASE_URL || "http://localhost:4000").replace(/\/+$/, "");
const TIMEOUT_MS = Number(process.env.SMOKE_TIMEOUT_MS || 8000);
const RETRIES = Number(process.env.SMOKE_RETRIES || 1);

// Opcional: testar CORS (envia Origin)
const ORIGIN = process.env.SMOKE_ORIGIN || "";

// Opcional: testar Auth sem criar usuário
// (Só valida que endpoints respondem corretamente e não dão 500)
const ENABLE_AUTH = String(process.env.SMOKE_AUTH || "true").toLowerCase() === "true";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function fmtMs(ms) {
  return `${Math.round(ms)}ms`;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
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
  const url = `${BASE}${path}`;
  const reqHeaders = { ...headers };

  if (ORIGIN) reqHeaders.origin = ORIGIN;
  if (body !== undefined) reqHeaders["content-type"] = "application/json";

  const started = Date.now();
  const res = await fetchWithTimeout(url, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const durationMs = Date.now() - started;
  const contentType = String(res.headers.get("content-type") || "");

  const text = await res.text();
  let json = null;
  if (contentType.includes("application/json")) {
    try {
      json = JSON.parse(text);
    } catch {
      // mantém text
    }
  }

  return { ok: res.ok, status: res.status, path, durationMs, contentType, text, json };
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

function okLine(r) {
  return `${r.ok ? "✅" : "❌"} ${r.status} ${r.path} (${fmtMs(r.durationMs)})`;
}

function warnLine(msg) {
  return `⚠️  ${msg}`;
}

async function expectStatus(res, allowed, label) {
  const ok = allowed.includes(res.status);
  assert(ok, `${label}: esperado status ${allowed.join("/")} e veio ${res.status}`);
}

async function expectNot5xx(res, label) {
  assert(res.status < 500, `${label}: não pode ser 5xx (veio ${res.status})`);
}

async function expectJson(res, label) {
  assert(
    res.contentType.includes("application/json"),
    `${label}: esperado JSON (content-type: ${res.contentType || "n/a"})`
  );
  assert(res.json !== null, `${label}: JSON inválido (parse falhou)`);
}

async function expectXml(res, label) {
  assert(
    res.contentType.includes("xml") || res.text.trim().startsWith("<?xml"),
    `${label}: esperado XML (content-type: ${res.contentType || "n/a"})`
  );
  assert(res.text.includes("<urlset") || res.text.includes("<sitemapindex"), `${label}: XML sem urlset/sitemapindex`);
}

function briefBody(res) {
  const t = (res.text || "").replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 160)}…` : t;
}

async function run() {
  console.log(`\nSMOKE @ ${BASE}`);
  if (ORIGIN) console.log(`Origin header: ${ORIGIN}`);
  console.log(`Timeout: ${TIMEOUT_MS}ms | Retries: ${RETRIES}\n`);

  const results = [];
  const required = [];

  async function test(name, fn, { isRequired = true } = {}) {
    try {
      const res = await withRetries(fn);
      results.push({ name, res, ok: true, required: isRequired });
      console.log(okLine(res));
      return res;
    } catch (err) {
      results.push({ name, res: null, ok: false, required: isRequired, error: err });
      console.log(`❌ ERR ${name}: ${err.message}`);
      return null;
    }
  }

  // ---------------------------
  // 1) Health / root
  // ---------------------------
  required.push(
    await test("HEAD /", () => request("/", { method: "HEAD" })),
    await test("GET /", async () => {
      const r = await request("/", { method: "GET" });
      await expectStatus(r, [200], "GET /");
      await expectJson(r, "GET /");
      return r;
    }),
    await test("GET /health/meta", async () => {
      const r = await request("/health/meta");
      await expectStatus(r, [200], "/health/meta");
      await expectJson(r, "/health/meta");
      return r;
    })
  );

  // ---------------------------
  // 2) SEO sitemap (não pode 500)
  // ---------------------------
  required.push(
    await test("GET /api/public/seo/sitemap", async () => {
      const r = await request("/api/public/seo/sitemap");
      await expectStatus(r, [200], "sitemap");
      await expectXml(r, "sitemap");
      return r;
    })
  );

  // ---------------------------
  // 3) Ads list + filtros (core)
  // ---------------------------
  required.push(
    await test("GET /api/ads?page=1&limit=10", async () => {
      const r = await request("/api/ads?page=1&limit=10");
      await expectStatus(r, [200], "ads list");
      await expectJson(r, "ads list");
      return r;
    }),
    await test("GET /api/ads?q=civic&city=atibaia&sort=recent", async () => {
      const r = await request("/api/ads?q=civic&city=atibaia&page=1&limit=10&sort=recent");
      await expectStatus(r, [200], "ads search");
      await expectJson(r, "ads search");
      return r;
    })
  );

  // ---------------------------
  // 4) Validações negativas (garantir que schema não explode)
  //    Aqui o esperado é 400/422, mas nunca 500.
  // ---------------------------
  required.push(
    await test("BAD range year_min>year_max", async () => {
      const r = await request("/api/ads?year_min=2025&year_max=2010&page=1&limit=10");
      await expectStatus(r, [400, 422], "bad year range");
      await expectNot5xx(r, "bad year range");
      return r;
    }),
    await test("BAD sort invalid", async () => {
      const r = await request("/api/ads?sort=__invalid__&page=1&limit=10");
      await expectStatus(r, [400, 422], "bad sort");
      await expectNot5xx(r, "bad sort");
      return r;
    }),
    await test("BAD limit too high", async () => {
      const r = await request("/api/ads?page=1&limit=9999");
      await expectStatus(r, [400, 422], "bad limit");
      await expectNot5xx(r, "bad limit");
      return r;
    })
  );

  // ---------------------------
  // 5) Auth sanity (não cria usuário; só garante que não dá 500)
  // ---------------------------
  if (ENABLE_AUTH) {
    await test(
      "POST /api/auth/login (missing fields -> 400/422)",
      async () => {
        const r = await request("/api/auth/login", { method: "POST", body: {} });
        await expectStatus(r, [400, 401, 422], "auth login empty");
        await expectNot5xx(r, "auth login empty");
        return r;
      },
      { isRequired: false }
    );

    await test(
      "POST /api/auth/forgot-password (should be 200, no enumeration)",
      async () => {
        const r = await request("/api/auth/forgot-password", {
          method: "POST",
          body: { email: "smoke+notexists@carrosnacidade.com" },
        });
        // muitas implementações retornam 200 sempre
        await expectStatus(r, [200, 400, 422], "forgot password");
        await expectNot5xx(r, "forgot password");
        return r;
      },
      { isRequired: false }
    );
  } else {
    console.log(warnLine("SMOKE_AUTH=false (pulando Auth sanity)"));
  }

  // ---------------------------
  // Summary
  // ---------------------------
  console.log("\n---- SUMMARY ----");
  const reqFails = results.filter((t) => t.required && !t.ok);
  const optFails = results.filter((t) => !t.required && !t.ok);

  console.log(`Required: ${results.filter((t) => t.required).length} | Failed: ${reqFails.length}`);
  console.log(`Optional: ${results.filter((t) => !t.required).length} | Failed: ${optFails.length}`);

  if (reqFails.length) {
    console.log("\nRequired failures:");
    for (const f of reqFails) console.log(`- ${f.name}: ${f.error?.message || "unknown error"}`);
    process.exit(1);
  }

  // Se optional falhar, só alerta
  if (optFails.length) {
    console.log("\nOptional failures (não bloqueiam):");
    for (const f of optFails) console.log(`- ${f.name}: ${f.error?.message || "unknown error"}`);
  }

  // Pequeno “info” para debug rápido quando algo der errado
  const lastBad = results.findLast?.((t) => t.ok === false) || null;
  if (lastBad?.res) console.log("Last bad response:", briefBody(lastBad.res));

  console.log("\n✅ SMOKE PASSED");
  process.exit(0);
}

run().catch((e) => {
  console.error("SMOKE FATAL:", e?.message || e);
  process.exit(1);
});
