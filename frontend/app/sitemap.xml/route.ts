// frontend/app/sitemap.xml/route.ts
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.trim() ||
  "https://carros-na-cidade-api.onrender.com";

const SITE_BASE =
  process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
  process.env.SITE_URL?.trim() ||
  "https://carrosnacidade.com";

function xmlEscape(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function buildFallbackSitemap(nowIso: string) {
  const urls = [
    "/",
    "/anuncios",
    "/vender",
    "/planos",
    "/tabela-fipe",
    "/financiar",
    "/noticias",
  ].map((path) => `${SITE_BASE}${path}`);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (loc) => `  <url>
    <loc>${xmlEscape(loc)}</loc>
    <lastmod>${nowIso}</lastmod>
    <changefreq>daily</changefreq>
    <priority>${loc.endsWith("/") ? "1.0" : "0.8"}</priority>
  </url>`
  )
  .join("\n")}
</urlset>`;

  return body;
}

async function fetchTextWithTimeout(url: string, ms = 8000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "carros-na-cidade-frontend-sitemap" },
      cache: "no-store",
    });
    const text = await res.text();
    return { ok: res.ok, status: res.status, text };
  } finally {
    clearTimeout(t);
  }
}

export async function GET() {
  const nowIso = new Date().toISOString();

  // 1) Tenta usar sitemap do BACKEND (fonte de verdade)
  try {
    const url = `${API_BASE.replace(/\/$/, "")}/api/public/seo/sitemap`;
    const { ok, text } = await fetchTextWithTimeout(url, 10000);

    // validação mínima: precisa parecer XML de sitemap
    if (ok && text && text.includes("<urlset")) {
      return new Response(text, {
        status: 200,
        headers: {
          "content-type": "application/xml; charset=utf-8",
          "cache-control": "public, max-age=300, s-maxage=300",
        },
      });
    }
  } catch {
    // cai no fallback
  }

  // 2) Fallback (não quebra SEO)
  const xml = buildFallbackSitemap(nowIso);
  return new Response(xml, {
    status: 200,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": "public, max-age=300, s-maxage=300",
    },
  });
}
