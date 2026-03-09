// frontend/app/sitemaps/regiao/[state].xml/route.ts

import { NextResponse } from "next/server";
import { buildSitemapXml } from "../../../../lib/seo/sitemap-xml";
import { fetchPublicSitemapByRegion } from "../../../../lib/seo/sitemap-client";

// ✅ força runtime (não tenta “pré-gerar” isso no build/export)
export const dynamic = "force-dynamic";
export const revalidate = 3600; // 1h

type Ctx = {
  params?: { state?: string };
};

function xmlResponse(xml: string, status = 200) {
  return new NextResponse(xml, {
    status,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}

export async function GET(_req: Request, ctx: Ctx) {
  const stateRaw = ctx?.params?.state ?? "";
  const normalizedState = String(stateRaw).trim().toUpperCase();

  // Se vier inválido/não informado, devolve sitemap vazio (não explode)
  if (!normalizedState || normalizedState.length !== 2) {
    return xmlResponse(buildSitemapXml([]), 200);
  }

  try {
    const entries = await fetchPublicSitemapByRegion(normalizedState, 50000);
    return xmlResponse(buildSitemapXml(entries), 200);
  } catch {
    // Se API cair durante request/build, não derruba o deploy
    return xmlResponse(buildSitemapXml([]), 200);
  }
}
