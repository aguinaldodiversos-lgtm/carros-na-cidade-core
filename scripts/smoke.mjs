// scripts/smoke.mjs
const BASE = process.env.BASE_URL || "https://carros-na-cidade-api.onrender.com";

async function hit(path, { method = "GET", body } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, path, json, text: json ? null : text.slice(0, 200) };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

(async () => {
  const checks = [];

  checks.push(await hit("/", { method: "GET" }));
  checks.push(await hit("/health/meta"));
  checks.push(await hit("/api/public/seo/sitemap", { method: "GET" }).catch(e => ({ ok:false, status:0, path:"/api/public/seo/sitemap", text:e.message })));

  // Ads (ajuste o endpoint real se necessário)
  checks.push(await hit("/api/ads?page=1&limit=10"));
  checks.push(await hit("/api/ads?q=civic&city=atibaia&page=1&limit=10&sort=recent"));

  // Validação: year_min > year_max deve dar 400
  const bad = await hit("/api/ads?year_min=2025&year_max=2010&page=1&limit=10");
  assert(bad.status === 400 || bad.status === 422, `Esperado 400/422 no range inválido, veio ${bad.status}`);

  for (const c of checks) {
    console.log(`${c.ok ? "✅" : "❌"} ${c.status} ${c.path}`);
    if (!c.ok && c.text) console.log("   ", c.text);
  }

  // hard fail se algum check essencial falhar
  assert(checks[0].ok, "GET / falhou");
  assert(checks[1].ok, "GET /health/meta falhou");
  process.exit(0);
})().catch((e) => {
  console.error("SMOKE FAIL:", e.message);
  process.exit(1);
});
